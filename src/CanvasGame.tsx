import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { GameSnapshot, InputCommand, PLATFORM_LAYOUT, PlayerSnapshot, WORLD } from './shared/types';
import { gameAudio } from './audio';

interface MobileInput {
  left: boolean;
  right: boolean;
  jump: boolean;
  jetpack: boolean;
  shoot: boolean;
  shootPulse: number;
  aimAngle: number;
  aimAngleSet: boolean;
}

const EMPTY_MOBILE: MobileInput = { left: false, right: false, jump: false, jetpack: false, shoot: false, shootPulse: 0, aimAngle: 0, aimAngleSet: false };

interface AudioState {
  projectileIds: Set<number>;
  phase: string;
  countdown: number;
  lastHp: number;
  lastKills: number;
  lastAmmo: number;
  lastShotAt: number;
  lastJump: boolean;
  lastBoostAt: number;
}

export default function CanvasGame({ socket, snapshot, localId }: { socket: Socket; snapshot: GameSnapshot | null; localId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef<GameSnapshot | null>(snapshot);
  const inputRef = useRef<InputCommand>({ seq: 0, left: false, right: false, jump: false, jetpack: false, shoot: false, reload: false, aimAngle: 0 });
  const mobileRef = useRef<MobileInput>({ ...EMPTY_MOBILE });
  const keysRef = useRef(new Set<string>());
  const mouseRef = useRef({ x: 0, y: 0, down: false, active: false });
  const seqRef = useRef(0);
  const visualRef = useRef(new Map<string, { x: number; y: number; last: number }>());
  const cameraRef = useRef({ x: 1200, y: 600, zoom: 1 });
  const audioRef = useRef<AudioState>({ projectileIds: new Set<number>(), phase: 'LOBBY', countdown: 0, lastHp: WORLD.playerMaxHp, lastKills: 0, lastAmmo: WORLD.magazineSize, lastShotAt: 0, lastJump: false, lastBoostAt: 0 });

  useEffect(() => {
    snapshotRef.current = snapshot;
    if (!snapshot) return;
    const audioState = audioRef.current;
    const nextProjectileIds = new Set(snapshot.projectiles.map((projectile) => projectile.id));
    let remoteShots = 0;
    for (const projectile of snapshot.projectiles) {
      if (!audioState.projectileIds.has(projectile.id) && projectile.ownerId !== localId && remoteShots < 3) {
        gameAudio.gunshot();
        remoteShots += 1;
      }
    }
    const local = snapshot.players.find((player) => player.id === localId);
    if (local) {
      if (local.hp < audioState.lastHp) gameAudio.hit();
      if (local.score.kills > audioState.lastKills) gameAudio.elimination();
      if (local.ammo === 0 && audioState.lastAmmo > 0) gameAudio.reload();
      if (local.jetpacking && Date.now() - audioState.lastBoostAt > 220) {
        gameAudio.boost();
        audioState.lastBoostAt = Date.now();
      }
      audioState.lastHp = local.hp;
      audioState.lastKills = local.score.kills;
      audioState.lastAmmo = local.ammo;
    }
    if (snapshot.phase === 'COUNTDOWN' && snapshot.countdown !== audioState.countdown) gameAudio.countdown();
    if (snapshot.phase === 'PLAYING' && audioState.phase !== 'PLAYING') gameAudio.roundStart();
    if (snapshot.phase === 'RESULTS' && audioState.phase !== 'RESULTS') gameAudio.stopMusic();
    audioState.countdown = snapshot.countdown;
    audioState.phase = snapshot.phase;
    audioState.projectileIds = nextProjectileIds;
  }, [snapshot, localId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      const key = event.key.toLowerCase();
      gameAudio.unlock();
      if (event.code === 'Space' || ['x', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 'shift'].includes(key)) event.preventDefault();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w'].includes(key)) mouseRef.current.active = false;
      keysRef.current.add(key);
    };
    const onKeyUp = (event: KeyboardEvent) => { keysRef.current.delete(event.key.toLowerCase()); };
    const onPointerMove = (event: globalThis.PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = event.clientX - rect.left;
      mouseRef.current.y = event.clientY - rect.top;
      mouseRef.current.active = true;
    };
    const onPointerDown = (event: globalThis.PointerEvent) => { gameAudio.unlock(); canvas.focus({ preventScroll: true }); if (event.pointerType === 'mouse') mouseRef.current.down = true; };
    const onPointerUp = (event: globalThis.PointerEvent) => { if (event.pointerType === 'mouse') mouseRef.current.down = false; };
    const release = () => { keysRef.current.clear(); mouseRef.current.down = false; mouseRef.current.active = false; mobileRef.current = { ...EMPTY_MOBILE }; };
    window.addEventListener('keydown', onKeyDown, { capture: true, passive: false });
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', release);
    return () => { window.removeEventListener('keydown', onKeyDown, true); window.removeEventListener('keyup', onKeyUp); canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerdown', onPointerDown); window.removeEventListener('pointerup', onPointerUp); window.removeEventListener('pointercancel', onPointerUp); window.removeEventListener('blur', release); window.removeEventListener('pagehide', release); document.removeEventListener('visibilitychange', release); };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!socket.connected) return;
      const keys = keysRef.current;
      const mobile = mobileRef.current;
      const left = keys.has('arrowleft') || keys.has('a');
      const right = keys.has('arrowright') || keys.has('d');
      const up = keys.has('arrowup') || keys.has('w');
      const down = keys.has('arrowdown');
      const aimX = Number(right) - Number(left);
      const aimY = Number(down) - Number(up);
      const keyboardAimAngle = aimX || aimY ? Math.atan2(aimY, aimX) : inputRef.current.aimAngle;
      const aimAngle = mouseRef.current.active
        ? getMouseAim(snapshotRef.current, localId, cameraRef.current, mouseRef.current.x, mouseRef.current.y, canvasRef.current)
        : aimX || aimY
          ? keyboardAimAngle
          : mobile.aimAngleSet
            ? mobile.aimAngle
            : inputRef.current.aimAngle;
      const command: InputCommand = {
        seq: ++seqRef.current,
        left: left || mobile.left,
        right: right || mobile.right,
        jump: up || mobile.jump,
        jetpack: keys.has('arrowup') || keys.has('shift') || mobile.jetpack,
        shoot: keys.has('x') || mouseRef.current.down || mobile.shoot || mobile.shootPulse > 0,
        reload: false,
        aimAngle,
      };
      if (command.shoot && Date.now() - audioRef.current.lastShotAt >= WORLD.fireInterval * 1000) {
        gameAudio.gunshot();
        audioRef.current.lastShotAt = Date.now();
      }
      if (command.jump && !inputRef.current.jump) gameAudio.jump();
      inputRef.current = command;
      socket.emit('input', command);
      mobileRef.current.shootPulse = 0;
    }, 33);
    return () => window.clearInterval(interval);
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;
    let lastTime = performance.now();
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const render = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      const current = snapshotRef.current;
      if (current) drawScene(context, canvas, current, localId, visualRef.current, cameraRef.current, dt, time);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [localId]);

  return <><canvas className="game-canvas" ref={canvasRef} tabIndex={0} aria-label="Lendzone game arena" /><MobileControls onChange={(next) => { mobileRef.current = next; }} /><div className="orientation-lock" role="status" aria-live="polite"><div className="orientation-lock-card"><div className="orientation-lock-icon">↻</div><strong>ROTATE TO LANDSCAPE</strong><span>Turn your phone sideways for the best controls.</span></div></div></>;
}

function getMouseAim(snapshot: GameSnapshot | null, localId: string, camera: { x: number; y: number; zoom: number }, x: number, y: number, canvas: HTMLCanvasElement | null): number {
  if (!snapshot || !canvas) return 0;
  const local = snapshot.players.find((player) => player.id === localId);
  if (!local) return 0;
  const rect = canvas.getBoundingClientRect();
  const px = (local.x + WORLD.playerWidth / 2 - camera.x) * camera.zoom + rect.width / 2;
  const py = (local.y + WORLD.playerHeight / 2 - camera.y) * camera.zoom + rect.height / 2;
  return Math.atan2(y - py, x - px);
}

function drawScene(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, snapshot: GameSnapshot, localId: string, visuals: Map<string, { x: number; y: number; last: number }>, camera: { x: number; y: number; zoom: number }, dt: number, time: number): void {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const local = snapshot.players.find((player) => player.id === localId);
  const targetX = local ? local.x + WORLD.playerWidth / 2 : WORLD.width / 2;
  const targetY = local ? local.y + WORLD.playerHeight / 2 : WORLD.height / 2;
  const viewWidth = Math.max(760, Math.min(1450, width / 0.82));
  const viewHeight = Math.max(520, Math.min(900, height / 0.82));
  camera.zoom = Math.min(width / viewWidth, height / viewHeight);
  camera.x += (targetX - camera.x) * Math.min(1, dt * 5);
  camera.y += (targetY - camera.y) * Math.min(1, dt * 5);
  camera.x = Math.max(viewWidth / 2, Math.min(WORLD.width - viewWidth / 2, camera.x));
  camera.y = Math.max(viewHeight / 2, Math.min(WORLD.height - viewHeight / 2, camera.y));

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#071120'); gradient.addColorStop(1, '#101e30');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 - camera.x * camera.zoom, height / 2 - camera.y * camera.zoom);
  ctx.scale(camera.zoom, camera.zoom);
  drawWorldBackdrop(ctx, camera, width, height);
  drawPlatforms(ctx, snapshot.platforms ?? PLATFORM_LAYOUT);
  for (const projectile of snapshot.projectiles) drawProjectile(ctx, projectile.x, projectile.y, projectile.vx, projectile.vy);
  for (const player of snapshot.players) {
    if (!player.alive) continue;
    let visual = visuals.get(player.id);
    if (!visual) { visual = { x: player.x, y: player.y, last: time }; visuals.set(player.id, visual); }
    const smoothing = Math.min(1, dt * (player.id === localId ? 20 : 12));
    visual.x += (player.x - visual.x) * smoothing;
    visual.y += (player.y - visual.y) * smoothing;
    visual.last = time;
    drawPlayer(ctx, player, visual.x, visual.y, player.id === localId, time);
  }
  ctx.restore();
  if (snapshot.phase === 'PLAYING') drawCrosshair(ctx, canvas, local, camera);
}

function drawWorldBackdrop(ctx: CanvasRenderingContext2D, camera: { x: number; y: number; zoom: number }, width: number, height: number): void {
  ctx.fillStyle = '#0b1828'; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  ctx.strokeStyle = 'rgba(85, 132, 178, 0.08)'; ctx.lineWidth = 1;
  const startX = Math.floor((camera.x - width / camera.zoom / 2) / 120) * 120;
  const endX = camera.x + width / camera.zoom / 2;
  for (let x = startX; x < endX; x += 120) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD.height); ctx.stroke(); }
  const startY = Math.floor((camera.y - height / camera.zoom / 2) / 120) * 120;
  const endY = camera.y + height / camera.zoom / 2;
  for (let y = startY; y < endY; y += 120) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y); ctx.stroke(); }
  ctx.fillStyle = 'rgba(46,196,182,0.05)'; ctx.beginPath(); ctx.arc(420, 440, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(139,92,246,0.06)'; ctx.beginPath(); ctx.arc(1880, 340, 340, 0, Math.PI * 2); ctx.fill();
}

function drawPlatforms(ctx: CanvasRenderingContext2D, platforms: typeof PLATFORM_LAYOUT): void {
  for (const platform of platforms) {
    ctx.fillStyle = platform.kind === 'ground' ? '#162e42' : platform.kind === 'wall' ? '#132638' : '#1b3950';
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    ctx.fillStyle = platform.kind === 'ground' ? '#2ec4b6' : platform.kind === 'wall' ? '#d56b4d' : '#49a5ad';
    ctx.fillRect(platform.x, platform.y, platform.width, 4);
    ctx.fillStyle = 'rgba(5, 13, 24, 0.5)';
    for (let x = platform.x + 18; x < platform.x + platform.width - 8; x += 42) ctx.fillRect(x, platform.y + 12, 22, 3);
  }
}

function drawProjectile(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number): void {
  const length = Math.min(35, Math.hypot(vx, vy) * 0.035);
  const angle = Math.atan2(vy, vx);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.strokeStyle = '#ffe66d'; ctx.shadowBlur = 12; ctx.shadowColor = '#ffe66d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-length, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.restore();
}

function drawPlayer(ctx: CanvasRenderingContext2D, player: PlayerSnapshot, x: number, y: number, local: boolean, time: number): void {
  const bob = player.grounded ? Math.sin(time / 90 + x * 0.01) * 1.8 : 0;
  const centerX = x + WORLD.playerWidth / 2;
  const centerY = y + WORLD.playerHeight / 2;
  ctx.save();
  if (player.spawnProtectedUntil > Date.now()) { ctx.strokeStyle = 'rgba(255,230,109,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([7, 5]); ctx.beginPath(); ctx.arc(centerX, centerY, 42, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  if (player.jetpacking) { ctx.fillStyle = '#ffe66d'; ctx.shadowBlur = 14; ctx.shadowColor = '#ff9f1c'; ctx.beginPath(); ctx.moveTo(x + 10, y + 45); ctx.lineTo(x + 18, y + 78 + Math.sin(time / 60) * 8); ctx.lineTo(x + 24, y + 48); ctx.fill(); ctx.shadowBlur = 0; }
  ctx.fillStyle = '#182336'; ctx.fillRect(x + 3, y + 24 + bob, 8, 23); ctx.fillRect(x + 31, y + 24 + bob, 8, 23);
  ctx.fillStyle = player.color; ctx.strokeStyle = '#07111e'; ctx.lineWidth = 3; roundedRect(ctx, x + 5, y + 21 + bob, 32, 30, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f6c6a4'; ctx.beginPath(); ctx.arc(centerX, y + 16 + bob, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#26334b'; ctx.fillRect(x + 8, y + 5 + bob, 27, 7); ctx.fillRect(x + 13, y + 1 + bob, 17, 7);
  const weaponAngle = player.aimAngle;
  ctx.save(); ctx.translate(centerX, y + 34 + bob); ctx.rotate(weaponAngle); ctx.strokeStyle = '#a9b8cd'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(30, 0); ctx.stroke(); ctx.strokeStyle = '#516279'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(12, 8); ctx.stroke(); if (player.shooting) { ctx.fillStyle = '#ffe66d'; ctx.shadowBlur = 18; ctx.shadowColor = '#ffe66d'; ctx.beginPath(); ctx.moveTo(31, 0); ctx.lineTo(43, -6); ctx.lineTo(39, 0); ctx.lineTo(43, 6); ctx.fill(); } ctx.restore();
  const barWidth = 52; ctx.fillStyle = 'rgba(2,8,16,0.8)'; ctx.fillRect(centerX - barWidth / 2, y - 19, barWidth, 5); ctx.fillStyle = player.hp > 35 ? '#2ec4b6' : '#ff4d6d'; ctx.fillRect(centerX - barWidth / 2, y - 19, barWidth * (player.hp / player.maxHp), 5);
  ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = local ? '#ffffff' : 'rgba(229,239,248,0.88)'; ctx.fillText(player.name, centerX, y - 26);
  if (local) { ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(centerX, centerY, 35, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius); ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius); ctx.arcTo(x, y, x + width, y, radius); ctx.closePath();
}

function drawCrosshair(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, local: PlayerSnapshot | undefined, camera: { x: number; y: number; zoom: number }): void {
  if (!local) return;
  const x = canvas.clientWidth / 2 + (local.x + WORLD.playerWidth / 2 - camera.x) * camera.zoom;
  const y = canvas.clientHeight / 2 + (local.y + WORLD.playerHeight / 2 - camera.y) * camera.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.stroke();
}

function MobileControls({ onChange }: { onChange: (value: MobileInput) => void }) {
  const state = useRef<MobileInput>({ ...EMPTY_MOBILE });
  const [visual, setVisual] = useState({ left: false, right: false, shoot: false, jump: false, jetpack: false });
  const pointers = useRef({ left: null as number | null, right: null as number | null, shoot: null as number | null, jump: null as number | null, jetpack: null as number | null });
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const capturePointer = (element: HTMLElement, pointerId: number) => {
    try { element.setPointerCapture(pointerId); } catch { /* The browser may have cancelled the pointer already. */ }
  };
  const resetAll = () => {
    pointers.current = { left: null, right: null, shoot: null, jump: null, jetpack: null };
    state.current = { ...EMPTY_MOBILE };
    setVisual({ left: false, right: false, shoot: false, jump: false, jetpack: false });
    onChangeRef.current({ ...EMPTY_MOBILE });
  };
  const releasePointer = (pointerId: number) => {
    let changed = false;
    (['left', 'right', 'shoot', 'jump', 'jetpack'] as const).forEach((key) => {
      if (pointers.current[key] !== pointerId) return;
      pointers.current[key] = null;
      state.current[key] = false;
      changed = true;
    });
    if (changed) {
      setVisual((current) => ({ ...current, left: state.current.left, right: state.current.right, shoot: state.current.shoot, jump: state.current.jump, jetpack: state.current.jetpack }));
      onChangeRef.current({ ...state.current });
    }
  };
  useEffect(() => {
    const onPointerRelease = (event: globalThis.PointerEvent) => releasePointer(event.pointerId);
    window.addEventListener('pointerup', onPointerRelease);
    window.addEventListener('pointercancel', onPointerRelease);
    window.addEventListener('blur', resetAll);
    window.addEventListener('pagehide', resetAll);
    document.addEventListener('visibilitychange', resetAll);
    return () => {
      window.removeEventListener('pointerup', onPointerRelease);
      window.removeEventListener('pointercancel', onPointerRelease);
      window.removeEventListener('blur', resetAll);
      window.removeEventListener('pagehide', resetAll);
      document.removeEventListener('visibilitychange', resetAll);
    };
  }, []);
  const buttonDown = (key: 'left' | 'right' | 'shoot' | 'jump' | 'jetpack', event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    gameAudio.unlock();
    if (pointers.current[key] !== null && pointers.current[key] !== event.pointerId) return;
    pointers.current[key] = event.pointerId;
    if (key === 'left') {
      state.current.aimAngle = Math.PI;
      state.current.aimAngleSet = true;
    } else if (key === 'right') {
      state.current.aimAngle = 0;
      state.current.aimAngleSet = true;
    }
    // shootPulse is a one-frame event. Keep it out of the persistent mobile
    // state after emitting it, otherwise a later movement press can replay a
    // stale tap and fire without the SHOOT button being held.
    state.current[key] = true;
    const nextState = { ...state.current, shootPulse: key === 'shoot' ? 1 : 0 };
    if (key === 'shoot') state.current.shootPulse = 0;
    capturePointer(event.currentTarget, event.pointerId);
    setVisual((current) => ({ ...current, [key]: true }));
    onChange(nextState);
  };
  const buttonUp = (key: 'left' | 'right' | 'shoot' | 'jump' | 'jetpack', pointerId: number) => {
    if (pointers.current[key] !== pointerId) return;
    pointers.current[key] = null;
    state.current[key] = false;
    setVisual((current) => ({ ...current, [key]: false }));
    onChange({ ...state.current });
  };
  const buttonProps = (key: 'left' | 'right' | 'shoot' | 'jump' | 'jetpack') => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => buttonDown(key, event),
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => buttonUp(key, event.pointerId),
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => buttonUp(key, event.pointerId),
    onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => buttonUp(key, event.pointerId),
  });
  return <div className="mobile-controls" onContextMenu={(event) => event.preventDefault()}><div className="direction-buttons" aria-label="Movement controls"><button type="button" className={`direction-button ${visual.left ? 'active' : ''}`} aria-label="Move left" {...buttonProps('left')}>◀<small>LEFT</small></button><button type="button" className={`direction-button ${visual.right ? 'active' : ''}`} aria-label="Move right" {...buttonProps('right')}>▶<small>RIGHT</small></button></div><div className="touch-buttons" aria-label="Action controls"><button type="button" className={`shoot-button ${visual.shoot ? 'active' : ''}`} {...buttonProps('shoot')}>SHOOT</button><button type="button" className={visual.jump ? 'active' : ''} {...buttonProps('jump')}>JUMP</button><button type="button" className={`boost-button ${visual.jetpack ? 'active' : ''}`} {...buttonProps('jetpack')}>BOOST</button></div></div>;
}
