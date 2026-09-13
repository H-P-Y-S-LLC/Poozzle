/**
 * mulberry32 — 32-bit state PRNG.
 *
 * Spec: Documents/ThreeJsWebPortDevDoc.md §3.1.5.1
 * - No dependence on Math.random (reproducible).
 * - Same seed => same sequence in this Web build.
 * - Does NOT need to match UE's FRandomStream.
 */
export class Prng {
  private s: number;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.s = this.seed;
  }

  /** next uint32 */
  nextUint32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** [0, 1) */
  next(): number {
    return this.nextUint32() / 4294967296;
  }

  /** [min, max] inclusive integer */
  intRange(min: number, max: number): number {
    if (max < min) [min, max] = [max, min];
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [min, max) float */
  floatRange(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Weighted index pick; returns 0 if weights empty/all-zero. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w > 0 ? w : 0;
    if (total <= 0) return 0;
    let pick = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      pick -= weights[i] > 0 ? weights[i] : 0;
      if (pick <= 0) return i;
    }
    return weights.length - 1;
  }

  /** In-place Fisher–Yates (descending, as required by §3.1.5.3). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.intRange(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Preferred seed source: CSPRNG, fallback to time-based. */
export function randomSeed32(): number {
  try {
    if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
      return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
    }
  } catch {
    /* ignore */
  }
  const perf = typeof performance !== "undefined" ? performance.now() : 0;
  return (Date.now() ^ (perf * 1000)) >>> 0;
}
