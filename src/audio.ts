type AudioNodeFactory = typeof window.AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicBus: GainNode | null = null;
let musicTimer: number | null = null;
let musicStep = 0;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!context) {
    const AudioContextClass = (window.AudioContext || (window as Window & { webkitAudioContext?: AudioNodeFactory }).webkitAudioContext) as AudioNodeFactory | undefined;
    if (!AudioContextClass) return null;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = 0.18;
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
  if (!ctx || !musicBus) return;
  const bassline = [55, 55, 65.41, 55, 73.42, 65.41, 55, 49];
  const pulse = [220, 261.63, 329.63, 392, 329.63, 261.63, 220, 196];
  const bass = bassline[musicStep % bassline.length];
  const lead = pulse[musicStep % pulse.length];
  tone(bass, bass * 0.96, 0.19, 'sawtooth', 0.075, 0.02, musicBus);
  tone(lead, lead * 1.02, 0.075, 'square', 0.022, 0.025, musicBus);
  noise(0.025, 0.018, 0.02, musicBus);
  if (musicStep % 8 === 4) tone(110, 70, 0.16, 'triangle', 0.045, 0.02, musicBus);
  musicStep += 1;
  musicTimer = window.setTimeout(musicTick, 240);
}

function startMusic(): void {
  const ctx = getContext();
  if (!ctx || !master || musicTimer !== null) return;
  unlock();
  musicBus = ctx.createGain();
  musicBus.gain.setValueAtTime(0.7, ctx.currentTime);
  musicBus.connect(master);
  musicStep = 0;
  musicTick();
}

function stopMusic(): void {
  if (musicTimer !== null) window.clearTimeout(musicTimer);
  musicTimer = null;
  if (musicBus) musicBus.disconnect();
  musicBus = null;
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
    startMusic();
  },
  stopMusic() {
    stopMusic();
  },
  ui() {
    unlock();
    tone(480, 650, 0.07, 'square', 0.035);
  },
};
