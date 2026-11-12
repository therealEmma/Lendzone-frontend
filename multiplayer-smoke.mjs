import { io } from 'socket.io-client';

const url = process.env.SMOKE_URL ?? 'http://localhost:3000';
const clients = [
  io(url, { transports: ['websocket'], reconnection: false }),
  io(url, { transports: ['websocket'], reconnection: false }),
];
const sessions = [];
const snapshots = [null, null];
let lastAimAngle = null;
const result = {
  url,
  sameRoom: false,
  sharedPlayers: false,
  facingSynchronized: false,
  remoteShotObserved: false,
  damageObserved: false,
  deathObserved: false,
  scoreObserved: false,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const angleDistance = (left, right) => Math.abs(Math.atan2(Math.sin(left - right), Math.cos(left - right)));
const waitFor = async (condition, timeout = 10_000) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for multiplayer state');
    await sleep(50);
  }
};

const close = () => clients.forEach((client) => client.disconnect());
try {
  clients.forEach((client, index) => {
    client.on('connect', () => client.emit('join', { name: `Network-${index + 1}`, color: index ? '#38bdf8' : '#ff4d6d' }));
    client.on('session', (session) => { sessions[index] = session; });
    client.on('snapshot', (snapshot) => {
      snapshots[index] = snapshot;
      if (index === 1 && snapshot.players.some((player) => player.id === sessions[0]?.id)) result.sharedPlayers = snapshot.players.length >= 2;
      if (sessions[0] && snapshot.roomId === sessions[0].roomId) result.sameRoom = true;
      const attacker = snapshot.players.find((player) => player.id === sessions[0]?.id);
      const victim = snapshot.players.find((player) => player.id === sessions[1]?.id);
      const otherView = snapshots[0];
      const otherAttacker = otherView?.players.find((player) => player.id === sessions[0]?.id);
      if (lastAimAngle !== null && attacker && otherAttacker && angleDistance(attacker.aimAngle, lastAimAngle) < 0.05 && angleDistance(attacker.aimAngle, otherAttacker.aimAngle) < 0.05) result.facingSynchronized = true;
      if (attacker && victim) {
        if (attacker.score.damage > 0) result.scoreObserved = true;
        if (victim.hp < victim.maxHp) result.damageObserved = true;
        if (!victim.alive || victim.score.deaths > 0) result.deathObserved = true;
      }
    });
    client.on('shot', (shot) => {
      if (index === 1 && shot.ownerId === sessions[0]?.id) result.remoteShotObserved = true;
    });
  });

  await waitFor(() => sessions.length === 2 && snapshots.every(Boolean));
  clients[0].emit('hostAction', { secret: '', action: 'start' });
  await waitFor(() => snapshots.some((snapshot) => snapshot?.phase === 'PLAYING'), 8_000);
  await sleep(2_200); // wait for the server-side spawn protection to expire

  let seq = 0;
  const aimTimer = setInterval(() => {
    const snapshot = snapshots[0];
    const attacker = snapshot?.players.find((player) => player.id === sessions[0]?.id);
    const victim = snapshot?.players.find((player) => player.id === sessions[1]?.id);
    if (!attacker || !victim) return;
    const angle = Math.atan2(
      victim.y + 30 - (attacker.y + 30),
      victim.x + 21 - (attacker.x + 21),
    );
    lastAimAngle = angle;
    clients[0].emit('input', { seq: ++seq, left: false, right: false, jump: false, jetpack: false, shoot: true, reload: false, aimAngle: angle });
  }, 33);

  try {
    await waitFor(() => result.remoteShotObserved && result.damageObserved, 5_000);
    await sleep(1_000);
  } finally {
    clearInterval(aimTimer);
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.sameRoom || !result.sharedPlayers || !result.facingSynchronized || !result.remoteShotObserved || !result.damageObserved) process.exitCode = 1;
} finally {
  close();
}
