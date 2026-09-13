/**
 * Level validator (§6.4): checks manifest + every level JSON against core invariants.
 * Usage: node tools/validate-levels.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(__dirname, "..", "public", "config");

const errors = [];
const warnings = [];

function readJson(rel) {
  const file = join(CONFIG, rel);
  if (!existsSync(file)) {
    errors.push(`missing file: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`invalid JSON: ${rel} (${e.message})`);
    return null;
  }
}

function ci(obj, key) {
  if (obj[key] !== undefined) return obj[key];
  const lower = key.toLowerCase();
  for (const k of Object.keys(obj)) if (k.toLowerCase() === lower) return obj[k];
  return undefined;
}

const manifest = readJson("levels_manifest.json");
if (manifest) {
  const levels = ci(manifest, "levels") ?? [];
  let match3 = 0;
  for (const entry of levels) {
    if (ci(entry, "bEnabled") === false) continue;
    const mode = ci(entry, "modeId") ?? "match3";
    if (mode.toLowerCase() !== "match3") continue;
    match3++;
    const cfgFile = ci(entry, "configFile");
    const level = readJson(cfgFile);
    if (!level) continue;
    const board = ci(level, "Board") ?? {};
    const rows = ci(board, "Rows") ?? 9;
    const cols = ci(board, "Cols") ?? 9;
    if (rows <= 0 || cols <= 0) errors.push(`${cfgFile}: Rows/Cols must be > 0`);
    const mask = ci(board, "Mask") ?? [];
    if (mask.length && (mask.length !== rows || mask.some((r) => r.length !== cols))) {
      errors.push(`${cfgFile}: Mask dimension mismatch (expected ${rows}x${cols})`);
    }
    const goal = ci(level, "Goal") ?? {};
    const perType = ci(goal, "BlockerBreakByType") ?? [];
    const defs = ci(board, "BlockerTypeDefs") ?? [];
    const known = new Set(defs.map((d) => ci(d, "TypeId")));
    for (const g of perType) {
      if (!known.has(ci(g, "TypeId"))) errors.push(`${cfgFile}: BlockerBreakByType references unknown TypeId`);
    }
    const boss = ci(level, "Boss") ?? {};
    const seal = ci(boss, "SealFailThreshold");
    if (seal !== undefined && (seal < 0 || seal > 1)) errors.push(`${cfgFile}: SealFailThreshold out of [0,1]`);
  }
  console.log(`Validated ${match3} match3 levels from manifest.`);
}

if (warnings.length) {
  console.log("\nWarnings:");
  for (const w of warnings) console.log("  -", w);
}
if (errors.length) {
  console.log("\nErrors:");
  for (const e of errors) console.log("  -", e);
  process.exit(1);
}
console.log("OK");
