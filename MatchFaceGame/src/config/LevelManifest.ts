/**
 * levels_manifest.json types + parser.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.3.
 */
import { ciArrObj, ciBool, ciNum, ciStr, type JsonObject } from "./CaseInsensitiveJson.js";

export type OutcomeEffectType = "UnlockLevel" | "PlayPresentationCue" | string;

export interface OutcomeEffect {
  type: OutcomeEffectType;
  targetId: string;
}

export interface LevelOutcomes {
  firstWinEffects: OutcomeEffect[];
  repeatWinEffects: OutcomeEffect[];
  loseEffects: OutcomeEffect[];
}

export interface ManifestEntry {
  levelId: string;
  order: number;
  displayName: string;
  modeId: string;
  configFile: string;
  chapterId: string;
  bInitiallyUnlocked: boolean;
  bEnabled: boolean;
  outcomes: LevelOutcomes;
}

export interface LevelManifest {
  bIgnoreLevelLockForTesting: boolean;
  levels: ManifestEntry[];
}

function parseEffects(raw: unknown): OutcomeEffect[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is JsonObject => typeof e === "object" && e !== null)
    .map((e) => ({ type: ciStr(e, "type", ""), targetId: ciStr(e, "targetId", "") }))
    .filter((e) => e.type !== "");
}

export function parseManifest(json: JsonObject): LevelManifest {
  const levels = ciArrObj(json, "levels").map((l): ManifestEntry => {
    const outcomesRaw = ciObjSafe(l, "outcomes");
    return {
      levelId: ciStr(l, "levelId", ""),
      order: ciNum(l, "order", 0),
      displayName: ciStr(l, "displayName", ""),
      modeId: ciStr(l, "modeId", "match3"),
      configFile: ciStr(l, "configFile", ""),
      chapterId: ciStr(l, "chapterId", ""),
      bInitiallyUnlocked: ciBool(l, "bInitiallyUnlocked", false),
      bEnabled: ciBool(l, "bEnabled", true),
      outcomes: {
        firstWinEffects: parseEffects(outcomesRaw.firstWinEffects),
        repeatWinEffects: parseEffects(outcomesRaw.repeatWinEffects),
        loseEffects: parseEffects(outcomesRaw.loseEffects),
      },
    };
  });
  return {
    bIgnoreLevelLockForTesting: ciBool(json, "bIgnoreLevelLockForTesting", false),
    levels: levels.filter((l) => l.levelId !== ""),
  };
}

function ciObjSafe(o: JsonObject, key: string): JsonObject {
  for (const k of Object.keys(o)) {
    if (k.toLowerCase() === key.toLowerCase()) {
      const v = o[k];
      if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as JsonObject;
    }
  }
  return {};
}

/** Levels that are enabled and belong to the match3 mode (boss levels are match3 + Boss.bEnabled). */
export function selectMatch3Levels(manifest: LevelManifest): ManifestEntry[] {
  return manifest.levels.filter((l) => l.bEnabled && l.modeId.toLowerCase() === "match3");
}
