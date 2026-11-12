export type MatchPhase = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'RESULTS';

export type Color = string;

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  kind: 'ground' | 'platform' | 'wall' | 'cover';
}

export interface InputCommand {
  seq: number;
  left: boolean;
  right: boolean;
  jump: boolean;
  jetpack: boolean;
  shoot: boolean;
  reload: boolean;
  aimAngle: number;
}

export interface ScoreLine {
  kills: number;
  deaths: number;
  damage: number;
}

export interface PlayerSnapshot {
  id: string;
  name: string;
  color: Color;
  x: number;
  y: number;
  vx: number;
  vy: number;
  aimAngle: number;
  hp: number;
  maxHp: number;
  fuel: number;
  maxFuel: number;
  ammo: number;
  magazineSize: number;
  grounded: boolean;
  jetpacking: boolean;
  shooting: boolean;
  alive: boolean;
  respawnAt: number | null;
  spawnProtectedUntil: number;
  lastInputSeq: number;
  score: ScoreLine;
}

export interface ProjectileSnapshot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
}

export interface KillFeedItem {
  id: number;
  killer: string;
  victim: string;
  at: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  color: Color;
  kills: number;
  deaths: number;
  damage: number;
}

export interface GameSnapshot {
  serverTime: number;
  phase: MatchPhase;
  paused: boolean;
  timeRemaining: number;
  countdown: number;
  playerCount: number;
  maxPlayers: number;
  hostId: string | null;
  players: PlayerSnapshot[];
  projectiles: ProjectileSnapshot[];
  platforms?: Platform[];
  killFeed: KillFeedItem[];
  leaderboard: LeaderboardEntry[];
}

export interface SessionPayload {
  id: string;
  reconnectToken: string;
  isHost: boolean;
  phase: MatchPhase;
  maxPlayers: number;
}

export interface HostActionPayload {
  secret: string;
  action: 'start' | 'pause' | 'end' | 'restart' | 'duration' | 'capacity' | 'kick';
  durationSeconds?: number;
  capacity?: number;
  playerId?: string;
}

export const WORLD = {
  width: 2400,
  height: 1200,
  playerWidth: 42,
  playerHeight: 60,
  playerMaxHp: 100,
  maxFuel: 100,
  magazineSize: 30,
  bulletDamage: 20,
  bulletSpeed: 1180,
  bulletLifetime: 1.15,
  fireInterval: 0.1,
  reloadSeconds: 1.5,
  gravity: 1450,
  runSpeed: 360,
  jumpSpeed: 610,
  jetpackAccel: 1750,
  jetpackFuelPerSecond: 34,
  fuelRechargePerSecond: 25,
  tickRate: 30,
  snapshotRate: 12,
} as const;

export const PLATFORM_LAYOUT: Platform[] = [
  { x: 0, y: 1140, width: 2400, height: 60, kind: 'ground' },
  { x: 0, y: 0, width: 36, height: 1140, kind: 'wall' },
  { x: 2364, y: 0, width: 36, height: 1140, kind: 'wall' },
  { x: 245, y: 1020, width: 105, height: 120, kind: 'cover' },
  { x: 610, y: 1015, width: 90, height: 125, kind: 'cover' },
  { x: 1165, y: 1030, width: 130, height: 110, kind: 'cover' },
  { x: 1700, y: 1015, width: 110, height: 125, kind: 'cover' },
  { x: 2210, y: 1000, width: 90, height: 140, kind: 'cover' },
  { x: 510, y: 790, width: 78, height: 85, kind: 'cover' },
  { x: 1510, y: 805, width: 90, height: 165, kind: 'cover' },
  { x: 115, y: 965, width: 430, height: 28, kind: 'platform' },
  { x: 690, y: 875, width: 440, height: 28, kind: 'platform' },
  { x: 1285, y: 975, width: 390, height: 28, kind: 'platform' },
  { x: 1775, y: 820, width: 470, height: 28, kind: 'platform' },
  { x: 355, y: 695, width: 330, height: 28, kind: 'platform' },
  { x: 920, y: 590, width: 430, height: 28, kind: 'platform' },
  { x: 1510, y: 650, width: 310, height: 28, kind: 'platform' },
  { x: 2040, y: 505, width: 250, height: 28, kind: 'platform' },
  { x: 80, y: 420, width: 250, height: 28, kind: 'platform' },
  { x: 580, y: 330, width: 360, height: 28, kind: 'platform' },
  { x: 1130, y: 390, width: 320, height: 28, kind: 'platform' },
  { x: 1640, y: 300, width: 420, height: 28, kind: 'platform' },
];
