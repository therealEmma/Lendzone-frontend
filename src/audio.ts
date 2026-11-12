type AudioNodeFactory = typeof window.AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
type MusicMode = 'lobby' | 'combat';
let musicMode: MusicMode | null = null;
let musicPlayer: HTMLAudioElement | null = null;
const gunshotPool: HTMLAudioElement[] = [];
let gunshotIndex = 0;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const AudioContextClass = (window.AudioContext || (window as Window & { webkitAudioContext?: AudioNodeFactory }).webkitAudioContext) as AudioNodeFactory | undefined;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.24;
    master.connect(context.destination);
  }
  return context;
}

function ensureNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function unlock(): void {
  const ctx = getContext();
  if (ctx?.state === 'suspended') void ctx.resume();
}

function tone(startFrequency: number, endFrequency: number, duration: number, type: OscillatorType, volume: number, delay = 0, destination: AudioNode | null = master): void {
  const ctx = getContext();
  if (!ctx || !destination) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(duration: number, volume: number, delay = 0, destination: AudioNode | null = master): void {
  const ctx = getContext();
  if (!ctx || !destination) return;
  const start = ctx.currentTime + delay;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = ensureNoise(ctx);
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(gain).connect(destination);
  source.start(start);
  source.stop(start + duration);
}

function playFallbackGunshot(): void {
  noise(0.07, 0.18);
  tone(190, 42, 0.09, 'sawtooth', 0.11);
  tone(920, 180, 0.035, 'square', 0.045, 0.005);
}

function playGunshotSample(): void {
  if (typeof window === 'undefined') {
    playFallbackGunshot();
    return;
  }
  const player = gunshotPool[gunshotIndex] || new Audio('/audio/Gunshot.mp3');
  if (gunshotPool.length < 6) gunshotPool.push(player);
  gunshotIndex = (gunshotIndex + 1) % 6;
  player.volume = 0.62;
  player.currentTime = 0;
  void player.play().catch(() => playFallbackGunshot());
}

function startMusic(mode: MusicMode): void {
  if (typeof window === 'undefined') return;
  if (!musicPlayer) {
    musicPlayer = new Audio();
    musicPlayer.loop = true;
    musicPlayer.preload = 'auto';
  }
  if (musicMode === mode && !musicPlayer.paused) return;
  const track = mode === 'combat' ? '/audio/combat.mp3' : '/audio/lobby.mp3';
  musicPlayer.pause();
  musicPlayer.src = track;
  musicPlayer.currentTime = 0;
  musicPlayer.volume = mode === 'combat' ? 0.48 : 0.35;
  musicMode = mode;
  void musicPlayer.play().catch(() => undefined);
}

function stopMusic(): void {
  if (musicPlayer) {
    musicPlayer.pause();
    musicPlayer.removeAttribute('src');
    musicPlayer.load();
  }
  musicPlayer = null;
  musicMode = null;
}

export const gameAudio = {
  unlock,
  gunshot() {
    unlock();
    playGunshotSample();
  },
  hit() {
    unlock();
    noise(0.045, 0.06);
    tone(210, 72, 0.11, 'square', 0.09);
  },
  elimination() {
    unlock();
    tone(260, 120, 0.13, 'triangle', 0.08);
    tone(120, 52, 0.2, 'sawtooth', 0.07, 0.08);
  },
  jump() {
    unlock();
    tone(230, 470, 0.12, 'triangle', 0.04);
  },
  boost() {
    unlock();
    tone(85, 55, 0.12, 'sawtooth', 0.035);
    noise(0.08, 0.025);
  },
  reload() {
    unlock();
    tone(500, 290, 0.06, 'square', 0.045);
    tone(720, 460, 0.07, 'square', 0.04, 0.1);
  },
  countdown() {
    unlock();
    tone(440, 440, 0.12, 'square', 0.05);
  },
  roundStart() {
    unlock();
    tone(260, 520, 0.12, 'triangle', 0.07);
    tone(520, 980, 0.2, 'sawtooth', 0.06, 0.11);
    startMusic('combat');
  },
  lobbyMusic() {
    unlock();
    startMusic('lobby');
  },
  stopMusic() {
    stopMusic();
  },
  ui() {
    unlock();
    tone(480, 650, 0.07, 'square', 0.035);
  },
};
