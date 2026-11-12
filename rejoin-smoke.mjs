import { io } from 'socket.io-client';

const url = process.env.REJOIN_URL ?? 'http://localhost:3000';
const clients = [];
const sessions = new Map();
const snapshots = new Map();
const result = {
  url,
  activeJoin: false,
  disconnectRemoved: false,
  noPostDisconnectShots: false,
  sameIdOnRejoin: false,
  scorePreserved: false,
  expiredSessionRejected: false,
  usernameCannotImpersonate: false,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (condition, timeout = 10_000) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error('Timed out waiting for rejoin state');
    await sleep(50);
  }
};
const connectPlayer = (name, color) => {
  const client = io(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  client.on('connect', () => client.emit('join', { name, color }));
  client.on('session', (session) => sessions.set(client, session));
  client.on('snapshot', (snapshot) => snapshots.set(client, snapshot));
  return client;
};
const connectWithToken = (name, color, reconnectToken) => {
  const client = io(url, { transports: ['websocket'], reconnection: false });
  clients.push(client);
  client.on('connect', () => client.emit('join', { name, color, reconnectToken }));
  client.on('session', (session) => sessions.set(client, session));
  client.on('snapshot', (snapshot) => snapshots.set(client, snapshot));
  return client;
};

try {
  const playerA = connectPlayer('Rejoin-A', '#ff4d6d');
  const playerB = connectPlayer('Rejoin-B', '#38bdf8');
  const shotCounts = new Map();
  clients.forEach((client) => {
    shotCounts.set(client, 0);
    client.on('shot', (shot) => {
      if (shot.ownerId === sessions.get(playerA)?.id) shotCounts.set(client, shotCounts.get(client) + 1);
    });
  });

  await waitFor(() => sessions.has(playerA) && sessions.has(playerB) && snapshots.has(playerA));
  playerA.emit('hostAction', { secret: '', action: 'capacity', capacity: 4 });
  playerA.emit('hostAction', { secret: '', action: 'start' });
  await waitFor(() => snapshots.get(playerA)?.phase === 'PLAYING', 8_000);

  const activeJoiner = connectPlayer('Rejoin-C', '#ffe66d');
  await waitFor(() => sessions.has(activeJoiner) && snapshots.get(activeJoiner)?.phase === 'PLAYING');
  result.activeJoin = snapshots.get(activeJoiner)?.players.some((player) => player.id === sessions.get(activeJoiner)?.id) === true
    && snapshots.get(activeJoiner)?.players.length === 3;

  await sleep(2_200);
  const beforeDisconnectSnapshot = snapshots.get(playerA);
  const beforePlayer = beforeDisconnectSnapshot?.players.find((player) => player.id === sessions.get(playerA)?.id);
  const reconnectToken = sessions.get(playerA)?.reconnectToken;
  let seq = 0;
  const firing = setInterval(() => {
    const snapshot = snapshots.get(playerA);
    const attacker = snapshot?.players.find((player) => player.id === sessions.get(playerA)?.id);
    const target = snapshot?.players.find((player) => player.id === sessions.get(playerB)?.id);
    if (!attacker || !target) return;
    const aimAngle = Math.atan2(target.y + 30 - (attacker.y + 30), target.x + 21 - (attacker.x + 21));
    playerA.emit('input', { seq: ++seq, left: false, right: false, jump: false, jetpack: false, shoot: true, reload: false, aimAngle });
  }, 33);
  await sleep(1_500);
  clearInterval(firing);
  const scoreAtDisconnect = snapshots.get(playerA)?.players.find((player) => player.id === sessions.get(playerA)?.id)?.score;

  playerA.disconnect();
  await waitFor(() => snapshots.get(playerB)?.players.every((player) => player.id !== sessions.get(playerA)?.id));
  result.disconnectRemoved = true;
  const shotsAfterDisconnectProcessed = shotCounts.get(playerB);
  await sleep(700);
  result.noPostDisconnectShots = shotCounts.get(playerB) === shotsAfterDisconnectProcessed;

  const rejoined = connectWithToken('Rejoin-A', '#ff4d6d', reconnectToken);
  await waitFor(() => sessions.has(rejoined) && snapshots.get(rejoined)?.players.some((player) => player.id === sessions.get(rejoined)?.id));
  const rejoinedSession = sessions.get(rejoined);
  const rejoinedPlayer = snapshots.get(rejoined)?.players.find((player) => player.id === rejoinedSession?.id);
  result.sameIdOnRejoin = rejoinedSession?.id === beforePlayer?.id;
  result.scorePreserved = Boolean(scoreAtDisconnect && rejoinedPlayer && JSON.stringify(scoreAtDisconnect) === JSON.stringify(rejoinedPlayer.score));

  const rotatedToken = rejoinedSession?.reconnectToken;
  rejoined.disconnect();
  await sleep(Number(process.env.REJOIN_GRACE_WAIT_MS ?? 2_500));
  const expired = connectWithToken('Rejoin-A', '#ff4d6d', rotatedToken);
  let expiredCode = '';
  expired.on('errorMessage', (error) => { expiredCode = error.code || ''; });
  await waitFor(() => expiredCode === 'RECONNECT_EXPIRED', 5_000);
  result.expiredSessionRejected = true;

  const sameName = connectPlayer('Rejoin-A', '#a3e635');
  await waitFor(() => sessions.has(sameName));
  result.usernameCannotImpersonate = sessions.get(sameName)?.id !== beforePlayer?.id;

  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result).some((value) => value === false)) process.exitCode = 1;
} finally {
  clients.forEach((client) => client.disconnect());
}
