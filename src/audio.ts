type AudioNodeFactory = typeof window.AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicBus: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;
type MusicMode = 'lobby' | 'combat';
let musicMode: MusicMode | null = null;

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

function musicTick(): void {
  const ctx = getContext();
  const bus = musicBus;
  const mode = musicMode;
  if (!ctx || !bus || !mode) return;
  const combat = mode === 'combat';
  const interval = combat ? 180 : 260;
  const bassline = combat ? [55, 55, 65.41, 55, 73.42, 65.41, 55, 49] : [73.42, 73.42, 87.31, 98, 73.42, 65.41, 58.27, 65.41];
  const pulse = combat ? [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196] : [293.66, 349.23, 440, 523.25, 440, 349.23, 293.66, 261.63];
  const bass = bassline[musicStep % bassline.length];
  const lead = pulse[musicStep % pulse.length];
  tone(bass, bass * 0.9, combat ? 0.15 : 0.22, combat ? 'sawtooth' : 'triangle', combat ? 0.14 : 0.1, 0.02, bus);
  tone(lead, lead * 1.02, combat ? 0.09 : 0.14, combat ? 'square' : 'sine', combat ? 0.045 : 0.035, 0.025, bus);
  tone(combat ? 110 : 146.83, combat ? 52 : 110, combat ? 0.12 : 0.18, 'triangle', combat ? 0.065 : 0.045, 0.02, bus);
  if (combat) noise(0.035, 0.035, 0.02, bus);
  if (combat && musicStep % 4 === 0) tone(70, 38, 0.12, 'sawtooth', 0.08, 0.02, bus);
  if (!combat && musicStep % 4 === 2) tone(196, 392, 0.12, 'sine', 0.025, 0.02, bus);
  musicStep += 1;
  musicTimer = window.setTimeout(musicTick, interval);
}

function startMusic(mode: MusicMode): void {
  const ctx = getContext();
  if (!ctx || !master) return;
  if (musicTimer !== null && musicMode === mode) return;
  stopMusic();
  unlock();
  musicBus = ctx.createGain();
  musicBus.gain.setValueAtTime(mode === 'combat' ? 1 : 0.8, ctx.currentTime);
  musicBus.connect(master);
  musicMode = mode;
  musicStep = 0;
  musicTick();
}

function stopMusic(): void {
  if (musicTimer !== null) window.clearTimeout(musicTimer);
  musicTimer = null;
  if (musicBus) musicBus.disconnect();
  musicBus = null;
  musicMode = null;
}

export const gameAudio = {
  unlock,
  gunshot() {
    unlock();
    noise(0.07, 0.18);
    tone(190, 42, 0.09, 'sawtooth', 0.11);
    tone(920, 180, 0.035, 'square', 0.045, 0.005);
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
