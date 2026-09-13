import { describe, expect, it } from "vitest";
import { BoardLogic } from "../../src/logic/BoardLogic.js";
import { SpecialType, ClearTriggerType } from "../../src/logic/Match3Types.js";
import { parseLevelConfig } from "../../src/config/types/LevelConfig.js";

function makeLevel(overrides: Record<string, unknown> = {}) {
  return parseLevelConfig({
    LevelId: "test_level",
    Board: { Rows: 6, Cols: 6, RandomSeed: 777, Mask: Array.from({ length: 6 }, () => "111111") },
    TilePool: { TileTypes: [1, 2, 3], Weights: [1, 1, 1] },
    Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: true, bEnsureAtLeastOneMove: true },
    Goal: { MaxMoves: 20, TargetScore: 1000, Collect: [{ TileType: 1, Count: 5 }] },
    ...overrides,
  });
}

/** True if no filled gravity cell sits above an empty one within its segment. */
function hasNoFloatingTiles(board: BoardLogic): boolean {
  for (let col = 0; col < board.cols; col++) {
    let seenEmpty = false;
    for (let row = board.rows - 1; row >= 0; row--) {
      const c = board.cells[row * board.cols + col];
      const filled = c.TileType > 0 || c.SpecialType !== SpecialType.None;
      const solid = c.BlockerType > 0 || !c.bUsable;
      if (solid) {
        seenEmpty = false;
        continue;
      }
      if (!filled) seenEmpty = true;
      else if (seenEmpty) return false;
    }
  }
  return true;
}

describe("BoardLogic", () => {
  it("initializes with no immediate matches when configured", () => {
    const board = new BoardLogic(makeLevel());
    expect(board.computeMatches().matched.size).toBe(0);
  });

  it("always has a possible move after init", () => {
    const board = new BoardLogic(makeLevel());
    expect(board.hasAnyPossibleMove()).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const a = new BoardLogic(makeLevel());
    const b = new BoardLogic(makeLevel());
    expect(a.cells.map((c) => c.TileType)).toEqual(b.cells.map((c) => c.TileType));
  });

  it("rejects a non-matching swap and restores the board", () => {
    // checkerboard 3x3, no 3-in-a-row
    const level = parseLevelConfig({
      LevelId: "t",
      Board: { Rows: 3, Cols: 3, InitialTiles: [1, 2, 1, 2, 1, 2, 1, 2, 1] },
      TilePool: { TileTypes: [1, 2], Weights: [1, 1] },
      Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: false, bEnsureAtLeastOneMove: false },
      Goal: { MaxMoves: 10, Collect: [] },
    });
    const board = new BoardLogic(level);
    const before = board.cells.map((c) => c.TileType);
    const res = board.trySwap({ row: 0, col: 0 }, { row: 0, col: 1 });
    expect(res.accepted).toBe(false);
    expect(board.usedMoves).toBe(0);
    expect(board.cells.map((c) => c.TileType)).toEqual(before);
  });

  it("accepts matching swaps, consumes a move and scores", () => {
    const board = new BoardLogic(makeLevel());
    const move = board.findOnePossibleSwap();
    expect(move).not.toBeNull();
    const [a, b] = move!;
    const res = board.trySwap(a, b);
    expect(res.accepted).toBe(true);
    expect(board.usedMoves).toBe(1);
    expect(board.currentScore).toBeGreaterThan(0);
    expect(hasNoFloatingTiles(board)).toBe(true);
  });

  it("advances collect goals and can reach victory", () => {
    const board = new BoardLogic(
      makeLevel({ Goal: { MaxMoves: 100, TargetScore: 500, Collect: [{ TileType: 1, Count: 3 }] } })
    );
    for (let i = 0; i < 300 && !board.levelFinished; i++) {
      const move = board.findOnePossibleSwap();
      if (!move) {
        board.shuffleAllTiles();
        continue;
      }
      board.trySwap(move[0], move[1]);
    }
    expect(board.victory).toBe(true);
    expect(board.levelFinished).toBe(true);
    expect(board.computeStars()).toBeGreaterThanOrEqual(1);
  });

  it("runs long sequences without infinite loops or floating tiles", () => {
    const board = new BoardLogic(makeLevel({ Goal: { MaxMoves: 500, Collect: [{ TileType: 1, Count: 999 }] } }));
    for (let i = 0; i < 120; i++) {
      const move = board.findOnePossibleSwap();
      if (!move) board.shuffleAllTiles();
      else board.trySwap(move[0], move[1]);
      expect(hasNoFloatingTiles(board)).toBe(true);
    }
  });

  it("spawns specials from 4+ runs", () => {
    // row of four 1s with a matching vertical setup
    const level = parseLevelConfig({
      LevelId: "t2",
      Board: { Rows: 3, Cols: 4, InitialTiles: [1, 1, 1, 1, 2, 3, 2, 3, 3, 2, 3, 2] },
      TilePool: { TileTypes: [1, 2, 3], Weights: [1, 1, 1] },
      Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: false, bEnsureAtLeastOneMove: false },
      Goal: { MaxMoves: 10, Collect: [] },
    });
    const board = new BoardLogic(level);
    const { spawns } = board.computeMatches();
    // a horizontal 4-run at row0 => LineHorizontal
    expect([...spawns.values()]).toContain(SpecialType.LineHorizontal);
  });

  it("reshuffles a deadlocked board into a solvable one", () => {
    const board = new BoardLogic(makeLevel());
    const ok = board.ensureSolvableAfterDeadlock();
    expect(ok).toBe(true);
    expect(board.hasAnyPossibleMove()).toBe(true);
    expect(board.computeMatches().matched.size).toBe(0);
  });

  it("fails the reshuffle when no solvable arrangement exists", () => {
    const level = parseLevelConfig({
      LevelId: "impossible",
      Board: { Rows: 2, Cols: 2, InitialTiles: [1, 1, 1, 1] },
      TilePool: { TileTypes: [1], Weights: [1] },
      Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: false, bEnsureAtLeastOneMove: true },
      Goal: { MaxMoves: 10, Collect: [] },
    });
    const board = new BoardLogic(level);
    expect(board.ensureSolvableAfterDeadlock()).toBe(false);
  });

  it("blockers never move and pieces fall diagonally around them", () => {
    const level = parseLevelConfig({
      LevelId: "diag",
      Board: {
        Rows: 3,
        Cols: 3,
        Mask: ["111", "111", "111"],
        BlockedTypes: ["000", "000", "010"], // a blocker at (2,1)
        InitialTiles: [0, 0, 0, 0, 3, 0, 0, 0, 0], // a single tile at (1,1)
      },
      TilePool: { TileTypes: [1, 2], Weights: [1, 1] },
      Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: false, bEnsureAtLeastOneMove: false },
      Goal: { MaxMoves: 10, Collect: [] },
    });
    const board = new BoardLogic(level, 123);
    // isolate a single piece above the blocker
    for (const c of board.cells) if (c.BlockerType === 0) c.TileType = 0;
    board.cells[1 * 3 + 1].TileType = 3;
    // blocker fixed in place
    expect(board.cells[2 * 3 + 1].BlockerType).toBe(1);
    const { moves } = board.applyGravityAndRefill();
    // the tile cannot fall straight (blocker below) -> it slides diagonally to row 2
    const landed = [2 * 3 + 0, 2 * 3 + 2].filter((i) => board.cells[i].TileType === 3);
    expect(landed.length).toBe(1);
    expect(board.cells[1 * 3 + 1].TileType).not.toBe(3);
    expect(board.cells[2 * 3 + 1].BlockerType).toBe(1);
    void moves;
  });

  it("a line special directly breaks a blocker in its path", () => {
    const level = parseLevelConfig({
      LevelId: "lineblock",
      Board: {
        Rows: 3,
        Cols: 3,
        Mask: ["111", "111", "111"],
        BlockedTypes: ["001", "000", "000"], // blocker at (0,2)
        BlockerTypeDefs: [{ TypeId: 1, bDestructible: true, DefaultHP: 1 }],
        InitialSpecials: [{ Row: 0, Col: 0, SpecialType: "LineHorizontal" }],
      },
      TilePool: { TileTypes: [1, 2], Weights: [1, 1] },
      Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: false, bEnsureAtLeastOneMove: false },
      Goal: { MaxMoves: 10, Collect: [] },
    });
    const board = new BoardLogic(level, 5);
    expect(board.cells[0 * 3 + 2].BlockerType).toBe(1);
    const res = board.activateSpecialAt({ row: 0, col: 0 });
    expect(res.accepted).toBe(true);
    expect(board.cells[0 * 3 + 2].BlockerType).toBe(0);
  });

  it("special sweeps do NOT deal adjacent (collateral) damage, normal matches do", () => {
    const make = () =>
      parseLevelConfig({
        LevelId: "collateral",
        Board: {
          Rows: 3,
          Cols: 3,
          Mask: ["111", "111", "111"],
          BlockedTypes: ["100", "000", "000"], // blocker at (0,0)
          BlockerTypeDefs: [{ TypeId: 1, bDestructible: true, DefaultHP: 3, bDamageByAdjacentClear: true }],
        },
        TilePool: { TileTypes: [1, 2], Weights: [1, 1] },
        Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: false, bEnsureAtLeastOneMove: false },
        Goal: { MaxMoves: 10, Collect: [] },
      });

    // SpecialExplosion clears cell (1,0) but must NOT damage the adjacent blocker.
    const special = new BoardLogic(make(), 1) as unknown as {
      damageBlockers: (s: Set<number>, t: ClearTriggerType) => unknown;
      cells: Array<{ BlockerType: number; BlockerHP: number }>;
    };
    special.damageBlockers(new Set([1 * 3 + 0]), ClearTriggerType.SpecialExplosion);
    expect(special.cells[0].BlockerType).toBe(1);
    expect(special.cells[0].BlockerHP).toBe(3);

    // A normal match clearing (1,0) DOES deal adjacent damage.
    const normal = new BoardLogic(make(), 1) as unknown as {
      damageBlockers: (s: Set<number>, t: ClearTriggerType) => unknown;
      cells: Array<{ BlockerType: number; BlockerHP: number }>;
    };
    normal.damageBlockers(new Set([1 * 3 + 0]), ClearTriggerType.NormalMatch);
    expect(normal.cells[0].BlockerHP).toBe(2);
  });

  it("charges the ultimate on 3 consecutive same-type clears and releases it", () => {
    const board = new BoardLogic(makeLevel({ Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: true, bEnsureAtLeastOneMove: true } }));
    const charge = (b: BoardLogic, t: number[]): void =>
      (b as unknown as { updateUltimateCharge: (t: number[]) => void }).updateUltimateCharge(t);

    expect(board.ultimateState().ready).toBe(false);
    charge(board, [2]);
    charge(board, [2]);
    expect(board.ultimateState().ready).toBe(false);
    expect(board.ultimateState().count).toBe(2);
    charge(board, [2]);
    expect(board.ultimateState().ready).toBe(true);
    expect(board.ultimateState().element).toBe(2);

    // switching type before ready resets the count
    const other = new BoardLogic(makeLevel());
    charge(other, [1]);
    charge(other, [3]);
    expect(other.ultimateState().count).toBe(1);
    expect(other.ultimateState().ready).toBe(false);

    // release: clears every element of the targeted type
    const target = board.cells.findIndex((c) => c.TileType === 2);
    expect(target).toBeGreaterThanOrEqual(0);
    const before = new Set<number>();
    board.cells.forEach((c, i) => {
      if (c.TileType === 2) before.add(i);
    });
    const { row, col } = board.coord(target);
    const res = board.activateUltimate({ row, col });
    expect(res.accepted).toBe(true);
    const clearEv = res.events.find((e) => e.type === "clear") as { indices: number[]; triggerType: ClearTriggerType };
    expect(clearEv.triggerType).toBe(ClearTriggerType.UltimateTool);
    for (const i of before) expect(clearEv.indices).toContain(i);
    expect(board.ultimateState().ready).toBe(false);
  });
});
