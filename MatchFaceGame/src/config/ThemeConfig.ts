/**
 * theme_asset_config.json semantic reader.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.7 (especially §2.7.4 levelMapChunks).
 *
 * Resource path strings are NOT loaded; only numeric/structural/keyset fields matter.
 */
import { ciGet, ciNum, ciObj, type JsonObject } from "./CaseInsensitiveJson.js";

export interface LevelMapPathStyle {
  thickness: number;
  lockedColor: string;
  unlockedColor: string;
  clearedColor: string;
}

export interface LevelMapConfig {
  levelsPerChunk: number;
  bossOrderOffset: number;
  designWidth: number;
  designHeight: number;
  pathStyle: LevelMapPathStyle;
  modeStateIconSizeByModeId: Record<string, number>;
}

export interface ThemeConfig {
  levelMap: LevelMapConfig;
  /** Keys only — which blocker TypeIds / bossIds exist (§2.7.5 keyset semantics). */
  blockerTypeKeys: number[];
  bossIdKeys: string[];
}

const DEFAULT_MAP: LevelMapConfig = {
  levelsPerChunk: 12,
  bossOrderOffset: -110,
  designWidth: 1376,
  designHeight: 1376,
  pathStyle: { thickness: 0, lockedColor: "", unlockedColor: "", clearedColor: "" },
  modeStateIconSizeByModeId: {},
};

export function parseThemeConfig(json: JsonObject): ThemeConfig {
  // levelMapChunks may be an object ({defaults, chunkFallback}) or an empty array.
  const chunksRaw = ciObj(json, "levelMapChunks");
  const defaults = ciObj(chunksRaw, "defaults");
  const pathRaw = ciObj(defaults, "pathStyle");

  const sizes: Record<string, number> = {};
  const sizesRaw = ciObj(defaults, "modeStateIconSizeByModeId");
  for (const k of Object.keys(sizesRaw)) {
    const v = sizesRaw[k];
    if (typeof v === "number") sizes[k] = v;
  }

  const levelMap: LevelMapConfig = {
    levelsPerChunk: ciNum(defaults, "levelsPerChunk", DEFAULT_MAP.levelsPerChunk),
    bossOrderOffset: ciNum(defaults, "bossOrderOffset", DEFAULT_MAP.bossOrderOffset),
    designWidth: ciNum(defaults, "designWidth", DEFAULT_MAP.designWidth),
    designHeight: ciNum(defaults, "designHeight", DEFAULT_MAP.designHeight),
    pathStyle: {
      thickness: ciNum(pathRaw, "thickness", DEFAULT_MAP.pathStyle.thickness),
      lockedColor: civ(pathRaw, "lockedColor"),
      unlockedColor: civ(pathRaw, "unlockedColor"),
      clearedColor: civ(pathRaw, "clearedColor"),
    },
    modeStateIconSizeByModeId: sizes,
  };

  // keysets
  const blockerKeysObj = ciObj(json, "blockerTypeMeshes");
  const blockerTypeKeys = Object.keys(blockerKeysObj)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n));
  const bossKeysObj = ciObj(json, "bossLevelIconByBossId");
  const bossIdKeys = Object.keys(bossKeysObj);

  return { levelMap, blockerTypeKeys, bossIdKeys };
}

/** Read a color-ish value as a CSS string; "" when absent/transparent. */
function civ(obj: JsonObject, key: string): string {
  const v = ciGet(obj, key);
  if (typeof v === "string") return v;
  if (typeof v === "number") return v === 0 ? "" : `#${v.toString(16).padStart(6, "0")}`;
  return "";
}
