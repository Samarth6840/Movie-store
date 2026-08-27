import { mkdir, readFile, writeFile, readdir, stat, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/**
 * A disk-backed LRU cache bounded by total bytes (and optionally entry count).
 *
 * Tracks `lastAccess` and `size` per entry in a `.meta.json` file at the cache
 * root, and evicts the least-recently-used entries once the byte cap is exceeded.
 * Writes are atomic (temp file + rename) so a crash never leaves a partial entry.
 */
export class LruDiskCache {
  #dir;
  #maxBytes;
  #maxEntries;
  #meta = new Map();
  #total = 0;
  #initialized = false;

  constructor(dir, { maxBytes = Infinity, maxEntries = 1000 } = {}) {
    this.#dir = dir;
    this.#maxBytes = maxBytes;
    this.#maxEntries = maxEntries;
  }

  get dir() {
    return this.#dir;
  }

  async init() {
    if (this.#initialized) return this;
    await mkdir(this.#dir, { recursive: true });
    await this.#loadMeta();
    this.#initialized = true;
    return this;
  }

  async #metaPath() {
    return path.join(this.#dir, '.meta.json');
  }

  async #loadMeta() {
    try {
      const raw = await readFile(await this.#metaPath(), 'utf8');
      const parsed = JSON.parse(raw);
      const now = Date.now();
      for (const [name, info] of Object.entries(parsed)) {
        if (!info || typeof info.lastAccess !== 'number') continue;
        const filePath = path.join(this.#dir, name);
        // Confirm the file still exists and reconcile its size with the disk.
        let size = info.size ?? 0;
        try {
          const s = await stat(filePath);
          if (s.size === 0) {
            await this.#removeEntry(name);
            continue;
          }
          size = s.size;
        } catch {
          await this.#removeEntry(name);
          continue;
        }
        this.#meta.set(name, { ...info, size, lastAccess: now });
        this.#total += size;
      }
    } catch {
      this.#meta = new Map();
      this.#total = 0;
    }
  }

  async #persistMeta() {
    const snapshot = {};
    for (const [name, info] of this.#meta) {
      snapshot[name] = { size: info.size, lastAccess: info.lastAccess, key: info.key ?? undefined };
    }
    const tmp = `${await this.#metaPath()}.tmp`;
    const final = await this.#metaPath();
    await writeFile(tmp, JSON.stringify(snapshot));
    await rename(tmp, final);
  }

  async #removeEntry(name) {
    const info = this.#meta.get(name);
    if (info) this.#total -= info.size;
    await unlink(path.join(this.#dir, name)).catch(() => {});
    this.#meta.delete(name);
  }

  /** Absolute path for a cached name. */
  pathOf(name) {
    return path.join(this.#dir, name);
  }

  /**
   * Read an entry if it exists, touching its lastAccess on a hit.
   * @param {string} name Cache file name (may include a subpath relative to dir).
   * @returns {Promise<Buffer|null>}
   */
  async get(name) {
    if (!this.#initialized) await this.init();
    const filePath = path.join(this.#dir, name);
    try {
      const info = await stat(filePath);
      if (info.size === 0) return null;
      const entry = this.#meta.get(name);
      if (entry) {
        entry.lastAccess = Date.now();
      } else {
        this.#meta.set(name, { size: info.size, lastAccess: Date.now(), key: null });
        this.#total += info.size;
      }
      const buffer = await readFile(filePath);
      this.#persistMeta().catch(() => {});
      return buffer;
    } catch {
      return null;
    }
  }

  async has(name) {
    if (!this.#initialized) await this.init();
    return this.#meta.has(name);
  }

  /**
   * Store a buffer, then evict least-recently-used entries if over the cap.
   * @param {string} name Cache file name.
   * @param {Buffer} data
   * @param {object} [meta] Extra metadata (e.g. source key) to persist.
   */
  async set(name, data, meta = {}) {
    if (!this.#initialized) await this.init();
    const filePath = path.join(this.#dir, name);

    // Replace any existing entry's accounted size.
    const existing = this.#meta.get(name);
    if (existing) this.#total -= existing.size;

    const tmp = `${filePath}.tmp`;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(tmp, data);
    await rename(tmp, filePath);

    const size = data.length;
    this.#meta.set(name, { size, lastAccess: Date.now(), key: meta.key ?? existing?.key ?? null });
    this.#total += size;

    await this.#evict();
    await this.#persistMeta();
  }

  /** Touch an entry's lastAccess without reading it. */
  async touch(name) {
    if (!this.#initialized) await this.init();
    const entry = this.#meta.get(name);
    if (!entry) return;
    entry.lastAccess = Date.now();
    await this.#persistMeta().catch(() => {});
  }

  async remove(name) {
    if (!this.#initialized) await this.init();
    if (this.#meta.has(name)) {
      await this.#removeEntry(name);
      await this.#persistMeta().catch(() => {});
    }
  }

  /** Evict LRU entries until total size and count are within the caps. */
  async #evict() {
    if (this.#total <= this.#maxBytes && this.#meta.size <= this.#maxEntries) return;
    const entries = [...this.#meta.entries()].sort((a, b) => a[1].lastAccess - b[1].lastAccess);
    for (const [name] of entries) {
      if (this.#total <= this.#maxBytes && this.#meta.size <= this.#maxEntries) break;
      await this.#removeEntry(name).catch(() => {});
    }
    await this.#persistMeta().catch(() => {});
  }

  /** Synchronously reclaim space without awaiting (fire-and-forget). */
  evictSoon() {
    this.#evict().catch(() => {});
  }

  stats() {
    return {
      dir: this.#dir,
      entries: this.#meta.size,
      bytes: this.#total,
      maxBytes: this.#maxBytes,
      maxEntries: this.#maxEntries,
    };
  }

  /**
   * Delete files on disk that are not tracked in metadata and fail `shouldKeep`
   * (if provided). Useful for migrating away from a previous naming scheme or
   * clearing orphaned files. Only called explicitly by a specific cache.
   * @param {(name: string) => boolean} [shouldKeep] Return true to preserve a file.
   */
  async pruneUntracked(shouldKeep = () => true) {
    if (!this.#initialized) await this.init();
    let removed = 0;
    try {
      const entries = await readdir(this.#dir, { withFileTypes: true });
      for (const entry of entries) {
        const { name } = entry;
        if (name === '.meta.json' || name.endsWith('.meta.json')) continue;
        const full = this.#meta.get(name);
        if (full) continue; // tracked
        if (shouldKeep(name)) continue; // explicitly kept
        if (entry.isFile()) {
          await unlink(path.join(this.#dir, name)).catch(() => {});
          removed += 1;
        }
      }
    } catch {
      // ignore
    }
    return removed;
  }
}
