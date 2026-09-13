/**
 * Generative background music (no audio files). A slow ambient pad + bass +
 * sparse bell, scheduled on an interval.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.7.4.
 */
import type { AudioSynth } from "./AudioSynth.js";
import type { AudioBus } from "./AudioBus.js";

const ROOTS = [220.0, 174.61, 196.0, 164.81]; // A3, F3, G3, E3
const BELLS = [523.25, 659.25, 783.99, 880.0, 1046.5];

export class MusicGenerator {
  private synth: AudioSynth | null = null;
  private timer: number | null = null;
  private step = 0;
  private running = false;

  constructor(private bus: AudioBus) {}

  start(): void {
    if (this.running) return;
    this.synth = this.bus.ensureMusicSynth();
    if (!this.synth) return;
    this.running = true;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 4200);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private tick(): void {
    if (!this.running || !this.synth) return;
    const s = this.synth;
    const root = ROOTS[this.step % ROOTS.length];
    const third = this.step % 2 === 0 ? 1.25 : 1.2; // major-ish / minor-ish

    // sustained pad chord
    [1, third, 1.5].forEach((m, i) => {
      s.tone(root * m, 4.4, { type: "sine", gain: 0.06, attack: 1.3, delay: i * 0.08 });
    });
    // soft bass
    s.tone(root / 2, 4.6, { type: "sine", gain: 0.07, attack: 1.0 });
    // sparse bell every other bar
    if (this.step % 2 === 0) {
      s.tone(BELLS[this.step % BELLS.length], 1.6, { type: "triangle", gain: 0.032, attack: 0.02, delay: 1.0 });
    }
    this.step++;
  }
}
