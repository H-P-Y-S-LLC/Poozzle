import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseBossConfig, type BossConfig } from "../../src/config/types/BossConfig.js";
import { parseLevelConfig, type LevelConfig } from "../../src/config/types/LevelConfig.js";
import { BoardLogic } from "../../src/logic/BoardLogic.js";
import { SpecialType, type Cell } from "../../src/logic/Match3Types.js";

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(here, "..", "..", "public", "config");
const readJson = (rel: string) => JSON.parse(readFileSync(join(CONFIG, rel), "utf8"));

function boss(id: string): BossConfig {
  return parseBossConfig(readJson(`boss/${id}.json`));
}

function syntheticLevel(): LevelConfig {
  return parseLevelConfig({
    LevelId: "boss_test",
    Board: {
      Rows: 6,
      Cols: 6,
      Mask: Array.from({ length: 6 }, () => "111111"),
      RandomSeed: 9,
      BlockerTypeDefs: [
        { TypeId: 3, bDestructible: true, DefaultHP: 1 },
        { TypeId: 4, bDestructible: true, DefaultHP: 2 },
        { TypeId: 15, bDestructible: true, DefaultHP: 1 },
        { TypeId: 22, bDestructible: true, DefaultHP: 1 },
      ],
    },
    TilePool: { TileTypes: [1, 2, 3, 4, 5], Weights: [1, 1, 1, 1, 1] },
    Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: true, bEnsureAtLeastOneMove: true },
    Goal: { MaxMoves: 40, Collect: [] },
  });
}

function boardWith(bossId: string): BoardLogic {
  return new BoardLogic(syntheticLevel(), 424242, boss(bossId));
}

const emptyWeaknessBoss: BossConfig = {
  bEnabled: true,
  bossId: "empty",
  displayName: "",
  maxHp: 100,
  initialHp: 100,
  weaknesses: [],
  blockerWeaknessTriggers: [],
  skills: [],
  sealFailThreshold: 1.0,
  bEnableRebirthPhase: false,
  rebirthPhases: [],
  presentation: {},
  raw: {},
};

describe("BossRuntime", () => {
  it("applies weakness damage per cleared tile type", () => {
    const board = boardWith("boss01");
    const b = board.boss!;
    expect(b.maxHp).toBe(200);
    expect(b.currentHp).toBe(200);
    b.applyDamageFromClears([3], false, []);
    expect(b.currentHp).toBe(197);
    b.applyDamageFromClears([4, 4], false, []);
    expect(b.currentHp).toBe(191);
    // type 1 is not a weakness -> no damage
    b.applyDamageFromClears([1], false, []);
    expect(b.currentHp).toBe(191);
  });

  it("uses +1 per tile when no weakness table exists", () => {
    const board = new BoardLogic(syntheticLevel(), 1, emptyWeaknessBoss);
    const b = board.boss!;
    const before = b.currentHp;
    b.applyDamageFromClears([1, 2, 3], false, []);
    expect(b.currentHp).toBe(before - 3);
  });

  it("hard shell reduces damage after the first hit", () => {
    const board = boardWith("boss04");
    const b = board.boss!;
    b.applyDamageFromClears([4], false, []);
    expect(b.currentHp).toBe(1010); // first hit is full (10)
    b.processTurn(1, []);
    const hp = b.currentHp;
    b.applyDamageFromClears([4], false, []);
    expect(b.currentHp).toBe(hp - 5); // halved by 50% hard shell
  });

  it("is defeated when HP reaches zero and reports victory", () => {
    const board = boardWith("boss01");
    board.boss!.applyDirectDamage(9999, []);
    expect(board.boss!.currentHp).toBe(0);
    expect(board.evaluateVictory()).toBe(true);
  });

  it("rebirth phases restore HP and advance phase (boss10)", () => {
    const board = boardWith("boss10");
    const b = board.boss!;
    expect(b.getCurrentPhase()).toBe(1);
    b.applyDirectDamage(9999, []);
    expect(b.currentHp).toBe(320);
    expect(b.getCurrentPhase()).toBe(2);
    b.applyDirectDamage(9999, []);
    expect(b.currentHp).toBe(420);
    expect(b.getCurrentPhase()).toBe(3);
    b.applyDirectDamage(9999, []);
    expect(b.currentHp).toBe(0); // no more phases
  });

  it("triggers a step skill that mutates the board", () => {
    const board = boardWith("boss01");
    board.boss!.processTurn(5, []);
    let frozen = 0;
    let blockers = 0;
    for (let i = 0; i < board.cells.length; i++) {
      if (board.isFrozen(i)) frozen++;
      const c: Cell = board.cells[i];
      if (c.BlockerType > 0) blockers++;
    }
    expect(frozen + blockers).toBeGreaterThan(0);
  });

  it("convert_random_blocker skill creates blockers (boss02)", () => {
    const board = boardWith("boss02");
    board.boss!.processTurn(2, []);
    const blockers = board.cells.filter((c) => c.BlockerType > 0).length;
    expect(blockers).toBeGreaterThan(0);
    // converted cells must not retain specials
    for (const c of board.cells) {
      if (c.BlockerType > 0) expect(c.SpecialType).toBe(SpecialType.None);
    }
  });
});
