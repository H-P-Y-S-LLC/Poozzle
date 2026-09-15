/**
 * Sound effect recipes — each is a procedural synthesis call (no audio files).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.7.3.
 */
import type { AudioSynth } from "./AudioSynth.js";

export interface SfxOptions {
  combo?: number;
  tileType?: number;
  pitch?: number;
}

export type SfxName =
  | "select"
  | "uiTap"
  | "uiNav"
  | "uiPrimary"
  | "swap"
  | "swapInvalid"
  | "clear"
  | "shatter"
  | "specialCreate"
  | "specialExplode"
  | "blockerBreak"
  | "bossHit"
  | "coinToss"
  | "coinWin"
  | "skill"
  | "victory"
  | "defeat";

const TILE_BASE: Record<number, number> = { 1: 392, 2: 440, 3: 494, 4: 523, 5: 587, 6: 659, 7: 330 };

export const SFX_RECIPES: Record<SfxName, (synth: AudioSynth, opts: SfxOptions) => void> = {
  // low, muted button ticks — three flavours so button types sound different
  uiTap: (s) => {
    s.tone(300, 0.07, { type: "triangle", gain: 0.12, toFreq: 200 });
    s.noise(0.04, { type: "lowpass", freq: 1400, q: 0.8, gain: 0.05 });
  },
  uiNav: (s) => {
    s.tone(210, 0.09, { type: "sine", gain: 0.13, toFreq: 150 });
    s.tone(420, 0.05, { type: "triangle", gain: 0.05 });
  },
  uiPrimary: (s) => {
    s.tone(180, 0.13, { type: "triangle", gain: 0.15, toFreq: 120 });
    s.tone(270, 0.1, { type: "sine", gain: 0.08, delay: 0.02 });
  },
  select: (s) => {
    s.tone(720, 0.06, { type: "triangle", gain: 0.12, toFreq: 900 });
  },
  swap: (s) => {
    s.tone(520, 0.08, { type: "triangle", gain: 0.16, toFreq: 700 });
    s.noise(0.1, { type: "bandpass", freq: 1200, q: 0.7, gain: 0.12 });
  },
  swapInvalid: (s) => {
    s.tone(200, 0.14, { type: "square", gain: 0.14, toFreq: 120 });
  },
  clear: (s, o) => {
    const combo = Math.max(1, o.combo ?? 1);
    const mul = 1 + (combo - 1) * 0.12;
    const base = TILE_BASE[o.tileType ?? 1] ?? 440;
    s.tone(base * mul, 0.18, { type: "triangle", gain: 0.22, toFreq: base * mul * 1.5 });
    if (combo > 1) s.tone(base * mul * 2, 0.12, { type: "sine", gain: 0.12, delay: 0.03 });
  },
  shatter: (s, o) => {
    const p = o.pitch ?? 1;
    // loud crackle + a short body thud so it reads clearly over the music
    s.noise(0.16, { type: "highpass", freq: 1500 * p, gain: 0.62, decay: 0.15 });
    s.noise(0.1, { type: "bandpass", freq: 700 * p, q: 0.7, gain: 0.35, decay: 0.09 });
    s.tone(340 * p, 0.12, { type: "triangle", gain: 0.34, toFreq: 190 * p });
    s.tone(180 * p, 0.14, { type: "sine", gain: 0.3, toFreq: 90 * p });
  },
  specialCreate: (s) => {
    [660, 880, 1100].forEach((f, i) => s.tone(f, 0.2, { type: "triangle", gain: 0.16, delay: i * 0.04, toFreq: f * 1.4 }));
  },
  specialExplode: (s) => {
    s.tone(160, 0.3, { type: "sine", gain: 0.4, toFreq: 50 });
    s.noise(0.3, { type: "lowpass", freq: 1800, gain: 0.35, decay: 0.28 });
  },
  blockerBreak: (s) => {
    s.noise(0.18, { type: "bandpass", freq: 900, q: 0.6, gain: 0.3, decay: 0.16 });
    s.tone(220, 0.14, { type: "square", gain: 0.12, toFreq: 140 });
  },
  // insect-like screech: stridulation pulses + high squeal + low body thud
  bossHit: (s, o) => {
    const p = (o.pitch ?? 1) * (0.95 + Math.random() * 0.1);
    // rapid chirp pulses (the "虫叫" texture)
    for (let i = 0; i < 12; i++) {
      const f = (1500 + i * 90 + (i % 2 ? 220 : 0)) * p;
      s.tone(f, 0.035, { type: "square", gain: i < 6 ? 0.16 : 0.11, delay: i * 0.026 });
    }
    // descending squeal
    s.tone(2600 * p, 0.28, { type: "sawtooth", gain: 0.14, toFreq: 900 * p });
    // low body impact
    s.tone(150 * p, 0.3, { type: "sine", gain: 0.5, toFreq: 60 * p });
    // airy crack
    s.noise(0.14, { type: "bandpass", freq: 3600, q: 1.2, gain: 0.22, decay: 0.12 });
  },
  // coin flip: metallic whoosh + tumbling clicks
  coinToss: (s) => {
    s.noise(0.34, { type: "bandpass", freq: 2600, q: 0.8, gain: 0.16, sweepTo: 900 });
    for (let i = 0; i < 6; i++) s.tone(1800 - i * 120, 0.05, { type: "triangle", gain: 0.1, delay: i * 0.05 });
    s.tone(320, 0.22, { type: "sine", gain: 0.16, toFreq: 180, delay: 0.28 });
  },
  // heads: bright ascending chime
  coinWin: (s) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      s.tone(f, 0.36, { type: "triangle", gain: 0.2, delay: i * 0.07 })
    );
    s.noise(0.3, { type: "highpass", freq: 5200, q: 0.7, gain: 0.08 });
  },
  skill: (s) => {
    s.tone(90, 0.5, { type: "sawtooth", gain: 0.24, toFreq: 60 });
    s.noise(0.4, { type: "bandpass", freq: 500, q: 0.5, gain: 0.16, decay: 0.36 });
  },
  victory: (s) => {
    [523, 659, 784, 1046].forEach((f, i) => s.tone(f, 0.35, { type: "triangle", gain: 0.22, delay: i * 0.12, toFreq: f * 1.5 }));
  },
  defeat: (s) => {
    [392, 330, 262, 196].forEach((f, i) => s.tone(f, 0.3, { type: "sawtooth", gain: 0.2, delay: i * 0.12, toFreq: f * 0.75 }));
  },
};
