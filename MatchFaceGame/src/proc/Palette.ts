/**
 * Semantic palette. All colors live here — no hex literals in business code.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.3.1.
 */

export interface TileColor {
  name: string;
  main: string;
  dark: string;
  /** Shape grammar base (see §5.1.2 / §5.4.1). */
  shape: string;
}

export const TILE_PALETTE: Record<number, TileColor> = {
  1: { name: "coral", main: "#FF5A5F", dark: "#C43B40", shape: "roundedBox" },
  2: { name: "amber", main: "#FFB020", dark: "#C07C0E", shape: "icosa" },
  3: { name: "mint", main: "#2ED47A", dark: "#1B9A55", shape: "sphere" },
  4: { name: "sky", main: "#2D9CFF", dark: "#1A6BB8", shape: "cylinder" },
  5: { name: "violet", main: "#A55CFF", dark: "#6F35B8", shape: "octa" },
  6: { name: "peach", main: "#FF7A45", dark: "#C0501F", shape: "hexPrism" },
  7: { name: "mud", main: "#8C6A3F", dark: "#5C4527", shape: "flattenedBlob" },
};

export function tileColor(type: number): TileColor {
  return TILE_PALETTE[type] ?? TILE_PALETTE[1];
}

export const STATE_COLORS = {
  highlight: "#FFFFFF",
  blocked: "#5A6172",
  frozen: "#7FE3FF",
  sticky: "#7CD46A",
  larvae: "#D4C24A",
  bubble: "#BFE9FF",
  poison: "#9B4DFF",
  danger: "#FF3B30",
  heal: "#34C759",
  reward: "#FFD60A",
} as const;

export const UI_COLORS = {
  bg: "#141726",
  panel: "#1E2233",
  border: "#333A52",
  text: "#F2F5FF",
  textDim: "#A8B0C8",
  accent: "#4C9AFF",
} as const;

export const SPECIAL_COLORS = {
  lineHorizontal: "#FFD166",
  lineVertical: "#06D6A0",
  bomb: "#EF476F",
  colorBomb: "#B388FF",
} as const;

/** Convert a palette key or hex string into a numeric 0xRRGGBB color. */
export function colorToHex(value: string): number {
  const s = value.trim();
  if (s.startsWith("#")) return parseInt(s.slice(1), 16);
  return 0xff00ff;
}

/** Deterministic HSL color from a hue (used by hash fallback recipes). */
export function hueToHex(hue: number, saturation = 0.65, lightness = 0.55): string {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
