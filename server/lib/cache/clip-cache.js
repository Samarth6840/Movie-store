import path from 'node:path';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { LruDiskCache } from './lru-disk-cache.js';

const DEFAULT_DIR = '.cache/clips';
const DEFAULT_MAX_BYTES = 2048 * 1024 * 1024; // 2048 MB
const DEFAULT_FAILURE_TTL_MS = 60_000; // don't hammer a failing URL

export const clipFileName = (url, ext) =>
  `${createHash('sha256').update(String(url)).digest('hex').slice(0, 16)}.${ext.replace(/^\./, '')}`;

export const clipCacheKey = (url) => createHash('sha256').update(String(url)).digest('hex').slice(0, 16);

/**
 * Disk cache for downloaded source clips, keyed by the *content hash of the
 * source URL* (not a numeric clip id), so a URL that changes origin later does
 * not silently collide with a cached clip. Kept size-bounded via LruDiskCache.
 */
export class ClipCache {
  #dir;
  #disk;
  #failures = new Map();

  constructor(dir = DEFAULT_DIR, maxBytes = DEFAULT_MAX_BYTES) {
    this.#dir = dir;
    this.#disk = new LruDiskCache(dir, { maxBytes, maxEntries: 5000 });
  }

  async init() {
    await this.#disk.init();
    return this;
  }

  fileName(url, ext) {
    return clipFileName(url, ext);
  }

  #sidecarName(fileName) {
    return `${fileName}.meta.json`;
  }

  async get(url, ext) {
    const name = this.fileName(url, ext);
    const buffer = await this.#disk.get(name);
    return buffer ?? null;
  }

  async has(url, ext) {
    return this.#disk.has(this.fileName(url, ext));
  }

  async store(url, ext, buffer) {
    const name = this.fileName(url, ext);
    await this.#disk.set(name, buffer, { key: clipCacheKey(url) });
    await this.#writeSidecar(name, url, buffer.length);
  }

  async #writeSidecar(fileName, url, size) {
    const meta = {
      key: clipCacheKey(url),
      path: path.join(this.#dir, fileName),
      size,
      lastAccess: Date.now(),
    };
    const tmp = path.join(this.#dir, `${this.#sidecarName(fileName)}.tmp`);
    const final = path.join(this.#dir, this.#sidecarName(fileName));
    try {
      await writeFile(tmp, JSON.stringify(meta));
      await rename(tmp, final);
    } catch {
      await unlink(tmp).catch(() => {});
    }
  }

  /** Is this URL currently marked as recently failed? */
  isFailed(url) {
    const expiry = this.#failures.get(url);
    if (expiry === undefined) return false;
    if (Date.now() < expiry) return true;
    this.#failures.delete(url);
    return false;
  }

  /**
   * Return a cached clip, or fetch it. Success is cached to disk (content-hash
   * named). Failures are remembered only in-memory with a short TTL and are
   * *never* written to disk, so a transient failure does not permanently poison
   * the cache.
   *
   * @param {string} url
   * @param {string} ext
   * @param {() => Promise<Buffer>} download Implements the actual network fetch.
   * @returns {Promise<{ buffer: Buffer, fromCache: boolean }>}
   */
  async getOrDownload(url, ext, download) {
    const cached = await this.get(url, ext);
    if (cached) return { buffer: cached, fromCache: true };

    if (this.isFailed(url)) {
      const err = new Error(`Clip download recently failed: ${url}`);
      err.recentFailure = true;
      throw err;
    }

    const buffer = await download().catch((err) => {
      // A failed download is remembered only in-memory with a short TTL and is
      // never written to disk, so a transient failure does not permanently
      // poison the cache.
      this.markFailed(url);
      throw err;
    });
    // Only cache non-empty successful downloads.
    if (buffer && buffer.length > 0) {
      await this.store(url, ext, buffer);
      this.#failures.delete(url);
    }
    return { buffer, fromCache: false };
  }

  /** Record a failed download for a short window (never persisted). */
  markFailed(url) {
    this.#failures.set(url, Date.now() + DEFAULT_FAILURE_TTL_MS);
  }
  async evict() {
    await this.#disk.evictSoon();
  }

  stats() {
    return this.#disk.stats();
  }
}

let clipInstance = null;

export const getClipCache = (dir = process.env.CLIP_CACHE_DIR ?? DEFAULT_DIR, maxBytes = Number(process.env.MAX_CLIP_CACHE_MB ?? 0) * 1024 * 1024 || DEFAULT_MAX_BYTES) => {
  if (!clipInstance) {
    clipInstance = new ClipCache(dir, maxBytes);
  }
  return clipInstance.init();
};
