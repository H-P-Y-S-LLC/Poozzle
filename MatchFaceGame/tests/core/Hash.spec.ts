import { describe, expect, it } from "vitest";
import { basename, dirname, fnv1a, hashStream, toLogicalPath } from "../../src/core/Hash.js";

describe("Hash", () => {
  it("toLogicalPath strips /Game/ and the UE .Name suffix", () => {
    expect(toLogicalPath("/Game/Models/paper/Paper.Paper")).toBe("Models/paper/Paper");
    expect(toLogicalPath("/Game/Models/Tiles/Tiles")).toBe("Models/Tiles/Tiles");
    expect(toLogicalPath("Models/boom/Boom.Boom")).toBe("Models/boom/Boom");
  });

  it("basename/dirname", () => {
    expect(basename("Models/paper/Paper")).toBe("Paper");
    expect(dirname("Models/paper/Paper")).toBe("Models/paper");
    expect(basename("Paper")).toBe("Paper");
    expect(dirname("Paper")).toBe("");
  });

  it("fnv1a is stable and 32-bit", () => {
    const h = fnv1a("Models/paper/Paper");
    expect(h).toBe(fnv1a("Models/paper/Paper"));
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });

  it("hashStream is deterministic and in [0,1)", () => {
    const s1 = hashStream(123);
    const s2 = hashStream(123);
    for (let i = 0; i < 100; i++) {
      const v = s1();
      expect(v).toBe(s2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
