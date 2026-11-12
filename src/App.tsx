import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  GameSnapshot, HostActionPayload, SessionPayload, MatchPhase,
} from './shared/types';
import CanvasGame from './CanvasGame';
import { gameAudio } from './audio';

const COLORS = ['#ff4d6d', '#ff9f1c', '#ffe66d', '#2ec4b6', '#38bdf8', '#8b5cf6', '#f472b6', '#a3e635', '#fb7185', '#c084fc'];
const DEFAULT_SERVER_URL = window.location.port === '5173'
  ? `${window.location.protocol}//${window.location.hostname}:3000`
  : window.location.origin;
const SERVER_URL = import.meta.env.VITE_SERVER_URL || DEFAULT_SERVER_URL;

type Notice = { message: string; type: 'info' | 'error' };

export default function App() {
  const socket = useMemo<Socket>(() => io(SERVER_URL, { autoConnect: false, transports: ['websocket', 'polling'], timeout: 5_000 }), []);
  const [connected, setConnected] = useState(socket.connected);
  const [joined, setJoined] = useState(false);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [name, setName] = useState(() => localStorage.getItem('om-name') || '');
  const [color, setColor] = useState(() => localStorage.getItem('om-color') || COLORS[0]);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setJoinError('');
    };
    const onDisconnect = () => {
      setConnected(false);
      setJoinError((current) => current || 'Backend disconnected. Start the backend and try again.');
    };
    const onConnectError = () => {
      setConnected(false);
      setJoinError(`Cannot reach the backend at ${SERVER_URL}. Start it with "npm run dev" from the backend folder.`);
    };
    const onSession = (payload: SessionPayload) => {
      setSession(payload);
      setJoined(true);
      localStorage.setItem('om-reconnect-token', payload.reconnectToken);
    };
    const onSnapshot = (next: GameSnapshot) => setSnapshot(next);
    const onNotice = (next: Notice) => {
      setNotice(next);
      window.setTimeout(() => setNotice(null), 3500);
    };
    const onError = (next: { message: string }) => {
      setJoinError(next.message);
      setNotice({ message: next.message, type: 'error' });
      window.setTimeout(() => setNotice((current) => current?.message === next.message ? null : current), 3500);
    };
    socket.on('connect', onConnect);
    socket.on('connected', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('session', onSession);
    socket.on('snapshot', onSnapshot);
    socket.on('notice', onNotice);
    socket.on('errorMessage', onError);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('connected', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('session', onSession);
      socket.off('snapshot', onSnapshot);
      socket.off('notice', onNotice);
      socket.off('errorMessage', onError);
      gameAudio.stopMusic();
      socket.disconnect();
    };
  }, [socket]);

  const joinGame = () => {
    gameAudio.unlock();
    gameAudio.ui();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setJoinError('Pick a callsign with at least 2 characters.');
      return;
    }
    localStorage.setItem('om-name', trimmed);
    localStorage.setItem('om-color', color);
    setJoinError('');
    gameAudio.lobbyMusic();
    socket.emit('join', {
      name: trimmed,
      color,
      reconnectToken: localStorage.getItem('om-reconnect-token') || undefined,
    });
  };

  const retryConnection = useCallback(() => {
    setJoinError('Reconnecting to the backend...');
    if (!socket.connected) socket.connect();
  }, [socket]);

  const sendHostAction = useCallback((payload: Omit<HostActionPayload, 'secret'> & { secret: string }) => {
    socket.emit('hostAction', payload);
  }, [socket]);

  if (!joined || !session) {
    return (
      <JoinScreen
        connected={connected}
        name={name}
        setName={setName}
        color={color}
        setColor={setColor}
        onJoin={joinGame}
        onRetry={retryConnection}
        error={joinError}
      />
    );
  }

  const phase: MatchPhase = snapshot?.phase || session.phase;
  const isHost = Boolean(snapshot?.hostId === session.id || session.isHost);

  if (phase === 'LOBBY') {
    return <LobbyScreen snapshot={snapshot} session={session} isHost={isHost} notice={notice} onHostAction={sendHostAction} onLeave={() => { gameAudio.stopMusic(); socket.disconnect(); }} />;
  }
  if (phase === 'RESULTS') {
    return <ResultsScreen snapshot={snapshot} isHost={isHost} onHostAction={sendHostAction} />;
  }
  return (
    <GameScreen
      socket={socket}
      snapshot={snapshot}
      session={session}
      isHost={isHost}
      onHostAction={sendHostAction}
      notice={notice}
    />
  );
}

function JoinScreen(props: {
  connected: boolean; name: string; setName: (value: string) => void; color: string; setColor: (value: string) => void;
  onJoin: () => void; onRetry: () => void; error: string;
}) {
  return (
    <main className="screen-shell join-shell">
      <div className="ambient-grid" />
      <section className="join-card panel-glass">
        <div className="brand-lockup">
          <span className="brand-mark">✦</span>
          <span className="eyebrow">COMPANY ARCADE // 01</span>
        </div>
        <h1>LENDZONE</h1>
        <p className="hero-copy">Clock out. Lock in. Own the front line.</p>
        <div className="join-form">
          <label className="field-label" htmlFor="callsign">CALLSIGN</label>
          <input id="callsign" maxLength={18} value={props.name} onChange={(event) => props.setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') props.onJoin(); }} placeholder="e.g. Spreadsheet Samurai" autoFocus />
          <label className="field-label">SIGNAL COLOR</label>
          <div className="color-row">
            {COLORS.map((candidate) => <button aria-label={`Choose ${candidate}`} className={`color-swatch ${props.color === candidate ? 'selected' : ''}`} style={{ background: candidate }} key={candidate} onClick={() => props.setColor(candidate)} />)}
          </div>
          <button className="primary-button" onClick={props.onJoin} disabled={!props.connected}>
            {props.connected ? 'ENTER THE ARENA' : 'CONNECTING...'} <span>↗</span>
          </button>
          {!props.connected && <button className="text-button connection-retry" onClick={props.onRetry}>RETRY CONNECTION</button>}
          {props.error && <div className="form-error">{props.error}</div>}
        </div>
        <div className="join-footnote"><span className="status-dot" /> No account. No install. Share the link and play.</div>
      </section>
      <div className="join-aside">
        <div className="aside-card"><span>01</span><strong>RUN &amp; GUN</strong><p>Arrow keys move and turn. Space fires. Shift boosts. Mouse controls are also supported.</p></div>
        <div className="aside-card"><span>02</span><strong>OWN THE ELEVATION</strong><p>Catwalks, open lanes, and vertical routes. Keep moving and control the sight lines.</p></div>
        <div className="aside-card"><span>03</span><strong>OWN THE FRONT</strong><p>Fast respawns. Five minute rounds. Highest score earns the Lendzone crown.</p></div>
      </div>
    </main>
  );
}

function LobbyScreen({ snapshot, session, isHost, notice, onHostAction, onLeave }: {
  snapshot: GameSnapshot | null; session: SessionPayload; isHost: boolean;
  notice: Notice | null; onHostAction: (payload: HostActionPayload) => void; onLeave: () => void;
}) {
  const [secret, setSecret] = useState('');
  const [duration, setDuration] = useState(300);
  const [capacity, setCapacity] = useState(snapshot?.maxPlayers || session.maxPlayers);
  const [showHost, setShowHost] = useState(false);
  const players = snapshot?.players || [];
  const canDeploy = isHost && players.length >= 2;
  const start = () => {
    if (!canDeploy) return;
    onHostAction({ secret, action: 'duration', durationSeconds: duration });
    onHostAction({ secret, action: 'capacity', capacity });
    onHostAction({ secret, action: 'start' });
  };
  return (
    <main className="screen-shell lobby-shell">
      <header className="lobby-header"><div className="mini-brand"><span>✦</span> LENDZONE</div><div className="connection-pill"><span className="status-dot" /> LIVE ROOM <strong>{players.length}/{snapshot?.maxPlayers || session.maxPlayers}</strong></div><button className="ghost-button" onClick={onLeave}>LEAVE</button></header>
      <section className="lobby-content">
        <div className="lobby-title"><span className="eyebrow">OPERATION: LENDZONE FRONT</span><h2>Squad up.</h2><p>Waiting for the owner to deploy the fireteam<span className="blink">_</span></p></div>
        <div className="lobby-grid">
          <div className="panel-glass roster-panel"><div className="panel-heading"><span>FIRETEAM // {players.length}</span><span className="live-label">● ONLINE</span></div><div className="roster-list">{players.length === 0 ? <div className="empty-roster">Your squad will appear here.</div> : players.map((player, index) => <div className="roster-row" key={player.id}><span className="roster-index">{String(index + 1).padStart(2, '0')}</span><span className="roster-avatar" style={{ background: player.color }}>{player.name.slice(0, 1).toUpperCase()}</span><strong>{player.name}</strong>{player.id === snapshot?.hostId && <span className="host-tag">HOST</span>}<span className="roster-ready">READY</span></div>)}</div></div>
          <div className="panel-glass briefing-panel"><div className="panel-heading">MISSION BRIEFING</div><div className="briefing-row"><span>MODE</span><strong>FREE-FOR-ALL</strong></div><div className="briefing-row"><span>ROUND</span><strong>{Math.round((duration || 300) / 60)} MINUTES</strong></div><div className="briefing-row"><span>DEPLOYMENT</span><strong>{capacity} OPERATIVES</strong></div><div className="briefing-row"><span>MAP</span><strong>LENDZONE OUTPOST</strong></div><div className="briefing-tip">Tip: jetpack fuel refills while your boots are on a platform. Use the catwalks and open lanes to break sight lines.</div></div>
        </div>
        <div className="lobby-actions"><button className="primary-button wide-button" disabled={isHost && !canDeploy} onClick={() => isHost ? start() : setShowHost(true)}>{isHost ? (canDeploy ? 'START THE ROUND' : 'WAITING FOR 1 MORE PLAYER') : 'I HAVE THE HOST KEY'} <span>→</span></button><div className="lobby-subtext">{isHost ? (canDeploy ? 'You are the room host. Set the pace.' : 'At least 2 operatives are required before deployment.') : 'The host can start the round from this room.'}</div></div>
        <button className="text-button" onClick={() => setShowHost((current) => !current)}>{showHost ? 'Hide host controls' : 'Open host controls'}</button>
        {showHost && <HostControls secret={secret} setSecret={setSecret} duration={duration} setDuration={setDuration} capacity={capacity} setCapacity={setCapacity} onAction={onHostAction} isHost={isHost} playerCount={players.length} />}
        {notice && <div className={`notice-toast lobby-notice ${notice.type}`}>{notice.message}</div>}
      </section>
    </main>
  );
}

function HostControls({ secret, setSecret, duration, setDuration, capacity, setCapacity, onAction, isHost, playerCount }: {
  secret: string; setSecret: (value: string) => void; duration: number; setDuration: (value: number) => void; capacity: number; setCapacity: (value: number) => void;
  onAction: (payload: HostActionPayload) => void; isHost: boolean; playerCount: number;
}) {
  const canDeploy = isHost && playerCount >= 2;
  return <div className="host-controls panel-glass"><div><label className="field-label">OWNER KEY <small>(optional for room host)</small></label><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Only needed for remote control" /></div><div><label className="field-label">ROUND SECONDS</label><input type="number" min={30} max={1800} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></div><div><label className="field-label">MAX PLAYERS</label><input type="number" min={2} max={30} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} /></div><button className="secondary-button" disabled={!canDeploy} onClick={() => { onAction({ secret, action: 'duration', durationSeconds: duration }); onAction({ secret, action: 'capacity', capacity }); onAction({ secret, action: 'start', durationSeconds: duration }); }}>DEPLOY</button><span className="host-help">{isHost ? (canDeploy ? 'Room host verified. Start when everyone is ready.' : 'Add one more operative before deployment.') : 'Enter the owner key to configure the room.'}</span></div>;
}

function ResultsScreen({ snapshot, isHost, onHostAction }: { snapshot: GameSnapshot | null; isHost: boolean; onHostAction: (payload: HostActionPayload) => void }) {
  const [secret, setSecret] = useState('');
  const leaderboard = snapshot?.leaderboard || [];
  const canRestart = isHost && (snapshot?.playerCount || 0) >= 2;
  return <main className="screen-shell results-shell"><div className="results-glow" /><div className="eyebrow">ROUND COMPLETE</div><h1>MISSION<br /><span>REPORT</span></h1><p className="results-kicker">The Lendzone arena has a new champion.</p><div className="results-board panel-glass">{leaderboard.slice(0, 10).map((player, index) => <div className={`result-row ${index === 0 ? 'winner' : ''}`} key={player.id}><span className="place">{String(index + 1).padStart(2, '0')}</span><span className="result-dot" style={{ background: player.color }} /><strong>{player.name}</strong><span className="result-kills">{player.kills}<small> KILLS</small></span><span className="result-deaths">{player.deaths}D</span></div>)}</div><div className="results-actions">{isHost ? <><input className="secret-inline" type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Owner key" /><button className="primary-button" disabled={!canRestart} onClick={() => onHostAction({ secret, action: 'restart' })}>{canRestart ? 'START ANOTHER ROUND' : 'WAITING FOR 1 MORE PLAYER'} <span>↗</span></button></> : <div className="lobby-subtext">Waiting for the owner to queue the next round.</div>}</div></main>;
}

function GameScreen({ socket, snapshot, session, isHost, onHostAction, notice }: {
  socket: Socket; snapshot: GameSnapshot | null; session: SessionPayload; isHost: boolean;
  onHostAction: (payload: HostActionPayload) => void; notice: Notice | null;
}) {
  const [secret, setSecret] = useState('');
  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setShowControls(false), 15_000);
    return () => window.clearTimeout(timer);
  }, []);
  return <main className="game-shell"><CanvasGame socket={socket} snapshot={snapshot} localId={session.id} /><GameHud snapshot={snapshot} localId={session.id} isHost={isHost} secret={secret} setSecret={setSecret} onHostAction={onHostAction} />{showControls && <ControlsBrief />}{notice && <div className={`notice-toast ${notice.type}`}>{notice.message}</div>}</main>;
}

function ControlsBrief() {
  return <aside className="controls-brief panel-glass" aria-label="Game controls">
    <div className="controls-brief-title">CONTROLS // 15 SEC</div>
    <div className="controls-grid">
      <div className="control-row"><kbd>← →</kbd><span>MOVE / TURN</span></div>
      <div className="control-row"><kbd>↑</kbd><span>JUMP / AIM UP</span></div>
      <div className="control-row"><kbd>↓</kbd><span>AIM DOWN</span></div>
      <div className="control-row"><kbd>SPACE</kbd><span>FIRE</span></div>
      <div className="control-row"><kbd>SHIFT</kbd><span>JETPACK BOOST</span></div>
      <div className="control-row"><kbd>MOUSE</kbd><span>AIM / FIRE</span></div>
      <div className="control-row"><kbd>R</kbd><span>RELOAD</span></div>
    </div>
  </aside>;
}

function GameHud({ snapshot, localId, isHost, secret, setSecret, onHostAction }: {
  snapshot: GameSnapshot | null; localId: string; isHost: boolean; secret: string; setSecret: (value: string) => void; onHostAction: (payload: HostActionPayload) => void;
}) {
  const localPlayer = snapshot?.players.find((player) => player.id === localId);
  const timerSeconds = Math.ceil((snapshot?.timeRemaining || 0) / 1000);
  const timer = `${Math.floor(timerSeconds / 60).toString().padStart(2, '0')}:${(timerSeconds % 60).toString().padStart(2, '0')}`;
  return <>
    <div className="hud-top"><div className="hud-brand">✦ <span>LENDZONE</span></div><div className={`match-clock ${snapshot?.phase === 'COUNTDOWN' ? 'countdown-clock' : ''}`}>{snapshot?.phase === 'COUNTDOWN' ? snapshot.countdown : timer}</div><div className="hud-count"><span className="status-dot" /> {snapshot?.playerCount || 0}/{snapshot?.maxPlayers || 30} IN ARENA</div></div>
    <div className="leaderboard hud-panel"><div className="hud-panel-title">TOP OPERATIVES</div>{(snapshot?.leaderboard || []).slice(0, 5).map((entry, index) => <div className={`leader-row ${entry.id === localId ? 'local' : ''}`} key={entry.id}><span>{index + 1}</span><i style={{ background: entry.color }} /><strong>{entry.name}</strong><b>{entry.kills}</b></div>)}</div>
    <div className="kill-feed">{(snapshot?.killFeed || []).slice(0, 4).map((item) => <div key={item.id}><strong>{item.killer}</strong><span> eliminated </span><strong>{item.victim}</strong></div>)}</div>
    <div className="player-status hud-panel"><div className="status-line"><span>HEALTH</span><strong>{Math.max(0, localPlayer?.hp || 0)}</strong></div><div className="meter health-meter"><i style={{ width: `${Math.max(0, localPlayer?.hp || 0)}%` }} /></div><div className="status-line fuel-label"><span>JETPACK FUEL</span><strong>{Math.round(localPlayer?.fuel || 0)}%</strong></div><div className="meter fuel-meter"><i style={{ width: `${Math.max(0, localPlayer?.fuel || 0)}%` }} /></div></div>
    <div className="ammo-status hud-panel"><div className="ammo-number">{localPlayer?.ammo ?? 0}<small>/{localPlayer?.magazineSize ?? 30}</small></div><div className="ammo-label">{localPlayer?.ammo === 0 ? 'PRESS R TO RELOAD' : 'RIFLE // AUTO'}</div></div>
    {snapshot?.phase === 'COUNTDOWN' && <div className="countdown-banner"><span>ROUND STARTS IN</span><strong>{snapshot.countdown}</strong></div>}
    {isHost && <div className="in-game-host"><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder="Host key" /><button onClick={() => onHostAction({ secret, action: 'pause' })}>{snapshot?.paused ? 'RESUME' : 'PAUSE'}</button><button onClick={() => onHostAction({ secret, action: 'end' })}>END</button></div>}
  </>;
}
