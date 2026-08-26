
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const cacheKey = (script) => {
  const h = createHash('sha256');
  h.update(script.movieKey ?? '');
  h.update(script.grade ?? '');
  h.update(String(script.totalDuration ?? 0));
  for (const shot of script.shots ?? []) {
    h.update(shot.scene);
    h.update(String(shot.duration));
    h.update(shot.titleCard?.text ?? '');
  }
  return h.digest('hex').slice(0, 16);
};

export class DiskCache {
  #dir;
  #lru;
  #maxEntries;

    constructor(dir, maxEntries = 200) {
    this.#dir = dir;
    this.#lru = new Map();
    this.#maxEntries = maxEntries;
  }

  async init() {
    await mkdir(this.#dir, { recursive: true });
  }

  #touch(key) {
    if (this.#lru.has(key)) {
      this.#lru.delete(key);
    }
    this.#lru.set(key, Date.now());
    while (this.#lru.size > this.#maxEntries) {
      const oldest = this.#lru.keys().next().value;
      this.#lru.delete(oldest);
      const filePath = path.join(this.#dir, oldest);
      writeFile(filePath, Buffer.alloc(0)).catch(() => {});
    }
  }

    async get(key, ext) {
    const filePath = path.join(this.#dir, `${key}${ext}`);
    try {
      const info = await stat(filePath);
      if (info.size === 0) return null;
      this.#touch(`${key}${ext}`);
      return readFile(filePath);
    } catch {
      return null;
    }
  }

    async set(key, ext, data) {
    const name = `${key}${ext}`;
    this.#touch(name);
    await writeFile(path.join(this.#dir, name), data);
  }

    async has(key, ext) {
    const filePath = path.join(this.#dir, `${key}${ext}`);
    try {
      const info = await stat(filePath);
      return info.size > 0;
    } catch {
      return false;
    }
  }
}
