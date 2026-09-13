import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "../../src/proc/ProceduralAssetRegistry.js";

describe("ProceduralAssetRegistry", () => {
  it("resolves exact paths", () => {
    const reg = createDefaultRegistry();
    const r = reg.resolve("/Game/Models/paper/Paper.Paper");
    expect(r.source).toBe("exact");
    expect(r.family).toBe("blocker");
    expect(r.params?.typeId).toBe(4);
  });

  it("resolves by file name", () => {
    const reg = createDefaultRegistry();
    const r = reg.resolve("/Game/Sounds/ClickCue.ClickCue");
    // "ClickCue" name mapping wins over the Sounds/ family rule? Exact/Name have priority.
    expect(r.family).toBe("sfx");
    expect(r.source === "name" || r.source === "family").toBe(true);
    expect(r.params?.recipe ?? "click").toBe("click");
  });

  it("resolves by family prefix", () => {
    const reg = createDefaultRegistry();
    const r = reg.resolve("/Game/Models/block/somethingrandom/SomethingRandom");
    expect(r.family).toBe("blocker");
    expect(r.source).toBe("family");
  });

  it("is deterministic: same path => same recipe", () => {
    const a = createDefaultRegistry().resolve("/Game/Unknown/WeirdAsset.WeirdAsset");
    const b = createDefaultRegistry().resolve("/Game/Unknown/WeirdAsset.WeirdAsset");
    expect(a.source).toBe("hash");
    expect(a.shape?.base).toBe(b.shape?.base);
    expect(a.palette).toBe(b.palette);
  });

  it("different unknown paths likely differ", () => {
    const reg = createDefaultRegistry();
    const a = reg.resolve("/Game/Unknown/Aaa.Aaa");
    const b = reg.resolve("/Game/Unknown/Bbb.Bbb");
    expect(`${a.shape?.base}${a.palette}`).not.toBe(`${b.shape?.base}${b.palette}`);
  });

  it("never throws for arbitrary strings", () => {
    const reg = createDefaultRegistry();
    for (const s of ["", "/", "/Game/", "!!!!", "a.b.c.d", "中文资源"]) {
      expect(() => reg.resolve(s)).not.toThrow();
    }
  });
});
