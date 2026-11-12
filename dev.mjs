import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const frontendDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(frontendDir, '../backend');
const spawnOptions = {
  shell: process.platform === 'win32',
  stdio: 'inherit',
  windowsHide: true,
};
const children = [
  spawn(npm, ['run', 'dev'], { ...spawnOptions, cwd: backendDir }),
  spawn(npm, ['run', 'dev:client'], { ...spawnOptions, cwd: frontendDir }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGINT');
  process.exit(code);
};
for (const child of children) {
  child.on('error', (error) => { console.error(`Failed to start development process: ${error.message}`); stop(1); });
  child.on('exit', (code) => { if (code && code !== 130) stop(code); });
}
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
