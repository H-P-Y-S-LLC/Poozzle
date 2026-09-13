import { describe, expect, it } from "vitest";
import { Prng, randomSeed32 } from "../../src/core/Prng.js";

describe("Prng (mulberry32)", () => {
  it("is deterministic for the same seed", () => {
    const a = new Prng(12345);
    const b = new Prng(12345);
    const seqA = Array.from({ length: 8 }, () => a.nextUint32());
    const seqB = Array.from({ length: 8 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it("differs for different seeds", () => {
    const a = new Prng(1).nextUint32();
    const b = new Prng(2).nextUint32();
    expect(a).not.toBe(b);
  });

  it("next() stays within [0,1)", () => {
    const p = new Prng(99);
    for (let i = 0; i < 5000; i++) {
      const v = p.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("intRange is inclusive and bounded", () => {
    const p = new Prng(7);
    for (let i = 0; i < 2000; i++) {
      const v = p.intRange(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("weightedIndex respects zero weights", () => {
    const p = new Prng(3);
    for (let i = 0; i < 1000; i++) {
      const idx = p.weightedIndex([0, 5, 0, 5]);
      expect([1, 3]).toContain(idx);
    }
    expect(p.weightedIndex([])).toBe(0);
    expect(p.weightedIndex([0, 0])).toBe(0);
  });

  it("shuffle is deterministic and a permutation", () => {
    const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const s1 = new Prng(42).shuffle([...base]);
    const s2 = new Prng(42).shuffle([...base]);
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(base);
  });

  it("exposes a 32-bit seed", () => {
    expect(new Prng(-1).seed).toBe(4294967295);
    expect(randomSeed32()).toBeGreaterThanOrEqual(0);
  });
});
