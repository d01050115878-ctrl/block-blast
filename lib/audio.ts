"use client";

interface ToneOptions {
  frequency: number;
  startTime: number;
  duration: number;
  type?: OscillatorType;
  peakGain?: number;
  attack?: number;
  release?: number;
}

let audioCtx: AudioContext | null = null;
let musicTimer: ReturnType<typeof setTimeout> | null = null;
let musicOn = false;
let musicRunning = false;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

function playTone(ctx: AudioContext, opts: ToneOptions) {
  const { frequency, startTime, duration, type = "sine", peakGain = 0.15, attack = 0.02, release = 0.15 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  const tEnd = startTime + duration;
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + attack);
  gain.gain.linearRampToValueAtTime(0, tEnd + release);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(tEnd + release + 0.05);
}

export function playPlaceSound() {
  const ctx = getContext();
  if (!ctx) return;
  playTone(ctx, {
    frequency: 520,
    startTime: ctx.currentTime,
    duration: 0.05,
    type: "triangle",
    peakGain: 0.1,
    attack: 0.004,
    release: 0.05,
  });
}

const CLEAR_NOTES = [523.25, 659.25, 783.99, 987.77, 1174.66]; // C5 E5 G5 B5 D6

export function playClearSound(linesCleared: number, combo: number) {
  const ctx = getContext();
  if (!ctx) return;
  const noteCount = Math.min(3 + linesCleared, 8);
  for (let i = 0; i < noteCount; i++) {
    const octaveBoost = 1 + Math.floor(i / CLEAR_NOTES.length) * 0.5;
    playTone(ctx, {
      frequency: CLEAR_NOTES[i % CLEAR_NOTES.length] * octaveBoost,
      startTime: ctx.currentTime + i * 0.055,
      duration: 0.16,
      type: "square",
      peakGain: 0.09,
      attack: 0.004,
      release: 0.12,
    });
  }
  if (combo > 1) {
    playTone(ctx, {
      frequency: 1568 * (1 + Math.min(combo, 6) * 0.06),
      startTime: ctx.currentTime + 0.05,
      duration: 0.16,
      type: "sawtooth",
      peakGain: 0.05,
      attack: 0.004,
      release: 0.2,
    });
  }
}

export function playGameOverSound() {
  const ctx = getContext();
  if (!ctx) return;
  [392, 349.23, 293.66, 220].forEach((freq, i) => {
    playTone(ctx, {
      frequency: freq,
      startTime: ctx.currentTime + i * 0.18,
      duration: 0.22,
      type: "triangle",
      peakGain: 0.12,
      attack: 0.01,
      release: 0.18,
    });
  });
}

// --- Background music: soft looping pad + arpeggio, synthesized live ---

const CHORDS: number[][] = [
  [261.63, 329.63, 392.0], // C E G
  [220.0, 261.63, 329.63], // A C E
  [174.61, 220.0,261.63], // F A C
  [196.0, 246.94, 392.0], // G B D
];

const BAR_SECONDS = 3.6;

function scheduleBar(ctx: AudioContext, chord: number[], barStart: number) {
  chord.forEach((freq) => {
    playTone(ctx, {
      frequency: freq,
      startTime: barStart,
      duration: BAR_SECONDS - 0.3,
      type: "sine",
      peakGain: 0.04,
      attack: 0.6,
      release: 0.6,
    });
  });
  const arp = [...chord, chord[0] * 2];
  const step = BAR_SECONDS / arp.length;
  arp.forEach((freq, i) => {
    playTone(ctx, {
      frequency: freq,
      startTime: barStart + i * step,
      duration: step - 0.05,
      type: "triangle",
      peakGain: 0.045,
      attack: 0.01,
      release: 0.2,
    });
  });
}

function loop(chordIndex: number, barTime: number) {
  if (!musicOn) {
    musicRunning = false;
    return;
  }
  const ctx = getContext();
  if (!ctx) return;
  scheduleBar(ctx, CHORDS[chordIndex % CHORDS.length], barTime);
  const delayMs = Math.max(0, (barTime - ctx.currentTime - 0.2) * 1000);
  musicTimer = setTimeout(() => loop(chordIndex + 1, barTime + BAR_SECONDS), delayMs);
}

export function startMusic() {
  const ctx = getContext();
  if (!ctx) return;
  musicOn = true;
  if (musicRunning) return;
  musicRunning = true;
  loop(0, ctx.currentTime + 0.1);
}

export function stopMusic() {
  musicOn = false;
  musicRunning = false;
  if (musicTimer) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
}
