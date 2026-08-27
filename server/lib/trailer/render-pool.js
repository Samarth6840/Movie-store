

import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTrailerInProcess, renderPosterInProcess } from './render-task.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(__dirname, 'render-worker.js');

let pool = null;
let nextTaskId = 1;

/**
 * A small pool of persistent render workers. Each worker renders one trailer or
 * poster at a time; checkout/release reuse workers across tasks so that font
 * loading and module initialisation happen once per worker (not once per render).
 *
 * If worker creation fails (unavailable, module error) the pool silently falls
 * back to running the equivalent render task on the main thread via
 * render-task.js, so the renderer keeps working in degraded mode.
 */
class RenderWorkerPool {
  constructor(size) {
    this.size = Math.max(1, size);
    this.workers = new Set();
    this.idle = [];
    this.waiters = [];
    this.stopped = false;
  }

  async acquire() {
    if (this.stopped) return null;
    const idle = this.idle.pop();
    if (idle) return idle;
    if (this.workers.size < this.size) {
      return await this.#spawn();
    }
    return await new Promise((resolve) => this.waiters.push(resolve));
  }

  release(worker) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(worker);
    else if (!this.stopped && worker.usable) this.idle.push(worker);
  }

  async #spawn() {
    const handle = {
      usable: true,
      worker: null,
    };
    const worker = new Worker(WORKER_PATH);
    handle.worker = worker;
    this.workers.add(handle);

    worker.on('exit', (code) => {
      handle.usable = false;
      this.workers.delete(handle);
      // Replenish the slot: hand the next waiter a fresh replacement worker so
      // the concurrency cap stays intact. If spawn fails, hand `null` so the
      // waiter falls back to an inline render.
      const waiter = this.waiters.shift();
      if (waiter) {
        if (!this.stopped) {
          this.#spawn().then(waiter, () => waiter(null));
        } else {
          waiter(null);
        }
      }
    });

    // Wait until the worker has loaded its modules before handing it out, so a
    // broken worker module surfaces here (and triggers fallback) rather than
    // failing the first render task.
    await new Promise((resolve, reject) => {
      worker.once('online', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => reject(new Error(`worker exited early (code ${code})`)));
    });
    return handle;
  }

  async stop() {
    this.stopped = true;
    this.idle.length = 0;
    const handles = [...this.workers];
    this.workers.clear();
    for (const handle of handles) {
      try { await handle.worker.terminate(); } catch { /* noop */ }
    }
  }
}

const getPool = () => {
  pool ??= new RenderWorkerPool(Number(process.env.MAX_CONCURRENT_RENDERS ?? 2) || 2);
  return pool;
};

const runTaskInWorker = (handle, type, payload) =>
  new Promise((resolve, reject) => {
    if (!handle || !handle.usable) {
      resolve(null);
      return;
    }
    const id = nextTaskId++;
    const worker = handle.worker;
    const timeout = setTimeout(() => {
      cleanup();
      handle.usable = false;
      // A wedged worker never resolves its message handler; recycle it so the
      // pool doesn't hand the stuck worker out again. `exit` fires and the pool
      // replaces it for any waiting task.
      try { worker.terminate(); } catch { /* noop */ }
      reject(new Error(`render worker timed out`));
    }, 300000);

    const cleanup = () => {
      clearTimeout(timeout);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
    };
    const onMessage = (msg) => {
      if (msg.id !== id) return;
      cleanup();
      if (msg.ok) resolve(Buffer.from(msg.data));
      else reject(new Error(msg.error));
    };
    const onError = (err) => { cleanup(); handle.usable = false; reject(err); };
    const onExit = () => { cleanup(); handle.usable = false; reject(new Error('render worker exited during task')); };

    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage({ id, type, payload });
  });

export const renderTrailerOffloaded = async (payload) => {
  const p = getPool();
  const handle = await p.acquire();
  try {
    const result = await runTaskInWorker(handle, 'trailer', payload);
    if (result) return result;
    return await renderTrailerInProcess(payload);
  } catch (err) {
    // A mid-task worker failure must not take the request down: fall back to
    // rendering on the main thread so the renderer stays available.
    const fallback = await renderTrailerInProcess(payload).catch((fallbackErr) => {
      throw fallbackErr;
    });
    return fallback;
  } finally {
    if (handle) p.release(handle);
  }
};

export const renderPosterOffloaded = async (payload) => {
  const p = getPool();
  const handle = await p.acquire();
  try {
    const result = await runTaskInWorker(handle, 'poster', payload);
    if (result) return result;
    return await renderPosterInProcess(payload);
  } catch (err) {
    const fallback = await renderPosterInProcess(payload).catch((fallbackErr) => {
      throw fallbackErr;
    });
    return fallback;
  } finally {
    if (handle) p.release(handle);
  }
};
