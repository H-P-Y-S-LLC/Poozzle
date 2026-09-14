/**
 * DOM HUD icon for a blocker: the same pixel art as the board sprite, at its
 * native aspect (no 3D projection, so it can't get squashed).
 */
import { blockerIconCanvas } from "./BlockerSpriteFactory.js";

const cache = new Map<number, string>();

/** typeId 0 = generic blocker icon. */
export function blockerIconDataURL(typeId: number): string {
  const key = typeId || 4;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = blockerIconCanvas(key).toDataURL("image/png");
  cache.set(key, url);
  return url;
}
