import { io, Socket } from 'socket.io-client';

const serverUrl = process.env.LOADTEST_URL ?? 'http://localhost:3000';
const count = Number(process.env.LOADTEST_CLIENTS ?? 30);
const durationMs = Number(process.env.LOADTEST_DURATION_MS ?? 30_000);
const sockets: Socket[] = [];
let snapshots = 0;
let errors = 0;
let connected = 0;
let disconnected = 0;
let messages = 0;

for (let index = 0; index < count; index += 1) {
  const socket = io(serverUrl, { transports: ['websocket'], reconnection: false });
  sockets.push(socket);
  socket.on('connect', () => { connected += 1; socket.emit('join', { name: `Load-${index + 1}`, color: '#38bdf8' }); });
  socket.on('snapshot', () => { snapshots += 1; messages += 1; });
  socket.on('notice', () => { messages += 1; });
  socket.on('errorMessage', () => { errors += 1; });
  socket.on('disconnect', () => { disconnected += 1; });
  const inputTimer = setInterval(() => {
    if (!socket.connected) return;
    socket.emit('input', { seq: Date.now(), left: index % 2 === 0, right: index % 2 === 1, jump: Math.random() < .08, jetpack: Math.random() < .15, shoot: true, reload: false, aimAngle: Math.sin(Date.now() / 800 + index) });
  }, 33);
  socket.once('disconnect', () => clearInterval(inputTimer));
}

const started = Date.now();
setTimeout(() => {
  sockets.forEach((socket) => socket.disconnect());
  const elapsed = (Date.now() - started) / 1000;
  console.log(JSON.stringify({ serverUrl, clients: count, connected, disconnected, errors, snapshots, messages, elapsedSeconds: Number(elapsed.toFixed(1)), snapshotsPerSecond: Number((snapshots / elapsed).toFixed(1)), note: 'This script measures client connectivity and snapshot delivery. Run it against a started server and inspect the server process for CPU/memory.' }, null, 2));
  process.exit(errors > 0 || connected < count ? 1 : 0);
}, durationMs);
