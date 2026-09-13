/**
 * Boss configuration types + parser (external boss/*.json and level-inline Boss block).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.5.
 */
import { ciArr, ciArrObj, ciBool, ciGet, ciNum, ciNumHp, ciObj, ciStr, type JsonObject } from "../CaseInsensitiveJson.js";
import type { JsonObject as JO } from "../CaseInsensitiveJson.js";

export interface BossWeakness {
  tileType: number;
  damagePerClear: number;
  bExcludeUltimateClears: boolean;
}

export interface BlockerWeaknessTrigger {
  signalTag: string;
  damagePerTrigger: number;
}

export interface BossSkill {
  bEnabled: boolean;
  skillId: string;
  effectType: string;
  intervalMoves: number;
  intervalSecondsMin: number;
  intervalSecondsMax: number;
  priority: number;
  minActivePhase: number;
  maxActivePhase: number;
  paramA: number;
  paramB: number;
  intervalHits: number;
  landingScaleFactor: number;
  landingHoldSeconds: number;
  bApplyLarvaeOnLand: boolean;
  bMoveBossOnLandConvert: boolean;
  raw: JsonObject;
}

export interface BossRebirthPhase {
  spawnBlockerType: number;
  spawnCount: number;
  spawnBlockerHP: number;
  maxHp: number;
  initialHp: number;
  weaknesses: BossWeakness[];
  blockerWeaknessTriggers: BlockerWeaknessTrigger[];
  interceptedBlockerTransformTargets: number[];
  raw: JsonObject;
}

export interface BossConfig {
  bEnabled: boolean;
  bossId: string;
  displayName: string;
  maxHp: number;
  initialHp: number;
  weaknesses: BossWeakness[];
  blockerWeaknessTriggers: BlockerWeaknessTrigger[];
  skills: BossSkill[];
  sealFailThreshold: number;
  bEnableRebirthPhase: boolean;
  rebirthPhases: BossRebirthPhase[];
  presentation: JsonObject;
  raw: JsonObject;
}

function parseWeaknesses(arr: unknown[]): BossWeakness[] {
  return arr.filter((w): w is JO => typeof w === "object" && w !== null).map((w) => ({
    tileType: ciNum(w, "tileType", 1),
    damagePerClear: ciNum(w, "damagePerClear", 1),
    bExcludeUltimateClears: ciBool(w, "bExcludeUltimateClears", false),
  }));
}

function parseSignals(arr: unknown[]): BlockerWeaknessTrigger[] {
  return arr.filter((w): w is JO => typeof w === "object" && w !== null).map((w) => ({
    signalTag: ciStr(w, "signalTag", ""),
    damagePerTrigger: ciNum(w, "damagePerTrigger", 1),
  }));
}

function parseSkill(o: JsonObject): BossSkill {
  return {
    bEnabled: ciBool(o, "bEnabled", true),
    skillId: ciStr(o, "skillId", ""),
    effectType: ciStr(o, "effectType", ""),
    intervalMoves: ciNum(o, "intervalMoves", 3),
    intervalSecondsMin: ciNum(o, "intervalSecondsMin", 0),
    intervalSecondsMax: ciNum(o, "intervalSecondsMax", 0),
    priority: ciNum(o, "priority", 0),
    minActivePhase: ciNum(o, "minActivePhase", 1),
    maxActivePhase: ciNum(o, "maxActivePhase", 0),
    paramA: ciNum(o, "paramA", 0),
    paramB: ciNum(o, "paramB", 0),
    intervalHits: ciNum(o, "intervalHits", 1),
    landingScaleFactor: ciNum(o, "landingScaleFactor", 0),
    landingHoldSeconds: ciNum(o, "landingHoldSeconds", 0),
    bApplyLarvaeOnLand: ciBool(o, "bApplyLarvaeOnLand", false),
    bMoveBossOnLandConvert: ciBool(o, "bMoveBossOnLandConvert", true),
    raw: o,
  };
}

function parseRebirthPhase(o: JsonObject): BossRebirthPhase {
  return {
    spawnBlockerType: ciNum(o, "spawnBlockerType", 0),
    spawnCount: ciNum(o, "spawnCount", 0),
    spawnBlockerHP: ciNum(o, "spawnBlockerHP", 0),
    maxHp: ciNum(o, "maxHp", 0),
    initialHp: ciNum(o, "initialHp", 0),
    weaknesses: parseWeaknesses(ciArr(o, "weaknesses")),
    blockerWeaknessTriggers: parseSignals(ciArr(o, "blockerWeaknessTriggers")),
    interceptedBlockerTransformTargets: ciArr(o, "interceptedBlockerTransformTargets").map((v) => Number(v)),
    raw: o,
  };
}

/** Parse an external boss file (lowerCamelCase). */
export function parseBossConfig(json: JsonObject): BossConfig {
  return {
    bEnabled: ciBool(json, "bEnabled", true),
    bossId: ciStr(json, "bossId", ""),
    displayName: ciStr(json, "displayName", ""),
    maxHp: Math.max(1, ciNumHp(json, "maxHp", "maxHP", 100)),
    initialHp: ciNumHp(json, "initialHp", "initialHP", 0),
    weaknesses: parseWeaknesses(ciArr(json, "weaknesses")),
    blockerWeaknessTriggers: parseSignals(ciArr(json, "blockerWeaknessTriggers")),
    skills: ciArrObj(json, "skills").map(parseSkill),
    sealFailThreshold: ciNum(json, "sealFailThreshold", 1.0),
    bEnableRebirthPhase: ciBool(json, "bEnableRebirthPhase", false),
    rebirthPhases: ciArrObj(json, "rebirthPhases").map(parseRebirthPhase),
    presentation: ciObj(json, "presentation"),
    raw: json,
  };
}

/** Parse the level-inline Boss block (PascalCase), then let an external file override it. */
export function parseInlineBoss(json: JsonObject): BossConfig {
  const maxHp = Math.max(1, ciNum(json, "MaxHP", ciNum(json, "MaxHp", 100)));
  const initialHp = ciNum(json, "InitialHP", ciNum(json, "InitialHp", 0));
  const skills = ciArrObj(json, "Skills").map(parseSkill);
  const phases = ciArrObj(json, "RebirthPhases").map(parseRebirthPhase);

  // legacy single rebirth -> synthesize a phase
  if (phases.length === 0 && ciBool(json, "bEnableRebirthPhase", false)) {
    const spawnType = ciNum(json, "RebirthSpawnBlockerType", 0);
    const spawnCount = ciNum(json, "RebirthSpawnCount", 0);
    if (spawnType > 0 && spawnCount > 0) {
      phases.push({
        spawnBlockerType: spawnType,
        spawnCount,
        spawnBlockerHP: 0,
        maxHp: ciNum(json, "RebirthMaxHp", 0),
        initialHp: ciNum(json, "RebirthInitialHp", 0),
        weaknesses: parseWeaknesses(ciArr(json, "RebirthWeaknesses")),
        blockerWeaknessTriggers: parseSignals(ciArr(json, "RebirthBlockerWeaknessTriggers")),
        interceptedBlockerTransformTargets: [],
        raw: {},
      });
    }
  }

  return {
    bEnabled: ciBool(json, "bEnabled", false),
    bossId: ciStr(json, "BossId", "None"),
    displayName: ciStr(json, "BossId", ""),
    maxHp,
    initialHp,
    weaknesses: parseWeaknesses(ciArr(json, "Weaknesses")),
    blockerWeaknessTriggers: parseSignals(ciArr(json, "BlockerWeaknessTriggers")),
    skills,
    sealFailThreshold: ciNum(json, "SealFailThreshold", 1.0),
    bEnableRebirthPhase: ciBool(json, "bEnableRebirthPhase", false) || phases.length > 0,
    rebirthPhases: phases,
    presentation: ciObj(json, "Presentation"),
    raw: json,
  };
}

/** True if the inline block references an external file. */
export function inlineBossHasConfigFile(json: JsonObject): string {
  return ciStr(json, "ConfigFile", "");
}

void ciGet;
