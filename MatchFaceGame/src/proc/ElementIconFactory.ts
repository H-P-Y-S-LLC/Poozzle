/**
 * DOM HUD icon for an element: the same pixel art as the board sprite, kept at
 * its native aspect (no 3D projection, so it can't get squashed).
 */
import { elementIconCanvas } from "./TileFaceFactory.js";

const cache = new Map<number, string>();

export function elementIconDataURL(tileType: number): string {
  const hit = cache.get(tileType);
  if (hit) return hit;
  const url = elementIconCanvas(tileType).toDataURL("image/png");
  cache.set(tileType, url);
  return url;
}
