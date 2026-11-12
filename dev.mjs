import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [
  spawn(npm, ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn(npm, ['run', 'dev:client'], { stdio: 'inherit' }),
];

const stop = (code = 0) => {
  for (const child of children) child.kill('SIGINT');
  process.exit(code);
};
for (const child of children) child.on('exit', (code) => { if (code && code !== 130) stop(code); });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
