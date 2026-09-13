/**
 * Generates a sample Content/Match3Json-compatible config set under public/config.
 *
 * The v2.0 spec treats Content/Match3Json/** as the only external input. The real
 * UE data is not present in this workspace, so this script produces schema-conformant
 * sample levels so the game is runnable. Drop real files into public/config/ to use them.
 *
 * Usage: node tools/make-sample-config.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "public", "config-sample");

function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function writeJson(rel, obj) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2) + "\n", "utf8");
  return file;
}

function mask(rows, cols, fn) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) line += fn(r, c) ? "1" : "0";
    out.push(line);
  }
  return out;
}

function makeLevel(i) {
  const rows = i >= 6 ? 8 : 7;
  const cols = 7;
  const goalTile = 1 + (i % 4);
  const level = {
    LevelId: `level_${String(i).padStart(3, "0")}`,
    Board: {
      Rows: rows,
      Cols: cols,
      Mask: mask(rows, cols, () => true),
      RandomSeed: 100000 + i,
    },
    TilePool: {
      TileTypes: [1, 2, 3, 4, 5, 6],
      Weights: [1, 1, 1, 1, 1, 1],
      NonRegeneratingTileTypes: [],
      InertTileTypes: [],
    },
    Rules: {
      MinMatchCount: 3,
      bAvoidAutoCascadeAtStart: true,
      bEnsureAtLeastOneMove: true,
    },
    Score: {
      BaseClearScore: 50,
      ExtraPerMoreThan3: 20,
      SpecialTriggerScore: 120,
      ComboMultiplierStep: 0.4,
      BlockerBreakScore: 80,
    },
    Goal: {
      TargetScore: 3000,
      MaxMoves: 24,
      Collect: [{ TileType: goalTile, Count: 12, bCountSpecialClear: true }],
    },
    StarRating: {
      ThreeStarScore: 4500,
      TwoStarThreshold: 0.74,
      ThreeStarThreshold: 0.95,
      FourStarThreshold: 1.02,
      FiveStarThreshold: 1.1,
    },
  };

  // a couple of blocker levels using BlockedTypes (type 1 = paper, 2 = crate)
  if (i === 2 || i === 5 || i === 8) {
    level.Board.BlockerTypeDefs = [
      { TypeId: 1, bDestructible: true, DefaultHP: 1, BreakScore: 80, bDamageByAdjacentClear: true },
      { TypeId: 2, bDestructible: true, DefaultHP: 2, BreakScore: 120, bDamageByAdjacentClear: true },
    ];
    const bt = [];
    const hp = [];
    for (let r = 0; r < rows; r++) {
      let lineT = "";
      let lineH = "";
      for (let c = 0; c < cols; c++) {
        const has = (r + c) % 5 === 0 && r > 0 && r < rows - 1;
        const type = has ? ((r * cols + c) % 3 === 0 ? "2" : "1") : "0";
        lineT += type;
        lineH += type === "2" ? "2" : type === "1" ? "1" : "0";
      }
      bt.push(lineT);
      hp.push(lineH);
    }
    level.Board.BlockedTypes = bt;
    level.Board.BlockedHP = hp;
    level.Goal.TargetBlockerBreakCount = 6;
  }
  return level;
}

function makeBossLevel() {
  return {
    LevelId: "level_010",
    Board: {
      Rows: 7,
      Cols: 7,
      Mask: mask(7, 7, () => true),
      RandomSeed: 100010,
    },
    TilePool: { TileTypes: [1, 2, 3, 4, 5, 6], Weights: [1, 1, 1, 1, 1, 1] },
    Rules: { MinMatchCount: 3, bAvoidAutoCascadeAtStart: true, bEnsureAtLeastOneMove: true },
    Goal: {
      TargetScore: 3000,
      MaxMoves: 30,
      Collect: [{ TileType: 3, Count: 10, bCountSpecialClear: true }],
    },
    Boss: {
      ConfigFile: "boss/boss01.json",
      bEnabled: true,
      BossId: "boss01",
      MaxHP: 300,
      InitialHP: 300,
      SealFailThreshold: 1.0,
    },
  };
}

const levels = [];
for (let i = 1; i <= 10; i++) {
  const isBoss = i === 10;
  const id = `level_${String(i).padStart(3, "0")}`;
  const cfg = isBoss ? makeBossLevel() : makeLevel(i);
  writeJson(`levels/${id}.json`, cfg);
  levels.push({
    levelId: id,
    order: i,
    displayName: String(i),
    modeId: "match3",
    configFile: `levels/${id}.json`,
    chapterId: i <= 5 ? "chapter_01" : "chapter_02",
    bInitiallyUnlocked: i === 1,
    bEnabled: true,
    outcomes: { firstWinEffects: [], repeatWinEffects: [], loseEffects: [] },
  });
}

writeJson("levels_manifest.json", { bIgnoreLevelLockForTesting: false, levels });

writeJson("boss/boss01.json", {
  bossId: "boss01",
  displayName: "Earwig",
  maxHp: 300,
  initialHp: 300,
  weaknesses: [
    { tileType: 3, damage: 6 },
    { tileType: 6, damage: 10 },
  ],
  skills: [],
  bEnableRebirthPhase: false,
  sealFailThreshold: 1.0,
});

writeJson("boss/skills.json", { skills: [] });
writeJson("boss/boss_coin_skills.json", { coins: [] });
writeJson("theme_asset_config.json", {
  TileTypeMeshes: {},
  levelMapChunks: {
    defaults: {
      levelsPerChunk: 12,
      bossOrderOffset: -110,
      designWidth: 1376,
      designHeight: 1376,
      background: {
        texture: "/Game/Map/Map1.Map1",
        scaleMode: "contain",
        userScale: 1.0,
        fallbackTexture: "/Game/Map/Map.Map",
      },
      pathStyle: {
        thickness: 0.0,
        lockedColor: null,
        unlockedColor: null,
        clearedColor: null,
      },
      modeStateIconSizeByModeId: { slide_puzzle: 200.0 },
    },
    chunkFallback: {
      background: { texture: "/Game/Map/Map.Map" },
    },
  },
});
writeJson("life/life_policy.json", { maxLives: 5, initialLives: 5, regenIntervalSec: 1800, entryCostPerLevel: 1 });
writeJson("localization/texts_index.json", { files: ["ui_text.json"] });
writeJson("localization/ui_text.json", {
  module: "ui",
  entries: [
    { key: "hud_score", en: "SCORE", zh: "分数" },
    { key: "hud_moves", en: "MOVES", zh: "步数" },
    { key: "hud_target", en: "TARGET", zh: "目标" },
    { key: "btn_retry", en: "Retry", zh: "重玩" },
    { key: "btn_next", en: "Next", zh: "下一关" },
    { key: "btn_map", en: "Map", zh: "地图" },
    { key: "settlement_win", en: "LEVEL CLEAR", zh: "过关" },
    { key: "settlement_lose", en: "OUT OF MOVES", zh: "步数用尽" },
    { key: "loading", en: "Loading…", zh: "加载中…" },
  ],
});

console.log(`Sample config written to ${ROOT}`);
console.log(`  levels: ${levels.length}`);
