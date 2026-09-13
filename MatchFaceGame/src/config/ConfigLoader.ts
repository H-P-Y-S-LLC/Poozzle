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
