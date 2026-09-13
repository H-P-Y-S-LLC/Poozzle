/**
 * Typed level configuration + parser.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.4.
 */
import {
  ciArr,
  ciArrObj,
  ciBool,
  ciGet,
  ciNum,
  ciNumArr,
  ciNumOpt,
  ciObj,
  ciStr,
  ciStrArr,
  type JsonObject,
} from "../CaseInsensitiveJson.js";
import { DEFAULTS, parseSpecialType, type SpecialType } from "../../logic/Match3Types.js";

export interface BlockerTypeDef {
  TypeId: number;
  bDestructible: boolean;
  DefaultHP: number;
  BreakScore: number;
  bDamageByAdjacentClear: boolean;
  AdjacentDamageSourceTileTypes: number[];
  bAdjacentDamageRequiresNormalMatch: boolean;
  bAdjacentDamageAllowSpecialExplosion: boolean;
  bImmuneToDirectHitDamage: boolean;
  bMovable: boolean;
  bSwapOnMatchOnly: boolean;
  bAllowGloveSwap: boolean;
  bMoveRandomEachTurn: boolean;
  bFailOnEscape: boolean;
  bEscapeTriggersDefeat: boolean;
  bSignalOnBreak: boolean;
  BreakSignalTag: string;
  bUseDamageStageMeshesAsHp: boolean;
  DamageStageMeshes: string[];
  bAllowFinalStageRepeatHit: boolean;
  bFinalStageRepeatHitRequiresAdjacentClear: boolean;
  bTransformOnFinalStageBreak: boolean;
  FinalStageTransformBlockerType: number;
  bSpreadEachTurn: boolean;
  SpreadCountPerTurn: number;
  bSpreadAsSticky: boolean;
  bCorrodeToMaskOnTimeout: boolean;
  CorrodeDelaySeconds: number;
  bComposite2x2: boolean;
  bComposite1x3Vertical: boolean;
  bWeaknessBlocker: boolean;
  CompositeRows: number;
  CompositeCols: number;
  WeaknessHPOverride: number;
  bWeaknessDamageByAdjacentClear: boolean;
  WeaknessBossDamagePerHit: number;
  bRestoreTilesOnBreak: boolean;
  bIsMouthBlocker: boolean;
  MouthTriggerFlyCount: number;
  MouthFlyTileType: number;
  MouthTargetBlockerType: number;
  bIsRewardBlocker: boolean;
  bInstantFillUltimateOnBreak: boolean;
  BreakRewardCurrencyId: string;
  BreakRewardCurrencyAmount: number;
  BreakRewardItemId: string;
  BreakRewardItemCount: number;
  BreakRewardMoveCount: number;
  /** Raw JSON for anything not explicitly modeled. */
  raw: JsonObject;
}

export interface TilePoolDef {
  TileTypes: number[];
  Weights: number[];
  NonRegeneratingTileTypes: number[];
  InertTileTypes: number[];
}

export interface RulesDef {
  MinMatchCount: number;
  bAllowDiagonalSwap: boolean;
  bInvalidSwapBounceBack: boolean;
  bEnsureAtLeastOneMove: boolean;
  bAvoidAutoCascadeAtStart: boolean;
  bUseTopSpawnAfterInternalSettle: boolean;
  bEnableSpecialSpecialSwapCombo: boolean;
  bDrainSuctionCountsForCollectGoal: boolean;
  bEnableGloveTool: boolean;
  bGloveAllowNormalTiles: boolean;
  bGloveAllowSpecialTiles: boolean;
  bGloveAllowBlockers: boolean;
  bGloveAllowStickyCell: boolean;
  bGloveAllowLarvaeCell: boolean;
  bGloveAllowPipeCell: boolean;
  bGloveAllowFrozenCell: boolean;
  bGloveAllowMovementLockedCell: boolean;
  GloveDisallowTileTypes: number[];
  GloveDisallowBlockerTypeIds: number[];
}

export interface ScoreDef {
  BaseClearScore: number;
  ExtraPerMoreThan3: number;
  SpecialTriggerScore: number;
  ComboMultiplierStep: number;
  BlockerBreakScore: number;
}

export interface CollectGoal {
  TileType: number;
  Count: number;
  bCountSpecialClear: boolean;
}

export interface BlockerBreakGoal {
  TypeId: number;
  Count: number;
}

export interface GoalDef {
  TargetScore: number;
  MaxMoves: number;
  Collect: CollectGoal[];
  TargetBlockerBreakCount: number;
  BlockerBreakByType: BlockerBreakGoal[];
}

export interface StarRatingDef {
  ThreeStarScore: number;
  ScoreWeight: number;
  MoveWeight: number;
  OverCollectWeight: number;
  TwoStarThreshold: number;
  ThreeStarThreshold: number;
  FourStarThreshold: number;
  FiveStarThreshold: number;
  MinScoreFor2Star: number;
  MinScoreFor3Star: number;
  MinScoreFor4Star: number;
  MinScoreFor5Star: number;
  ScoreNormCap: number;
  OverCollectNormCap: number;
}

export interface SpecialComboDef {
  A: SpecialType;
  B: SpecialType;
  bClearWholeBoard: boolean;
  bClearAllOfOtherType: boolean;
  BombRadius: number;
  bClearSwapRow: boolean;
  bClearSwapCol: boolean;
  SwapRowBandHalfWidth: number;
  SwapColBandHalfWidth: number;
}

export interface LightingDef {
  bEnableDirectionalLight: boolean;
  bEnableSkyLight: boolean;
  DirectionalLightIntensity: number;
  SkyLightIntensity: number;
}

export interface InitialSpecialDef {
  Row: number;
  Col: number;
  SpecialType: SpecialType;
}

export interface PipeDef {
  bEnabled: boolean;
  Mask: string[];
  BlockedMask: string[];
  OpenMask: string[];
  ProxyTileTypeMask: string[];
  HPMask: string[];
  DefaultProxyTileType: number;
  DefaultHP: number;
  DefaultOpenMask: number;
  GoalMode: string;
  Sources: Array<{ Row: number; Col: number }>;
  Ends: Array<{ Row: number; Col: number }>;
}

export interface BoardDef {
  Rows: number;
  Cols: number;
  Mask: string[];
  Blocked: string[];
  BlockedTypes: string[];
  BlockedHP: string[];
  BlockedTransformTarget: string[];
  StickyMask: string[];
  LarvaeMask: string[];
  BubbleMask: string[];
  BubbleSpawnIntervalMoves: number;
  BubbleSpawnPoints: Array<{ Row: number; Col: number }>;
  BlockerTypeDefs: BlockerTypeDef[];
  LarvaeBlockerTypePool: number[];
  Pipe: PipeDef;
  InitialTiles: number[];
  InitialSpecials: InitialSpecialDef[];
  RandomSeed: number;
}

export interface InlineBossDef {
  ConfigFile: string;
  bEnabled: boolean;
  BossId: string;
  MaxHP: number;
  InitialHP: number;
  SealFailThreshold: number;
  raw: JsonObject;
}

export interface LevelConfig {
  LevelId: string;
  CellSizeOverride: { present: boolean; value: number };
  BoardLocationOffsetOverride: { present: boolean; value: { X: number; Y: number; Z: number } };
  bEnableUltimateSkillOverride: { present: boolean; value: boolean };
  InitialUltimateReadyTileType: number;
  Board: BoardDef;
  TilePool: TilePoolDef;
  Rules: RulesDef;
  Score: ScoreDef;
  Goal: GoalDef;
  StarRating: StarRatingDef;
  SpecialCombos: SpecialComboDef[];
  Lighting: LightingDef;
  Boss: InlineBossDef;
  raw: JsonObject;
}

function parseBlockerTypeDef(o: JsonObject): BlockerTypeDef {
  return {
    TypeId: ciNum(o, "TypeId", 1),
    bDestructible: ciBool(o, "bDestructible", true),
    DefaultHP: ciNum(o, "DefaultHP", 1),
    BreakScore: ciNum(o, "BreakScore", -1),
    bDamageByAdjacentClear: ciBool(o, "bDamageByAdjacentClear", false),
    AdjacentDamageSourceTileTypes: ciNumArr(o, "AdjacentDamageSourceTileTypes"),
    bAdjacentDamageRequiresNormalMatch: ciBool(o, "bAdjacentDamageRequiresNormalMatch", false),
    bAdjacentDamageAllowSpecialExplosion: ciBool(o, "bAdjacentDamageAllowSpecialExplosion", false),
    bImmuneToDirectHitDamage: ciBool(o, "bImmuneToDirectHitDamage", false),
    bMovable: ciBool(o, "bMovable", false),
    bSwapOnMatchOnly: ciBool(o, "bSwapOnMatchOnly", false),
    bAllowGloveSwap: ciBool(o, "bAllowGloveSwap", true),
    bMoveRandomEachTurn: ciBool(o, "bMoveRandomEachTurn", false),
    bFailOnEscape: ciBool(o, "bFailOnEscape", false),
    bEscapeTriggersDefeat: ciBool(o, "bEscapeTriggersDefeat", true),
    bSignalOnBreak: ciBool(o, "bSignalOnBreak", false),
    BreakSignalTag: ciStr(o, "BreakSignalTag", "None"),
    bUseDamageStageMeshesAsHp: ciBool(o, "bUseDamageStageMeshesAsHp", false),
    DamageStageMeshes: ciStrArr(o, "DamageStageMeshes"),
    bAllowFinalStageRepeatHit: ciBool(o, "bAllowFinalStageRepeatHit", false),
    bFinalStageRepeatHitRequiresAdjacentClear: ciBool(o, "bFinalStageRepeatHitRequiresAdjacentClear", true),
    bTransformOnFinalStageBreak: ciBool(o, "bTransformOnFinalStageBreak", false),
    FinalStageTransformBlockerType: ciNum(o, "FinalStageTransformBlockerType", 0),
    bSpreadEachTurn: ciBool(o, "bSpreadEachTurn", false),
    SpreadCountPerTurn: ciNum(o, "SpreadCountPerTurn", 1),
    bSpreadAsSticky: ciBool(o, "bSpreadAsSticky", false),
    bCorrodeToMaskOnTimeout: ciBool(o, "bCorrodeToMaskOnTimeout", false),
    CorrodeDelaySeconds: ciNum(o, "CorrodeDelaySeconds", 10.0),
    bComposite2x2: ciBool(o, "bComposite2x2", false),
    bComposite1x3Vertical: ciBool(o, "bComposite1x3Vertical", false),
    bWeaknessBlocker: ciBool(o, "bWeaknessBlocker", false),
    CompositeRows: ciNum(o, "CompositeRows", 1),
    CompositeCols: ciNum(o, "CompositeCols", 1),
    WeaknessHPOverride: ciNum(o, "WeaknessHPOverride", -1),
    bWeaknessDamageByAdjacentClear: ciBool(o, "bWeaknessDamageByAdjacentClear", false),
    WeaknessBossDamagePerHit: ciNum(o, "WeaknessBossDamagePerHit", 0),
    bRestoreTilesOnBreak: ciBool(o, "bRestoreTilesOnBreak", false),
    bIsMouthBlocker: ciBool(o, "bIsMouthBlocker", false),
    MouthTriggerFlyCount: ciNum(o, "MouthTriggerFlyCount", 5),
    MouthFlyTileType: ciNum(o, "MouthFlyTileType", 4),
    MouthTargetBlockerType: ciNum(o, "MouthTargetBlockerType", 15),
    bIsRewardBlocker: ciBool(o, "bIsRewardBlocker", false),
    bInstantFillUltimateOnBreak: ciBool(o, "bInstantFillUltimateOnBreak", false),
    BreakRewardCurrencyId: ciStr(o, "BreakRewardCurrencyId", "None"),
    BreakRewardCurrencyAmount: ciNum(o, "BreakRewardCurrencyAmount", 0),
    BreakRewardItemId: ciStr(o, "BreakRewardItemId", "None"),
    BreakRewardItemCount: ciNum(o, "BreakRewardItemCount", 0),
    BreakRewardMoveCount: ciNum(o, "BreakRewardMoveCount", 0),
    raw: o,
  };
}

function parseBoard(o: JsonObject): BoardDef {
  const rows = Math.max(1, ciNum(o, "Rows", 9));
  const cols = Math.max(1, ciNum(o, "Cols", 9));
  const mask = ciStrArr(o, "Mask");
  // Validation §2.4.2: if provided, Mask must be rows x cols.
  if (mask.length > 0 && (mask.length !== rows || mask.some((r) => r.length !== cols))) {
    throw new Error(`Board.Mask dimension mismatch: expected ${rows}x${cols}, got ${mask.length} rows`);
  }
  return {
    Rows: rows,
    Cols: cols,
    Mask: mask,
    Blocked: ciStrArr(o, "Blocked"),
    BlockedTypes: ciStrArr(o, "BlockedTypes"),
    BlockedHP: ciStrArr(o, "BlockedHP"),
    BlockedTransformTarget: ciStrArr(o, "BlockedTransformTarget"),
    StickyMask: ciStrArr(o, "StickyMask"),
    LarvaeMask: ciStrArr(o, "LarvaeMask"),
    BubbleMask: ciStrArr(o, "BubbleMask"),
    BubbleSpawnIntervalMoves: ciNum(o, "BubbleSpawnIntervalMoves", 2),
    BubbleSpawnPoints: ciArrObj(o, "BubbleSpawnPoints").map((p) => ({
      Row: ciNum(p, "Row", 0),
      Col: ciNum(p, "Col", 0),
    })),
    BlockerTypeDefs: ciArrObj(o, "BlockerTypeDefs").map(parseBlockerTypeDef),
    LarvaeBlockerTypePool: ciNumArr(o, "LarvaeBlockerTypePool"),
    Pipe: parsePipe(ciObj(o, "Pipe")),
    InitialTiles: ciNumArr(o, "InitialTiles"),
    InitialSpecials: ciArrObj(o, "InitialSpecials").map((s) => ({
      Row: ciNum(s, "Row", -1),
      Col: ciNum(s, "Col", -1),
      SpecialType: parseSpecialType(ciGet(s, "SpecialType")),
    })),
    RandomSeed: ciNum(o, "RandomSeed", 0),
  };
}

function parsePipe(o: JsonObject): PipeDef {
  return {
    bEnabled: ciBool(o, "bEnabled", false),
    Mask: ciStrArr(o, "Mask"),
    BlockedMask: ciStrArr(o, "BlockedMask"),
    OpenMask: ciStrArr(o, "OpenMask"),
    ProxyTileTypeMask: ciStrArr(o, "ProxyTileTypeMask"),
    HPMask: ciStrArr(o, "HPMask"),
    DefaultProxyTileType: ciNum(o, "DefaultProxyTileType", 1),
    DefaultHP: ciNum(o, "DefaultHP", 1),
    DefaultOpenMask: ciNum(o, "DefaultOpenMask", 15),
    GoalMode: ciStr(o, "GoalMode", "AllOpen"),
    Sources: ciArrObj(o, "Sources").map((p) => ({ Row: ciNum(p, "Row", 0), Col: ciNum(p, "Col", 0) })),
    Ends: ciArrObj(o, "Ends").map((p) => ({ Row: ciNum(p, "Row", 0), Col: ciNum(p, "Col", 0) })),
  };
}

function parseGoal(o: JsonObject): GoalDef {
  return {
    TargetScore: ciNum(o, "TargetScore", DEFAULTS.goal.TargetScore),
    MaxMoves: ciNum(o, "MaxMoves", DEFAULTS.goal.MaxMoves),
    Collect: ciArrObj(o, "Collect").map((c) => ({
      TileType: ciNum(c, "TileType", 1),
      Count: ciNum(c, "Count", 10),
      bCountSpecialClear: ciBool(c, "bCountSpecialClear", true),
    })),
    TargetBlockerBreakCount: ciNum(o, "TargetBlockerBreakCount", 0),
    BlockerBreakByType: ciArrObj(o, "BlockerBreakByType").map((b) => ({
      TypeId: ciNum(b, "TypeId", 1),
      Count: ciNum(b, "Count", 1),
    })),
  };
}

export function parseLevelConfig(json: JsonObject): LevelConfig {
  const boardRaw = ciObj(json, "Board");
  const tilePoolRaw = ciObj(json, "TilePool");
  const rulesRaw = ciObj(json, "Rules");
  const scoreRaw = ciObj(json, "Score");
  const goalRaw = ciObj(json, "Goal");
  const starRaw = ciObj(json, "StarRating");
  const lightingRaw = ciObj(json, "Lighting");
  const bossRaw = ciObj(json, "Boss");

  const cellSize = ciNumOpt(json, "CellSize");
  const offsetRaw = ciObj(json, "BoardLocationOffset");
  const offsetPresent = ciGet(json, "BoardLocationOffset") !== undefined;
  const ultimate = ciGet(json, "bEnableUltimateSkill");

  const level: LevelConfig = {
    LevelId: ciStr(json, "LevelId", "level_default"),
    CellSizeOverride: cellSize,
    BoardLocationOffsetOverride: {
      present: offsetPresent,
      value: { X: ciNum(offsetRaw, "X", 0), Y: ciNum(offsetRaw, "Y", 0), Z: ciNum(offsetRaw, "Z", 0) },
    },
    bEnableUltimateSkillOverride: {
      present: ultimate !== undefined,
      value: ciBool(json, "bEnableUltimateSkill", true),
    },
    InitialUltimateReadyTileType: ciNum(json, "InitialUltimateReadyTileType", 0),
    Board: parseBoard(boardRaw),
    TilePool: {
      TileTypes: ciNumArr(tilePoolRaw, "TileTypes"),
      Weights: ciNumArr(tilePoolRaw, "Weights"),
      NonRegeneratingTileTypes: ciNumArr(tilePoolRaw, "NonRegeneratingTileTypes"),
      InertTileTypes: ciNumArr(tilePoolRaw, "InertTileTypes"),
    },
    Rules: {
      MinMatchCount: ciNum(rulesRaw, "MinMatchCount", DEFAULTS.rules.MinMatchCount),
      bAllowDiagonalSwap: ciBool(rulesRaw, "bAllowDiagonalSwap", DEFAULTS.rules.bAllowDiagonalSwap),
      bInvalidSwapBounceBack: ciBool(rulesRaw, "bInvalidSwapBounceBack", DEFAULTS.rules.bInvalidSwapBounceBack),
      bEnsureAtLeastOneMove: ciBool(rulesRaw, "bEnsureAtLeastOneMove", DEFAULTS.rules.bEnsureAtLeastOneMove),
      bAvoidAutoCascadeAtStart: ciBool(rulesRaw, "bAvoidAutoCascadeAtStart", DEFAULTS.rules.bAvoidAutoCascadeAtStart),
      bUseTopSpawnAfterInternalSettle: ciBool(
        rulesRaw,
        "bUseTopSpawnAfterInternalSettle",
        DEFAULTS.rules.bUseTopSpawnAfterInternalSettle
      ),
      bEnableSpecialSpecialSwapCombo: ciBool(
        rulesRaw,
        "bEnableSpecialSpecialSwapCombo",
        DEFAULTS.rules.bEnableSpecialSpecialSwapCombo
      ),
      bDrainSuctionCountsForCollectGoal: ciBool(
        rulesRaw,
        "bDrainSuctionCountsForCollectGoal",
        DEFAULTS.rules.bDrainSuctionCountsForCollectGoal
      ),
      bEnableGloveTool: ciBool(rulesRaw, "bEnableGloveTool", DEFAULTS.rules.bEnableGloveTool),
      bGloveAllowNormalTiles: ciBool(rulesRaw, "bGloveAllowNormalTiles", DEFAULTS.rules.bGloveAllowNormalTiles),
      bGloveAllowSpecialTiles: ciBool(rulesRaw, "bGloveAllowSpecialTiles", DEFAULTS.rules.bGloveAllowSpecialTiles),
      bGloveAllowBlockers: ciBool(rulesRaw, "bGloveAllowBlockers", DEFAULTS.rules.bGloveAllowBlockers),
      bGloveAllowStickyCell: ciBool(rulesRaw, "bGloveAllowStickyCell", DEFAULTS.rules.bGloveAllowStickyCell),
      bGloveAllowLarvaeCell: ciBool(rulesRaw, "bGloveAllowLarvaeCell", DEFAULTS.rules.bGloveAllowLarvaeCell),
      bGloveAllowPipeCell: ciBool(rulesRaw, "bGloveAllowPipeCell", DEFAULTS.rules.bGloveAllowPipeCell),
      bGloveAllowFrozenCell: ciBool(rulesRaw, "bGloveAllowFrozenCell", DEFAULTS.rules.bGloveAllowFrozenCell),
      bGloveAllowMovementLockedCell: ciBool(
        rulesRaw,
        "bGloveAllowMovementLockedCell",
        DEFAULTS.rules.bGloveAllowMovementLockedCell
      ),
      GloveDisallowTileTypes: ciNumArr(rulesRaw, "GloveDisallowTileTypes"),
      GloveDisallowBlockerTypeIds: ciNumArr(rulesRaw, "GloveDisallowBlockerTypeIds"),
    },
    Score: {
      BaseClearScore: ciNum(scoreRaw, "BaseClearScore", DEFAULTS.score.BaseClearScore),
      ExtraPerMoreThan3: ciNum(scoreRaw, "ExtraPerMoreThan3", DEFAULTS.score.ExtraPerMoreThan3),
      SpecialTriggerScore: ciNum(scoreRaw, "SpecialTriggerScore", DEFAULTS.score.SpecialTriggerScore),
      ComboMultiplierStep: ciNum(scoreRaw, "ComboMultiplierStep", DEFAULTS.score.ComboMultiplierStep),
      BlockerBreakScore: ciNum(scoreRaw, "BlockerBreakScore", DEFAULTS.score.BlockerBreakScore),
    },
    Goal: parseGoal(goalRaw),
    StarRating: {
      ThreeStarScore: ciNum(starRaw, "ThreeStarScore", 4500),
      ScoreWeight: ciNum(starRaw, "ScoreWeight", 0.7),
      MoveWeight: ciNum(starRaw, "MoveWeight", 0.3),
      OverCollectWeight: ciNum(starRaw, "OverCollectWeight", 0.2),
      TwoStarThreshold: ciNum(starRaw, "TwoStarThreshold", 0.74),
      ThreeStarThreshold: ciNum(starRaw, "ThreeStarThreshold", 0.95),
      FourStarThreshold: ciNum(starRaw, "FourStarThreshold", 1.02),
      FiveStarThreshold: ciNum(starRaw, "FiveStarThreshold", 1.1),
      MinScoreFor2Star: ciNum(starRaw, "MinScoreFor2Star", 0),
      MinScoreFor3Star: ciNum(starRaw, "MinScoreFor3Star", 0),
      MinScoreFor4Star: ciNum(starRaw, "MinScoreFor4Star", 0),
      MinScoreFor5Star: ciNum(starRaw, "MinScoreFor5Star", 0),
      ScoreNormCap: ciNum(starRaw, "ScoreNormCap", 1.2),
      OverCollectNormCap: ciNum(starRaw, "OverCollectNormCap", 1.0),
    },
    SpecialCombos: ciArrObj(json, "SpecialCombos").map((s) => ({
      A: parseSpecialType(ciGet(s, "A")),
      B: parseSpecialType(ciGet(s, "B")),
      bClearWholeBoard: ciBool(s, "bClearWholeBoard", false),
      bClearAllOfOtherType: ciBool(s, "bClearAllOfOtherType", false),
      BombRadius: ciNum(s, "BombRadius", 0),
      bClearSwapRow: ciBool(s, "bClearSwapRow", false),
      bClearSwapCol: ciBool(s, "bClearSwapCol", false),
      SwapRowBandHalfWidth: ciNum(s, "SwapRowBandHalfWidth", 0),
      SwapColBandHalfWidth: ciNum(s, "SwapColBandHalfWidth", 0),
    })),
    Lighting: {
      bEnableDirectionalLight: ciBool(lightingRaw, "bEnableDirectionalLight", true),
      bEnableSkyLight: ciBool(lightingRaw, "bEnableSkyLight", true),
      DirectionalLightIntensity: ciNum(lightingRaw, "DirectionalLightIntensity", -1),
      SkyLightIntensity: ciNum(lightingRaw, "SkyLightIntensity", -1),
    },
    Boss: {
      ConfigFile: ciStr(bossRaw, "ConfigFile", ""),
      bEnabled: ciBool(bossRaw, "bEnabled", false),
      BossId: ciStr(bossRaw, "BossId", "None"),
      MaxHP: ciNum(bossRaw, "MaxHP", ciNum(bossRaw, "MaxHp", 100)),
      InitialHP: ciNum(bossRaw, "InitialHP", ciNum(bossRaw, "InitialHp", 0)),
      SealFailThreshold: ciNum(bossRaw, "SealFailThreshold", 1.0),
      raw: bossRaw,
    },
    raw: json,
  };

  // Validation §2.4.2: SealFailThreshold within [0,1]
  if (level.Boss.SealFailThreshold < 0 || level.Boss.SealFailThreshold > 1) {
    throw new Error(`Level ${level.LevelId}: Boss.SealFailThreshold must be in [0,1]`);
  }
  // Validation §2.4.2: Goal.BlockerBreakByType TypeIds must exist in BlockerTypeDefs
  const knownTypeIds = new Set(level.Board.BlockerTypeDefs.map((d) => d.TypeId));
  for (const g of level.Goal.BlockerBreakByType) {
    if (!knownTypeIds.has(g.TypeId)) {
      throw new Error(`Level ${level.LevelId}: Goal.BlockerBreakByType references unknown TypeId ${g.TypeId}`);
    }
  }
  // Unused import guard (ciArr kept for future fields like BubbleSpawnPoints raw access)
  void ciArr;
  void ciGet;
  return level;
}

export const STAR_DEFAULTS = {
  scoreCap: 1.2,
};
