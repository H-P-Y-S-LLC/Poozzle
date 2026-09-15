/**
 * Generative background music (no audio files). Three moods share the same
 * synth but differ in tempo, scale, timbre and percussion:
 *  - map:   slow, gentle, "悠扬" (ambient pads + sparse bell melody)
 *  - level: steady groove, "节奏感强" (bass pulse + arpeggio + soft hats)
 *  - boss:  fast, tense, "激烈" (driving minor bass + stabs + kick/hats)
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.7.4.
 */
import type { AudioSynth } from "./AudioSynth.js";
import type { AudioBus } from "./AudioBus.js";

export type MusicMode = "map" | "level" | "boss";

interface Mood {
  interval: number;
  roots: number[];
  scale: number[];
  bells: number[];
}

const MOODS: Record<MusicMode, Mood> = {
  map: {
    interval: 6000,
    roots: [220.0, 174.61, 196.0, 164.81],
    scale: [1, 1.2, 1.25, 1.5],
    bells: [523.25, 659.25, 783.99, 880.0, 1046.5],
  },
  level: {
    interval: 1050,
    roots: [261.63, 220.0, 196.0, 174.61],
    scale: [1, 1.25, 1.5, 1.75],
    bells: [659.25, 783.99, 880.0, 1046.5],
  },
  boss: {
    interval: 560,
    roots: [146.83, 155.56, 138.59, 164.81], // tense low movement
    scale: [1, 1.1892, 1.4142, 1.5874], // diminished / tritone flavour
    bells: [622.25, 739.99, 830.61],
  },
};

export class MusicGenerator {
  private synth: AudioSynth | null = null;
  private timer: number | null = null;
  private step = 0;
  private running = false;
  private mode: MusicMode = "map";

  constructor(private bus: AudioBus) {}

  start(): void {
    if (this.running) return;
    this.synth = this.bus.ensureMusicSynth();
    if (!this.synth) return;
    this.running = true;
    this.schedule();
  }

  /** Switch mood; restarts the scheduler when running. */
  setMode(mode: MusicMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.step = 0;
    if (this.running) {
      this.clearTimer();
      this.schedule();
    }
  }

  getMode(): MusicMode {
    return this.mode;
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  isRunning(): boolean {
    return this.running;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const mood = MOODS[this.mode];
    this.tick();
    this.timer = window.setInterval(() => this.tick(), mood.interval);
  }

  private tick(): void {
    if (!this.running || !this.synth) return;
    const s = this.synth;
    const mood = MOODS[this.mode];
    const t = this.step % mood.roots.length;
    const root = mood.roots[t];
    const deg = mood.scale[this.step % mood.scale.length];

    if (this.mode === "map") {
      // sustained pad + soft bass + sparse bell
      [1, mood.scale[1], mood.scale[3]].forEach((m, i) => {
        s.tone(root * m, 4.6, { type: "sine", gain: 0.06, attack: 1.3, delay: i * 0.08 });
      });
      s.tone(root / 2, 4.8, { type: "sine", gain: 0.07, attack: 1.0 });
      if (this.step % 2 === 0) {
        s.tone(mood.bells[this.step % mood.bells.length], 1.8, { type: "triangle", gain: 0.03, attack: 0.02, delay: 1.1 });
      }
    } else if (this.mode === "level") {
      // rhythmic groove: pulsing bass + arpeggio + kick/clap + hats
      s.tone(root / 2, 0.5, { type: "triangle", gain: 0.09, attack: 0.01 });
      s.tone(root * deg, 0.32, { type: "square", gain: 0.035, attack: 0.01, delay: 0.02 });
      s.tone(root * deg * 1.5, 0.28, { type: "triangle", gain: 0.03, attack: 0.01, delay: 0.3 });
      s.noise(0.06, { type: "highpass", freq: 6500, q: 0.6, gain: 0.03 });
      s.noise(0.1, { type: "lowpass", freq: 200, q: 0.7, gain: 0.06, delay: 0.52 }); // offbeat kick
      if (this.step % 2 === 1) s.noise(0.12, { type: "bandpass", freq: 2400, q: 0.8, gain: 0.05 });
      if (this.step % 4 === 2) s.noise(0.09, { type: "bandpass", freq: 1600, q: 0.7, gain: 0.05 }); // clap
    } else {
      // intense: driving bass, stabs, kick + snare + hats
      s.tone(root, 0.28, { type: "sawtooth", gain: 0.08, attack: 0.005 });
      s.tone(root / 2, 0.3, { type: "square", gain: 0.09, attack: 0.005 });
      s.tone(root * deg, 0.2, { type: "sawtooth", gain: 0.05, attack: 0.005, delay: 0.16 });
      s.tone(root * 1.5, 0.18, { type: "square", gain: 0.04, attack: 0.005, delay: 0.32 });
      s.noise(0.16, { type: "lowpass", freq: 180, q: 0.7, gain: 0.1 }); // kick
      s.noise(0.05, { type: "highpass", freq: 8000, q: 0.7, gain: 0.045 }); // hat
      s.noise(0.05, { type: "highpass", freq: 8000, q: 0.7, gain: 0.04 });
      if (this.step % 2 === 1) s.noise(0.09, { type: "bandpass", freq: 1800, q: 0.8, gain: 0.07 }); // snare
    }
    this.step++;
  }
}
