/**
 * Procedural Asset Registry — maps Unreal asset *paths* to procedural recipes.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.2.
 *
 * Pure data + logic (Node-safe). Does NOT create THREE objects.
 */
import { basename, dirname, fnv1a, hashStream, toLogicalPath } from "../core/Hash.js";
import { createLogger } from "../core/Logger.js";

const log = createLogger("ProceduralAsset");

export type AssetKind = "mesh" | "material" | "texture" | "vfx" | "sound" | "icon";

export interface ShapeSpec {
  base: string;
  [param: string]: number | string | undefined;
}

export interface MaterialSpec {
  kind: "standard" | "emissive" | "glass" | "metal" | "gradient" | "poison";
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  transparent?: boolean;
}

export type RecipeSource = "exact" | "name" | "family" | "hash";

export interface ProceduralRecipe {
  kind: AssetKind;
  family: string;
  shape?: ShapeSpec;
  palette?: string;
  material?: MaterialSpec;
  params?: Record<string, number | string>;
  source: RecipeSource;
}

interface FamilyRule {
  prefix: string;
  recipe: Omit<ProceduralRecipe, "source">;
}

const HASH_SHAPES = ["roundedBox", "sphere", "icosa", "octa", "cylinder", "capsule", "torus"] as const;

/** Kind inferred from the logical path when nothing else matches. */
export function guessKind(logicalPath: string): AssetKind {
  const p = logicalPath.toLowerCase();
  if (p.startsWith("niagara/") || p.includes("ng")) return "vfx";
  if (p.startsWith("sounds/") || p.startsWith("audio/")) return "sound";
  if (p.startsWith("music/")) return "sound";
  if (p.startsWith("images/") || p.startsWith("icons/")) return "icon";
  if (p.startsWith("materials/") || p.endsWith("mat") || p.includes("mat.")) return "material";
  return "mesh";
}

export class ProceduralAssetRegistry {
  private exact = new Map<string, ProceduralRecipe>();
  private byName = new Map<string, ProceduralRecipe>();
  private byFamily: FamilyRule[] = [];
  private cache = new Map<string, ProceduralRecipe>();
  private hashHits = new Set<string>();

  registerExact(path: string, recipe: Omit<ProceduralRecipe, "source">): this {
    this.exact.set(path, { ...recipe, source: "exact" });
    return this;
  }

  registerByName(name: string, recipe: Omit<ProceduralRecipe, "source">): this {
    this.byName.set(name, { ...recipe, source: "name" });
    return this;
  }

  registerFamily(dirPrefix: string, recipe: Omit<ProceduralRecipe, "source">): this {
    this.byFamily.push({ prefix: dirPrefix, recipe });
    // longest prefix wins
    this.byFamily.sort((a, b) => b.prefix.length - a.prefix.length);
    return this;
  }

  /** Pure (aside from caching). Throws never; always returns a recipe. */
  resolve(unrealPath: string): ProceduralRecipe {
    const cached = this.cache.get(unrealPath);
    if (cached) return cached;

    const logical = toLogicalPath(unrealPath);
    const base = basename(logical);

    const exact = this.exact.get(logical);
    if (exact) return this.finish(unrealPath, exact);

    const named = this.byName.get(base);
    if (named) return this.finish(unrealPath, named);

    for (const rule of this.byFamily) {
      if (logical.startsWith(rule.prefix)) {
        return this.finish(unrealPath, { ...rule.recipe, source: "family" });
      }
    }

    const recipe = this.hashDerivedRecipe(logical, guessKind(logical));
    if (!this.hashHits.has(logical)) {
      this.hashHits.add(logical);
      log.debug(`fallback: ${logical} → shape=${recipe.shape?.base} hue=${recipe.palette}`);
    }
    return this.finish(unrealPath, recipe);
  }

  /** HashMap of paths that fell through to the hash fallback (for coverage report). */
  hashFallbackPaths(): string[] {
    return [...this.hashHits];
  }

  private finish(key: string, recipe: ProceduralRecipe): ProceduralRecipe {
    this.cache.set(key, recipe);
    return recipe;
  }

  private hashDerivedRecipe(logicalPath: string, kind: AssetKind): ProceduralRecipe {
    const h = fnv1a(logicalPath);
    const rnd = hashStream(h);
    const shape = HASH_SHAPES[Math.floor(rnd() * HASH_SHAPES.length)];
    const hue = Math.floor(rnd() * 360);
    return {
      kind,
      family: "unknown",
      shape: { base: shape, jitter: rnd() * 0.15 },
      palette: `hash.${hue}`,
      material: { kind: "standard", roughness: 0.35 + rnd() * 0.4 },
      source: "hash",
    };
  }
}

/** Registry seeded with the baseline recipes from §5.2.2. */
export function createDefaultRegistry(): ProceduralAssetRegistry {
  const reg = new ProceduralAssetRegistry();

  reg
    .registerExact("Models/Tiles/Tiles", {
      kind: "mesh",
      family: "tile",
      shape: { base: "roundedBox", radius: 0.18 },
    })
    .registerExact("Models/boom/Boom", { kind: "mesh", family: "special", shape: { base: "sphere", spikes: 12 } })
    .registerExact("Models/rainbow1/rainbow1", {
      kind: "mesh",
      family: "special",
      shape: { base: "icosa", detail: 2 },
    })
    .registerExact("Models/arrow/arrow", { kind: "mesh", family: "special", shape: { base: "prism", length: 2.6 } })
    .registerExact("Models/paper/Paper", {
      kind: "mesh",
      family: "blocker",
      params: { typeId: 4 },
      shape: { base: "crumpledBlob" },
    });

  for (let t = 1; t <= 7; t++) {
    reg.registerExact(`Models/Tiles/Tile${t}Mat`, {
      kind: "material",
      family: "tile",
      palette: `tile.${t}`,
      material: { kind: "standard" },
    });
  }

  reg
    .registerByName("ClickCue", { kind: "sound", family: "sfx", params: { recipe: "click" } })
    .registerByName("BGM", { kind: "sound", family: "bgm", params: { recipe: "bathroomChill" } });

  reg
    .registerFamily("Models/Tiles/", { kind: "mesh", family: "tile" })
    .registerFamily("Models/block", { kind: "mesh", family: "blocker" })
    .registerFamily("Niagara/", { kind: "vfx", family: "vfx" })
    .registerFamily("Sounds/", { kind: "sound", family: "sfx" })
    .registerFamily("Music/", { kind: "sound", family: "bgm" })
    .registerFamily("Images/", { kind: "icon", family: "ui" })
    .registerFamily("Materials/", { kind: "material", family: "tile" });

  return reg;
}

/** dirname re-export convenience for coverage tooling. */
export { dirname };
