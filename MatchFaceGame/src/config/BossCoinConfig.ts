/**
 * BossCoin configuration (boss/boss_coin_skills.json).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.6.
 */
import { ciArrObj, ciBool, ciNum, ciNumArr, ciStrArr, ciStr, type JsonObject } from "./CaseInsensitiveJson.js";

export interface BossCoinFallback {
  randomDestroyBlockerCount: number;
  rewardType: string;
  rewardAmount: number;
}

export interface BossCoinSkill {
  bossId: string;
  displayName: string;
  displayNameZh: string;
  skillDescription: string;
  skillDescriptionZh: string;
  usageDescription: string;
  usageDescriptionZh: string;
  effectType: string;
  successProbability: number;
  primaryCount: number;
  secondaryCount: number;
  primaryScalar: number;
  flyTileType: number;
  bAllowRepeatWhileBuffActive: boolean;
  bClearAllBubbles: boolean;
  blockerTypeIds: number[];
  spawnSpecialPool: string[];
  fallback: BossCoinFallback;
  raw: JsonObject;
}

export interface BossCoinAnimation {
  tossHeight: number;
  tossUpDuration: number;
  spinDuration: number;
  settleDuration: number;
  revealDuration: number;
  resultPauseDuration: number;
  tossStartDelay: number;
  minSpinTurns: number;
  maxSpinTurns: number;
  scale: number;
}

export interface BossCoinConfig {
  maxUsesPerRun: number;
  defaultSuccessProbability: number;
  animation: BossCoinAnimation;
  coins: BossCoinSkill[];
}

export function parseBossCoinConfig(json: JsonObject): BossCoinConfig {
  const animRaw: JsonObject = {};
  const coins = ciArrObj(json, "coins").map((o): BossCoinSkill => {
    const fb: JsonObject = {};
    return {
      bossId: ciStr(o, "bossId", ""),
      displayName: ciStr(o, "displayName", ""),
      displayNameZh: ciStr(o, "displayNameZh", ""),
      skillDescription: ciStr(o, "skillDescription", ""),
      skillDescriptionZh: ciStr(o, "skillDescriptionZh", ""),
      usageDescription: ciStr(o, "usageDescription", ""),
      usageDescriptionZh: ciStr(o, "usageDescriptionZh", ""),
      effectType: ciStr(o, "effectType", "RandomDestroyBlockers"),
      successProbability: ciNum(o, "successProbability", -1),
      primaryCount: ciNum(o, "primaryCount", 0),
      secondaryCount: ciNum(o, "secondaryCount", 0),
      primaryScalar: ciNum(o, "primaryScalar", 0),
      flyTileType: ciNum(o, "flyTileType", 0),
      bAllowRepeatWhileBuffActive: ciBool(o, "bAllowRepeatWhileBuffActive", false),
      bClearAllBubbles: ciBool(o, "bClearAllBubbles", false),
      blockerTypeIds: ciNumArr(o, "blockerTypeIds"),
      spawnSpecialPool: ciStrArr(o, "spawnSpecialPool"),
      fallback: (() => {
        void fb;
        const f = o["fallback"];
        const fo = typeof f === "object" && f !== null ? (f as JsonObject) : {};
        return {
          randomDestroyBlockerCount: ciNum(fo, "randomDestroyBlockerCount", 0),
          rewardType: ciStr(fo, "rewardType", ""),
          rewardAmount: ciNum(fo, "rewardAmount", 0),
        };
      })(),
      raw: o,
    };
  });

  const anim = json["animation"];
  const a = typeof anim === "object" && anim !== null ? (anim as JsonObject) : animRaw;
  return {
    maxUsesPerRun: ciNum(json, "maxUsesPerRun", 0),
    defaultSuccessProbability: ciNum(json, "defaultSuccessProbability", 0.5),
    animation: {
      tossHeight: ciNum(a, "tossHeight", 620),
      tossUpDuration: ciNum(a, "tossUpDuration", 0.25),
      spinDuration: ciNum(a, "spinDuration", 0.6),
      settleDuration: ciNum(a, "settleDuration", 0.22),
      revealDuration: ciNum(a, "revealDuration", 0.3),
      resultPauseDuration: ciNum(a, "resultPauseDuration", 0.2),
      tossStartDelay: ciNum(a, "tossStartDelay", 0.2),
      minSpinTurns: ciNum(a, "minSpinTurns", 6),
      maxSpinTurns: ciNum(a, "maxSpinTurns", 10),
      scale: ciNum(a, "scale", 2.0),
    },
    coins,
  };
}

/** Probability for a coin, falling back to the config default when unset. */
export function coinProbability(cfg: BossCoinConfig, skill: BossCoinSkill): number {
  const p = skill.successProbability >= 0 ? skill.successProbability : cfg.defaultSuccessProbability;
  return Math.max(0, Math.min(1, p));
}
