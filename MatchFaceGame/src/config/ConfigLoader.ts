/**
 * Config loader: fetches and parses Content/Match3Json-compatible files.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §1.4, §2.2, §2.3.
 *
 * The only external input allowed by v2.0 is JSON under this base.
 */
import { ciBool, ciObj, ciStr, isObject, type JsonObject } from "./CaseInsensitiveJson.js";import { parseManifest, type LevelManifest } from "./LevelManifest.js";
import { parseLevelConfig, type LevelConfig } from "./types/LevelConfig.js";
import {
  inlineBossHasConfigFile,
  parseBossConfig,
  parseInlineBoss,
  type BossConfig,
} from "./types/BossConfig.js";
import { createLogger } from "../core/Logger.js";
import { parseBossCoinConfig, type BossCoinConfig } from "./BossCoinConfig.js";
import { parseItemCatalog, type ItemCatalog } from "./ItemConfig.js";
import {
  parseCurrencies,
  parseItemLevelLimits,
  parseLifePolicy,
  parseProducts,
  parseRewardRules,
  type CurrencyCatalog,
  type ItemLevelLimitsConfig,
  type LifePolicy,
  type ProductCatalog,
  type RewardRulesConfig,
} from "./EconomyConfig.js";

const log = createLogger("ConfigLoader");

export const DEFAULT_CONFIG_BASE = "config";

/** fetch + JSON.parse with a descriptive error. */
async function fetchJson(url: string): Promise<JsonObject> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON at ${url}: ${(e as Error).message}`);
  }
  if (!isObject(data)) throw new Error(`Expected object at ${url}`);
  return data;
}

export class ConfigLoader {
  readonly base: string;
  private manifestCache: LevelManifest | null = null;
  private levelCache = new Map<string, LevelConfig>();
  private rawCache = new Map<string, JsonObject>();
  private bossCoinCache: BossCoinConfig | null = null;
  private itemCache: ItemCatalog | null = null;
  private currencyCache: CurrencyCatalog | null = null;
  private rewardCache: RewardRulesConfig | null = null;
  private itemLimitCache: ItemLevelLimitsConfig | null = null;
  private productCache: ProductCatalog | null = null;
  private lifeCache: LifePolicy | null = null;

  constructor(base: string = DEFAULT_CONFIG_BASE) {
    this.base = base.replace(/\/+$/, "");
  }

  private url(rel: string): string {
    return `${this.base}/${rel.replace(/^\/+/, "")}`;
  }

  async loadManifest(): Promise<LevelManifest> {
    if (this.manifestCache) return this.manifestCache;
    const json = await fetchJson(this.url("levels_manifest.json"));
    this.manifestCache = parseManifest(json);
    log.info(`manifest: ${this.manifestCache.levels.length} entries`);
    return this.manifestCache;
  }

  async loadRaw(rel: string): Promise<JsonObject> {
    const cached = this.rawCache.get(rel);
    if (cached) return cached;
    const json = await fetchJson(this.url(rel));
    this.rawCache.set(rel, json);
    return json;
  }

  async loadLevel(rel: string): Promise<LevelConfig> {
    const cached = this.levelCache.get(rel);
    if (cached) return cached;
    const json = await this.loadRaw(rel);
    const level = parseLevelConfig(json);
    this.levelCache.set(rel, level);
    return level;
  }

  /** BossCoin skills (§2.6). */
  async loadBossCoins(): Promise<BossCoinConfig> {
    if (this.bossCoinCache) return this.bossCoinCache;
    const json = await fetchJson(this.url("boss/boss_coin_skills.json"));
    this.bossCoinCache = parseBossCoinConfig(json);
    return this.bossCoinCache;
  }

  /** Item definitions (catalog/items.json). */
  async loadItems(): Promise<ItemCatalog> {
    if (this.itemCache) return this.itemCache;
    const json = await fetchJson(this.url("catalog/items.json"));
    this.itemCache = parseItemCatalog(json);
    return this.itemCache;
  }

  async loadCurrencies(): Promise<CurrencyCatalog> {
    if (this.currencyCache) return this.currencyCache;
    this.currencyCache = parseCurrencies(await fetchJson(this.url("catalog/currencies.json")));
    return this.currencyCache;
  }

  async loadRewardRules(): Promise<RewardRulesConfig> {
    if (this.rewardCache) return this.rewardCache;
    this.rewardCache = parseRewardRules(await fetchJson(this.url("reward/reward_rules.json")));
    return this.rewardCache;
  }

  async loadItemLevelLimits(): Promise<ItemLevelLimitsConfig> {
    if (this.itemLimitCache) return this.itemLimitCache;
    this.itemLimitCache = parseItemLevelLimits(await fetchJson(this.url("catalog/item_level_limits.json")));
    return this.itemLimitCache;
  }

  async loadProducts(): Promise<ProductCatalog> {
    if (this.productCache) return this.productCache;
    this.productCache = parseProducts(await fetchJson(this.url("catalog/products.json")));
    return this.productCache;
  }

  async loadLifePolicy(): Promise<LifePolicy> {
    if (this.lifeCache) return this.lifeCache;
    this.lifeCache = parseLifePolicy(await fetchJson(this.url("life/life_policy.json")));
    return this.lifeCache;
  }

  /**
   * Resolve a boss config following §2.5.1 priority:
   * external ConfigFile -> boss_default.json -> level-inline block.
   */
  async resolveBoss(inlineRaw: JsonObject): Promise<BossConfig> {
    const inline = parseInlineBoss(inlineRaw);
    if (!inline.bEnabled) return inline;
    const cfgFile = inlineBossHasConfigFile(inlineRaw);
    if (cfgFile) {
      try {
        return parseBossConfig(await this.loadRaw(cfgFile));
      } catch (err) {
        log.warn(`boss config ${cfgFile} failed, falling back`, err);
        try {
          return parseBossConfig(await this.loadRaw("boss/boss_default.json"));
        } catch {
          /* keep inline */
        }
      }
    }
    return inline;
  }

  /**
   * Lightweight prefetch of boss flags for the level map (avoids loading full
   * configs on demand). Reads only the inline Boss block of each level file.
   */
  async prefetchBossMeta(entries: Array<{ levelId: string; configFile: string }>): Promise<Map<string, LevelBossMeta>> {
    const out = new Map<string, LevelBossMeta>();
    await Promise.all(
      entries.map(async (e) => {
        try {
          const raw = await this.loadRaw(e.configFile);
          const boss = ciObj(raw, "Boss");
          out.set(e.levelId, { isBoss: ciBool(boss, "bEnabled", false), bossId: ciStr(boss, "BossId", "") });
        } catch {
          out.set(e.levelId, { isBoss: false, bossId: "" });
        }
      })
    );
    return out;
  }
}

export interface LevelBossMeta {
  isBoss: boolean;
  bossId: string;
}
