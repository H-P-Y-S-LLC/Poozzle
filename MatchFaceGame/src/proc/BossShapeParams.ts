/**
 * Per-boss procedural parameters.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.5.2 (exact values from the table).
 */
export type BossBodyType = "grub" | "spider" | "worm" | "beetle" | "fly" | "mosquito" | "gecko" | "roach" | "ant" | "slug";

export type BossFeature = "pincers" | "proboscis" | "wings2" | "eyestalks" | "segmentRings" | "formation";

export interface BossShapeParams {
  bossId: string;
  name: string;
  bodyType: BossBodyType;
  bodyLength: number;
  bodyRadius: number;
  segments: number;
  legs: number;
  antennae: number;
  eyes: number;
  tail: boolean;
  shell: boolean;
  colorPrimary: string;
  colorAccent: string;
  emissiveAccent: boolean;
  feature?: BossFeature;
}

const B = (
  bossId: string,
  name: string,
  bodyType: BossBodyType,
  bodyLength: number,
  segments: number,
  legs: number,
  antennae: number,
  eyes: number,
  tail: boolean,
  shell: boolean,
  colorPrimary: string,
  colorAccent: string,
  emissiveAccent: boolean,
  feature?: BossFeature
): BossShapeParams => ({
  bossId,
  name,
  bodyType,
  bodyLength,
  bodyRadius: bodyType === "worm" || bodyType === "slug" ? 0.85 : bodyType === "spider" ? 1.1 : 0.7,
  segments,
  legs,
  antennae,
  eyes,
  tail,
  shell,
  colorPrimary,
  colorAccent,
  emissiveAccent,
  feature,
});

export const BOSS_SHAPE_PARAMS: Record<string, BossShapeParams> = {
  boss_placeholder_01: B("boss_placeholder_01", "Earwig", "beetle", 4.2, 4, 6, 2, 2, true, true, "#5A4A6E", "#C9A227", false, "pincers"),
  boss_placeholder_02: B("boss_placeholder_02", "Spider", "spider", 3.4, 2, 8, 0, 8, false, false, "#3E3A44", "#D9534F", false),
  boss_placeholder_03: B("boss_placeholder_03", "Red Worm", "worm", 5.6, 7, 0, 0, 2, false, false, "#C0392B", "#F5B041", false, "segmentRings"),
  boss_placeholder_04: B("boss_placeholder_04", "Sowbug", "beetle", 4.0, 8, 14, 2, 2, false, true, "#6B6B75", "#9AA0AA", false),
  boss_placeholder_05: B("boss_placeholder_05", "Moth Fly", "fly", 3.2, 3, 6, 2, 2, false, false, "#8A7F6B", "#D8C9A8", false, "wings2"),
  boss_placeholder_06: B("boss_placeholder_06", "Mosquito", "mosquito", 3.8, 3, 6, 2, 2, false, false, "#4A4A52", "#B33A3A", false, "proboscis"),
  boss_placeholder_07: B("boss_placeholder_07", "Gecko", "gecko", 5.0, 4, 4, 0, 2, true, false, "#5FA85A", "#E8D06A", false),
  boss_placeholder_08: B("boss_placeholder_08", "Roach", "roach", 4.4, 3, 6, 2, 2, false, true, "#5A3E22", "#8B6A3F", false),
  boss_placeholder_09: B("boss_placeholder_09", "White Ant", "ant", 3.6, 4, 6, 2, 2, false, false, "#E8DCC8", "#C9A227", false, "formation"),
  boss_placeholder_10: B("boss_placeholder_10", "Slug", "slug", 4.6, 5, 0, 2, 4, false, false, "#7FA85A", "#C9E07A", true, "eyestalks"),
};

export function bossShapeParams(bossId: string): BossShapeParams {
  return BOSS_SHAPE_PARAMS[bossId] ?? BOSS_SHAPE_PARAMS.boss_placeholder_03;
}
