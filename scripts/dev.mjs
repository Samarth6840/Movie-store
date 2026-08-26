
import { spawn } from 'node:child_process';

const run = (cmd, args, opts = {}) => {
  const proc = spawn(cmd, args, { stdio: 'inherit', shell: true, ...opts });
  proc.on('error', (err) => console.error(`${cmd} failed:`, err.message));
  return proc;
};

console.log('Starting Express API server on port 3000...');
const server = run('node', ['server/index.js']);

console.log('Starting Vite dev server...');
const vite = run('npx', ['vite', '--host']);

const cleanup = () => {
  server.kill();
  vite.kill();
  process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
