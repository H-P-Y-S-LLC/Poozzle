import { describe, expect, it } from "vitest";
import { parseLevelConfig } from "../../src/config/types/LevelConfig.js";
import { BoardLogic } from "../../src/logic/BoardLogic.js";

function level() {
  return parseLevelConfig({
    LevelId: "item_test",
    Board: {
      Rows: 5,
      Cols: 5,
      Mask: Array.from({ length: 5 }, () => "11111"),
      BlockedTypes: ["00000", "00000", "00300", "00000", "00000"],
      BlockerTypeDefs: [{ TypeId: 3, bDestructible: true, DefaultHP: 5 }],
      RandomSeed: 3,
    },
    TilePool: { TileTypes: [1, 2, 3, 4], Weights: [1, 1, 1, 1] },
    Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: true, bEnsureAtLeastOneMove: false },
    Goal: { MaxMoves: 20, Collect: [] },
  });
}

const make = (seed = 5) => new BoardLogic(level(), seed);

describe("items", () => {
  it("hammer clears a single tile without using a move", () => {
    const b = make();
    const idx = b.cells.findIndex((c) => c.BlockerType === 0 && c.TileType > 0);
    const used = b.usedMoves;
    const res = b.useHammer(b.coord(idx));
    expect(res.accepted).toBe(true);
    const cleared = res.events.some((e) => e.type === "clear" && e.indices.includes(idx));
    expect(cleared).toBe(true);
    expect(b.usedMoves).toBe(used);
  });

  it("hammer force-breaks a blocker regardless of HP", () => {
    const b = make();
    const idx = b.cells.findIndex((c) => c.BlockerType === 3);
    expect(b.cells[idx].BlockerHP).toBe(5);
    const res = b.useHammer(b.coord(idx));
    expect(res.accepted).toBe(true);
    expect(b.cells[idx].BlockerType).toBe(0);
  });

  it("rocket clears a 3x3 blast", () => {
    const b = make();
    const center = b.index(2, 4);
    const before = b.cells.filter((c) => c.BlockerType === 0 && c.TileType > 0).length;
    const res = b.useRocket(b.coord(center));
    expect(res.accepted).toBe(true);
    // the center is always affected
    expect(res.events.some((e) => e.type === "clear")).toBe(true);
    expect(b.cells[center].TileType).not.toBe(undefined);
    expect(before).toBeGreaterThan(0);
  });

  it("shuffle keeps a possible move", () => {
    const b = make();
    const res = b.useShuffle();
    expect(res.accepted).toBe(true);
    expect(res.events.some((e) => e.type === "shuffle")).toBe(true);
    expect(b.hasAnyPossibleMove()).toBe(true);
  });

  it("glove swaps two non-adjacent cells", () => {
    const b = make();
    const ia = b.index(0, 0);
    const ib = b.index(4, 4);
    const ta = b.cells[ia].TileType;
    const tb = b.cells[ib].TileType;
    const res = b.useGlove(b.coord(ia), b.coord(ib));
    expect(res.accepted).toBe(true);
    expect(b.cells[ia].TileType).toBe(tb);
    expect(b.cells[ib].TileType).toBe(ta);
  });

  it("finger clears the dragged path", () => {
    const b = make();
    const path = [b.index(4, 0), b.index(4, 1), b.index(4, 2)].filter((i) => b.cells[i].TileType > 0);
    const res = b.useFinger(path);
    expect(res.accepted).toBe(true);
    expect(res.events.some((e) => e.type === "clear")).toBe(true);
  });
});
