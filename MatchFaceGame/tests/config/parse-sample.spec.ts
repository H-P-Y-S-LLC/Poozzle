import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest, selectMatch3Levels } from "../../src/config/LevelManifest.js";
import { parseLevelConfig } from "../../src/config/types/LevelConfig.js";
import { BoardLogic } from "../../src/logic/BoardLogic.js";

const here = dirname(fileURLToPath(import.meta.url));
const CONFIG = join(here, "..", "..", "public", "config");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(CONFIG, rel), "utf8"));
}

const manifest = parseManifest(readJson("levels_manifest.json"));
const match3 = selectMatch3Levels(manifest);

describe("real Match3Json config", () => {
  it("manifest parses with enabled match3 levels", () => {
    expect(manifest.levels.length).toBeGreaterThan(0);
    expect(match3.length).toBeGreaterThan(0);
    expect(match3.every((e) => e.configFile.startsWith("levels/"))).toBe(true);
  });

  it("parses every match3 level", () => {
    for (const entry of match3) {
      const level = parseLevelConfig(readJson(entry.configFile));
      expect(level.LevelId).toBe(entry.levelId);
      expect(level.Board.Rows).toBeGreaterThan(0);
      expect(level.Board.Cols).toBeGreaterThan(0);
      if (level.Board.Mask.length > 0) {
        expect(level.Board.Mask.length).toBe(level.Board.Rows);
      }
    }
  });

  it("initializes board logic for every match3 level without throwing", () => {
    const failures: string[] = [];
    for (const entry of match3) {
      try {
        const level = parseLevelConfig(readJson(entry.configFile));
        const board = new BoardLogic(level);
        if (level.Rules.bEnsureAtLeastOneMove && !board.hasAnyPossibleMove()) {
          failures.push(`${entry.levelId}: no possible move after init`);
        }
      } catch (err) {
        failures.push(`${entry.levelId}: ${(err as Error).message}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("rejects a mask with wrong dimensions", () => {
    expect(() =>
      parseLevelConfig({
        LevelId: "bad",
        Board: { Rows: 3, Cols: 3, Mask: ["11", "11", "11"] },
      })
    ).toThrow(/dimension mismatch/);
  });
});
