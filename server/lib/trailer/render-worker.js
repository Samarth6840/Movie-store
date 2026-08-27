

import { parentPort } from 'node:worker_threads';
import { renderTrailerInProcess, renderPosterInProcess } from './render-task.js';

if (!parentPort) {
  throw new Error('render-worker.js must be run as a worker_thread');
}

parentPort.on('message', (message) => {
  const run = (async () => {
    if (message.type === 'poster') return await renderPosterInProcess(message.payload);
    return await renderTrailerInProcess(message.payload);
  })();
  run.then(
    (data) => parentPort.postMessage({ id: message.id, ok: true, data }, [data.buffer]),
    (err) => parentPort.postMessage({
      id: message.id,
      ok: false,
      error: (err && (err.stack || err.message)) || String(err),
    }),
  );
});
