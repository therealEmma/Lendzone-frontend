import { io } from 'socket.io-client';

const url = process.env.SMOKE_URL ?? 'http://localhost:3000';
const state = {
  soloSession: false,
  soloStartBlocked: false,
  sessions: 0,
  snapshots: 0,
  sawCapacity: false,
  sawPlaying: false,
  sawResults: false,
  errors: [],
};

const waitFor = (condition, timeout = 8000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const timer = setInterval(() => {
    if (condition()) { clearInterval(timer); resolve(); }
    else if (Date.now() - started > timeout) { clearInterval(timer); reject(new Error('Timed out waiting for lifecycle state')); }
  }, 50);
});

const solo = io(url, { transports: ['websocket'], reconnection: false });
solo.on('session', () => { state.soloSession = true; });
solo.on('errorMessage', (error) => {
  if (/at least 2 operatives/i.test(error.message)) state.soloStartBlocked = true;
  state.errors.push(error.message);
});
solo.on('connect', () => solo.emit('join', { name: 'Solo-Check', color: '#ffe66d' }));

let clients = [];
try {
  await waitFor(() => state.soloSession);
  solo.emit('hostAction', { secret: process.env.HOST_SECRET ?? 'change-me', action: 'start' });
  await waitFor(() => state.soloStartBlocked);
  solo.disconnect();

  clients = [io(url, { transports: ['websocket'], reconnection: false }), io(url, { transports: ['websocket'], reconnection: false })];
  for (const [index, client] of clients.entries()) {
    client.on('session', () => { state.sessions += 1; });
    client.on('snapshot', (snapshot) => {
      state.snapshots += 1;
      if (snapshot.maxPlayers === 3) state.sawCapacity = true;
      if (snapshot.phase === 'PLAYING') state.sawPlaying = true;
      if (snapshot.phase === 'RESULTS') state.sawResults = true;
    });
    client.on('errorMessage', (error) => state.errors.push(error.message));
    client.on('connect', () => client.emit('join', { name: `Smoke-${index + 1}`, color: index ? '#38bdf8' : '#ff4d6d' }));
  }

  await waitFor(() => state.sessions === 2);
  // The disconnected solo check is still within the reconnect grace window,
  // so its slot is reserved. Capacity 3 is the smallest valid value here.
  clients[0].emit('hostAction', { secret: process.env.HOST_SECRET ?? 'change-me', action: 'capacity', capacity: 3 });
  await waitFor(() => state.sawCapacity);
  clients[0].emit('hostAction', { secret: process.env.HOST_SECRET ?? 'change-me', action: 'start', durationSeconds: 30 });
  await waitFor(() => state.sawPlaying, 7000);
  clients[0].emit('hostAction', { secret: process.env.HOST_SECRET ?? 'change-me', action: 'end' });
  await waitFor(() => state.sawResults);
  clients[0].emit('hostAction', { secret: process.env.HOST_SECRET ?? 'change-me', action: 'capacity', capacity: 30 });
  console.log(JSON.stringify({ url, soloStartBlocked: state.soloStartBlocked, sessions: state.sessions, snapshots: state.snapshots, sawCapacity: state.sawCapacity, sawPlaying: state.sawPlaying, sawResults: state.sawResults, errors: state.errors }, null, 2));
} finally {
  solo.disconnect();
  clients.forEach((client) => client.disconnect());
}
