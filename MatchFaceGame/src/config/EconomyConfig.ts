/**
 * Economy configs: currencies, per-level item loadout caps, level rewards,
 * shop products and life policy.
 * Spec: §2.2.1 catalog/*, reward/*, life/life_policy.json.
 */
import { ciArrObj, ciBool, ciNum, ciStr, isObject, type JsonObject } from "./CaseInsensitiveJson.js";

// ── currencies ──
export interface CurrencyDef {
  id: string;
  name: string;
  initial: number;
  max: number;
  bVisible: boolean;
}
export interface CurrencyCatalog {
  currencies: CurrencyDef[];
}
export function parseCurrencies(json: JsonObject): CurrencyCatalog {
  return {
    currencies: ciArrObj(json, "currencies").map((o) => ({
      id: ciStr(o, "id", ""),
      name: ciStr(o, "name", ""),
      initial: ciNum(o, "initial", 0),
      max: ciNum(o, "max", 0),
      bVisible: ciBool(o, "bVisible", true),
    })).filter((c) => c.id),
  };
}

// ── reward rules ──
export interface CurrencyAmount {
  currencyId: string;
  amount: number;
}
export interface ItemAmount {
  itemId: string;
  count: number;
}
export interface RewardBundle {
  currencies: CurrencyAmount[];
  items: ItemAmount[];
  lives: number;
}
export interface LevelRewardRule {
  levelId: string;
  firstWin: RewardBundle;
  repeatWin: RewardBundle;
  lose: RewardBundle;
  fiveStarBonus: RewardBundle;
}
export interface ModeRewardRule {
  modeId: string;
  win: RewardBundle;
  lose: RewardBundle;
  firstWin?: RewardBundle;
}
export interface RewardRulesConfig {
  modeRules: ModeRewardRule[];
  levelRules: Map<string, LevelRewardRule>;
}

function parseBundle(o: JsonObject | undefined): RewardBundle {
  const src = o ?? {};
  return {
    currencies: ciArrObj(src, "currencies").map((c) => ({
      currencyId: ciStr(c, "currencyId", ""),
      amount: ciNum(c, "amount", 0),
    })),
    items: ciArrObj(src, "items").map((i) => ({
      itemId: ciStr(i, "itemId", ""),
      count: ciNum(i, "count", 0),
    })),
    lives: ciNum(src, "lives", 0),
  };
}

export function parseRewardRules(json: JsonObject): RewardRulesConfig {
  const levelRules = new Map<string, LevelRewardRule>();
  for (const o of ciArrObj(json, "levelRules")) {
    const id = ciStr(o, "levelId", "");
    if (!id) continue;
    levelRules.set(id, {
      levelId: id,
      firstWin: parseBundle(ciObjSafe(o, "firstWin")),
      repeatWin: parseBundle(ciObjSafe(o, "repeatWin")),
      lose: parseBundle(ciObjSafe(o, "lose")),
      fiveStarBonus: parseBundle(ciObjSafe(o, "fiveStarBonus")),
    });
  }
  const modeRules = ciArrObj(json, "modeRules").map((o): ModeRewardRule => ({
    modeId: ciStr(o, "modeId", ""),
    win: parseBundle(ciObjSafe(o, "win")),
    lose: parseBundle(ciObjSafe(o, "lose")),
    firstWin: isObject(o["firstWin"]) ? parseBundle(ciObjSafe(o, "firstWin")) : undefined,
  }));
  return { modeRules, levelRules };
}

function ciObjSafe(o: JsonObject, key: string): JsonObject | undefined {
  const v = o[key];
  if (isObject(v)) return v;
  const lower = key.toLowerCase();
  for (const k of Object.keys(o)) if (k.toLowerCase() === lower && isObject(o[k])) return o[k] as JsonObject;
  return undefined;
}

// ── per-level item loadout limits ──
export interface ItemEquipCap {
  itemId: string;
  cap: number;
}
export interface LevelItemLimit {
  levelId: string;
  totalLoadoutCap: number;
  perItemEquipCaps: ItemEquipCap[];
}
export interface ItemLevelLimitsConfig {
  levelLimits: Map<string, LevelItemLimit>;
}
export function parseItemLevelLimits(json: JsonObject): ItemLevelLimitsConfig {
  const map = new Map<string, LevelItemLimit>();
  for (const o of ciArrObj(json, "levelLimits")) {
    const id = ciStr(o, "levelId", "");
    if (!id) continue;
    map.set(id, {
      levelId: id,
      totalLoadoutCap: ciNum(o, "totalLoadoutCap", 0),
      perItemEquipCaps: ciArrObj(o, "perItemEquipCaps").map((c) => ({
        itemId: ciStr(c, "itemId", ""),
        cap: ciNum(c, "cap", 0),
      })),
    });
  }
  return { levelLimits: map };
}

// ── shop products ──
export interface ProductGrant {
  itemId: string;
  itemCount: number;
  lifeAmount: number;
}
export interface ProductDef {
  id: string;
  type: string;
  currencyId: string;
  amount: number;
  grant: ProductGrant;
  dailyLimit: number;
  bEnabled: boolean;
}
export interface ProductCatalog {
  products: ProductDef[];
}
export function parseProducts(json: JsonObject): ProductCatalog {
  return {
    products: ciArrObj(json, "products").map((o) => {
      const price = isObject(o["price"]) ? (o["price"] as JsonObject) : {};
      const grant = isObject(o["grant"]) ? (o["grant"] as JsonObject) : {};
      return {
        id: ciStr(o, "id", ""),
        type: ciStr(o, "type", ""),
        currencyId: ciStr(price, "currencyId", ""),
        amount: ciNum(price, "amount", 0),
        grant: {
          itemId: ciStr(grant, "itemId", ""),
          itemCount: ciNum(grant, "itemCount", 0),
          lifeAmount: ciNum(grant, "lifeAmount", 0),
        },
        dailyLimit: ciNum(o, "dailyLimit", 0),
        bEnabled: ciBool(o, "bEnabled", true),
      };
    }).filter((p) => p.id && p.bEnabled),
  };
}

// ── life policy ──
export interface LifePolicy {
  maxLives: number;
  initialLives: number;
  regenIntervalSec: number;
  entryCostPerLevel: number;
}
export function parseLifePolicy(json: JsonObject): LifePolicy {
  return {
    maxLives: ciNum(json, "maxLives", 5),
    initialLives: ciNum(json, "initialLives", 5),
    regenIntervalSec: ciNum(json, "regenIntervalSec", 1800),
    entryCostPerLevel: ciNum(json, "entryCostPerLevel", 0),
  };
}
