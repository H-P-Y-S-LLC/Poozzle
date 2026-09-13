import { describe, expect, it } from "vitest";
import { parseLevelConfig } from "../../src/config/types/LevelConfig.js";
import { BoardLogic } from "../../src/logic/BoardLogic.js";
import type { BossCoinSkill } from "../../src/config/BossCoinConfig.js";
import type { BossConfig } from "../../src/config/types/BossConfig.js";

const EMPTY_BOSS: BossConfig = {
  bEnabled: true,
  bossId: "boss_placeholder_01",
  displayName: "",
  maxHp: 100,
  initialHp: 100,
  weaknesses: [],
  blockerWeaknessTriggers: [],
  skills: [],
  sealFailThreshold: 1,
  bEnableRebirthPhase: false,
  rebirthPhases: [],
  presentation: {},
  raw: {},
};

function makeBoard(seed = 1): BoardLogic {
  return new BoardLogic(level(), seed, EMPTY_BOSS);
}

function level() {
  return parseLevelConfig({
    LevelId: "coin_test",
    Board: {
      Rows: 6,
      Cols: 6,
      Mask: Array.from({ length: 6 }, () => "111111"),
      // blockers of type 4 at (0,0),(0,1); type 3 at (5,5)
      BlockedTypes: ["440000", "000000", "000000", "000000", "000000", "000003"],
      BlockerTypeDefs: [
        { TypeId: 3, bDestructible: true, DefaultHP: 1 },
        { TypeId: 4, bDestructible: true, DefaultHP: 3 },
      ],
      RandomSeed: 7,
    },
    TilePool: { TileTypes: [1, 2, 3, 4], Weights: [1, 1, 1, 1] },
    Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: true, bEnsureAtLeastOneMove: false },
    Goal: { MaxMoves: 30, Collect: [] },
  });
}

function skill(over: Partial<BossCoinSkill>): BossCoinSkill {
  return {
    bossId: "boss_placeholder_01",
    displayName: "",
    displayNameZh: "",
    skillDescription: "",
    skillDescriptionZh: "",
    usageDescription: "",
    usageDescriptionZh: "",
    effectType: "RandomDestroyBlockers",
    successProbability: -1,
    primaryCount: 0,
    secondaryCount: 0,
    primaryScalar: 0,
    flyTileType: 0,
    bAllowRepeatWhileBuffActive: false,
    bClearAllBubbles: false,
    blockerTypeIds: [],
    spawnSpecialPool: [],
    fallback: { randomDestroyBlockerCount: 0, rewardType: "", rewardAmount: 0 },
    raw: {},
    ...over,
  };
}

describe("BossCoin", () => {
  it("pity: two misses force the third toss to hit", () => {
    const board = makeBoard();
    board.initBossCoin(5);
    expect(board.rollBossCoin(0).success).toBe(false);
    expect(board.rollBossCoin(0).success).toBe(false);
    expect(board.bossCoinState().misses).toBe(2);
    expect(board.rollBossCoin(0).success).toBe(true);
    expect(board.bossCoinState().misses).toBe(0);
    expect(board.bossCoinState().remaining).toBe(2);
  });

  it("ClearSpecificBlockerTypes clears only the listed types and ignores HP", () => {
    const board = makeBoard();
    board.initBossCoin(5);
    const res = board.applyBossCoinResult(skill({ effectType: "ClearSpecificBlockerTypes", blockerTypeIds: [4] }), true);
    expect(res.applied).toBe(true);
    expect(board.cells[0].BlockerType).toBe(0);
    expect(board.cells[1].BlockerType).toBe(0);
    expect(board.cells[35].BlockerType).toBe(3);
    // clearing blockers must immediately settle the board (fall / refill)
    expect(res.events.some((e) => e.type === "fall" || e.type === "spawn")).toBe(true);
  });

  it("fallback grants score when no skill target exists", () => {
    const board = makeBoard();
    board.initBossCoin(5);
    const before = board.currentScore;
    const res = board.applyBossCoinResult(
      skill({ effectType: "ClearSpecificBlockerTypes", blockerTypeIds: [999], fallback: { randomDestroyBlockerCount: 0, rewardType: "Score", rewardAmount: 1000 } }),
      true
    );
    expect(res.applied).toBe(true);
    expect(board.currentScore).toBe(before + 1000);
  });

  it("a failed toss applies neither skill nor fallback", () => {
    const board = makeBoard();
    board.initBossCoin(5);
    const before = board.currentScore;
    const res = board.applyBossCoinResult(
      skill({ effectType: "ClearSpecificBlockerTypes", blockerTypeIds: [4], fallback: { randomDestroyBlockerCount: 0, rewardType: "Score", rewardAmount: 1000 } }),
      false
    );
    expect(res.applied).toBe(false);
    expect(board.cells[0].BlockerType).toBe(4);
    expect(board.currentScore).toBe(before);
  });

  it("ConvertFliesToMoves grants extra moves", () => {
    const board = makeBoard();
    board.initBossCoin(5);
    const before = board.moveBudget;
    const res = board.applyBossCoinResult(
      skill({ effectType: "ConvertFliesToMoves", primaryScalar: 1, flyTileType: 1 }),
      true
    );
    expect(res.applied).toBe(true);
    expect(board.moveBudget).toBeGreaterThan(before);
  });

  it("DoubleNextBossDamage boosts the next boss damage", () => {
    const board = makeBoard();
    board.initBossCoin(5);
    const boss = board.boss!;
    const hp0 = boss.currentHp;
    expect(board.applyBossCoinResult(skill({ effectType: "DoubleNextBossDamage", primaryScalar: 2 }), true).applied).toBe(true);
    boss.applyDirectDamage(10, []);
    expect(boss.currentHp).toBe(hp0 - 20);
  });
});
