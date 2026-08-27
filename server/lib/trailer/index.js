

import path from 'node:path';
import { LruDiskCache } from '../cache/lru-disk-cache.js';
import { contextForRecord } from '../generate/page.js';
import { identityFor } from '../generate/movie.js';
import { renderTrailerOffloaded, renderPosterOffloaded } from './render-pool.js';

const TRAILER_CACHE_DIR = process.env.TRAILER_CACHE_DIR ?? path.join(process.cwd(), '.cache', 'trailers');
const MAX_TRAILER_CACHE_BYTES = (Number(process.env.MAX_TRAILER_CACHE_MB ?? 0) || 4096) * 1024 * 1024;
const MAX_CONCURRENT_RENDERS = Math.max(1, Number(process.env.MAX_CONCURRENT_RENDERS ?? 2) || 2);

let trailerCache = null;
const getTrailerCache = async () => {
  if (!trailerCache) {
    trailerCache = new LruDiskCache(TRAILER_CACHE_DIR, { maxBytes: MAX_TRAILER_CACHE_BYTES, maxEntries: 4000 });
    await trailerCache.init();
    // One-time migration: drop orphaned files left by the previous content-hash
    // naming scheme so the size-capped LRU owns every byte on disk.
    await trailerCache.pruneUntracked((name) => !/^[0-9a-f]{16}\.(mp4|jpg)$/.test(name));
  }
  return trailerCache;
};

const trailerFileName = (seed, localeCode, globalIndex) =>
  `${seed}-${localeCode}-${globalIndex}.mp4`;
const posterFileName = (seed, localeCode, globalIndex) =>
  `${seed}-${localeCode}-${globalIndex}.jpg`;

/**
 * Coordinate render requests so that:
 *  - In-flight renders for the same key are deduplicated onto a single Promise.
 *  - At most `MAX_CONCURRENT_RENDERS` ffmpeg-heavy renders run simultaneously.
 *  - Failures clear the in-flight slot so a later request can retry.
 */
class RenderCoordinator {
  #maxConcurrent;
  #active = 0;
  #inFlight = new Map();
  #queue = [];

  constructor(maxConcurrent) {
    this.#maxConcurrent = maxConcurrent;
  }

  async run(key, work) {
    if (this.#inFlight.has(key)) {
      return this.#inFlight.get(key);
    }

    const slot = await this.#acquireSlot();
    await slot.ready;

    // Re-check: while we waited for a slot, another request may have started,
    // completed, or the cache may already have an entry.
    if (this.#inFlight.has(key)) {
      slot.release();
      return this.#inFlight.get(key);
    }

    let promise;
    promise = (async () => {
      try {
        const result = await work();
        return result;
      } finally {
        this.#inFlight.delete(key);
        slot.release();
      }
    })();
    this.#inFlight.set(key, promise);
    return promise;
  }

  #acquireSlot() {
    if (this.#active < this.#maxConcurrent) {
      this.#active += 1;
      return {
        ready: Promise.resolve(),
        release: () => { this.#active -= 1; this.#pump(); },
      };
    }
    return new Promise((resolve) => {
      this.#queue.push(() => {
        this.#active += 1;
        resolve({
          ready: Promise.resolve(),
          release: () => { this.#active -= 1; this.#pump(); },
        });
      });
    });
  }

  #pump() {
    while (this.#active < this.#maxConcurrent && this.#queue.length > 0) {
      const next = this.#queue.shift();
      next();
    }
  }
}

const coordinator = new RenderCoordinator(MAX_CONCURRENT_RENDERS);

export const renderTrailer = ({ seed, localeCode, globalIndex }) =>
  coordinator.run(trailerFileName(seed, localeCode, globalIndex), async () => {
    const disk = await getTrailerCache();
    const fileName = trailerFileName(seed, localeCode, globalIndex);

    // Finished-trailer cache: stream straight from disk if present.
    const cached = await disk.get(fileName);
    if (cached) return cached;

    const finalBuffer = await renderTrailerOffloaded({ seed, localeCode, globalIndex });

    await disk.set(fileName, finalBuffer);
    return finalBuffer;
  });

export const renderPoster = ({ seed, localeCode, globalIndex }) =>
  coordinator.run(posterFileName(seed, localeCode, globalIndex), async () => {
    const disk = await getTrailerCache();
    const fileName = posterFileName(seed, localeCode, globalIndex);

    const cached = await disk.get(fileName);
    if (cached) return cached;

    const jpegBuffer = await renderPosterOffloaded({ seed, localeCode, globalIndex });

    await disk.set(fileName, jpegBuffer);
    return jpegBuffer;
  });

export const TRAILER_FPS = 15;
export const TRAILER_WIDTH = 640;
export const TRAILER_HEIGHT = 360;
export { MAX_CONCURRENT_RENDERS, MAX_TRAILER_CACHE_BYTES, TRAILER_CACHE_DIR, getTrailerCache };

/**
 * Prewarm finished trailers for the first `count` movies of a seed/locale in the
 * background. Renders flow through the same coordinator, so they never exceed
 * `MAX_CONCURRENT_RENDERS` and never duplicate an in-flight render. Already
 * cached trailers are no-ops.
 */
export const prewarmTrailers = ({ seed, localeCode, count = 6, locale, provider }) => {
  const indexes = Array.from({ length: Math.max(1, count) }, (_, i) => i);
  const tasks = indexes.map(async (index) => {
    try {
      const ctx = contextForRecord(provider, seed, localeCode, index);
      const movie = identityFor(locale, ctx, index);
      return renderTrailer({ seed, localeCode, globalIndex: index, movie, locale, provider });
    } catch (err) {
      console.error(`[prewarm] trailer ${index} failed:`, err.message);
      return null;
    }
  });
  return Promise.allSettled(tasks);
};
