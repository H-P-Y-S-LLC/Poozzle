/**
 * Self-contained tween/easing library (no external deps).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §8.1 core/Tween.ts
 */

export type EaseFn = (t: number) => number;

export const Easing = {
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  easeOutElastic: (t: number): number => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeOutBounce: (t: number): number => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
} as const;

export interface TweenOptions {
  duration: number;
  ease?: EaseFn;
  delay?: number;
  onUpdate?: () => void;
  onComplete?: () => void;
}

interface Active {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  opts: Required<Pick<TweenOptions, "duration" | "ease" | "delay">> & TweenOptions;
  elapsed: number;
  done: boolean;
}

export class TweenManager {
  private active: Active[] = [];

  /** Tween numeric properties of a plain object. */
  to<T extends Record<string, number>>(target: T, to: Partial<T>, opts: TweenOptions): Active {
    const from: Record<string, number> = {};
    const t2: Record<string, number> = {};
    for (const key of Object.keys(to)) {
      const value = (to as Record<string, number>)[key];
      if (typeof value !== "number") continue;
      from[key] = target[key] ?? 0;
      t2[key] = value;
    }
    const active: Active = {
      target: target as unknown as Record<string, number>,
      from,
      to: t2,
      opts: {
        duration: Math.max(0.0001, opts.duration),
        ease: opts.ease ?? Easing.easeOutCubic,
        delay: opts.delay ?? 0,
        onUpdate: opts.onUpdate,
        onComplete: opts.onComplete,
      },
      elapsed: 0,
      done: false,
    };
    this.active.push(active);
    return active;
  }

  /** Advance all tweens. Returns number of live tweens. */
  update(dt: number): number {
    if (this.active.length === 0) return 0;
    const still: Active[] = [];
    for (const a of this.active) {
      if (a.done) continue;
      a.elapsed += dt;
      const local = a.elapsed - a.opts.delay;
      if (local < 0) {
        still.push(a);
        continue;
      }
      const raw = Math.min(1, local / a.opts.duration);
      const k = a.opts.ease(raw);
      for (const key of Object.keys(a.to)) {
        a.target[key] = a.from[key] + (a.to[key] - a.from[key]) * k;
      }
      a.opts.onUpdate?.();
      if (raw >= 1) {
        a.done = true;
        a.opts.onComplete?.();
      } else {
        still.push(a);
      }
    }
    this.active = still;
    return still.length;
  }

  cancel(target: unknown): void {
    this.active = this.active.filter((a) => a.target !== target);
  }

  clear(): void {
    this.active = [];
  }

  get size(): number {
    return this.active.length;
  }
}
