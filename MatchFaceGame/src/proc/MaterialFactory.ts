/**
 * Procedural material factory (cached by content key).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.3.2.
 */
import * as THREE from "three";
import { SPECIAL_COLORS, STATE_COLORS, tileColor } from "./Palette.js";

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  flatShading?: boolean;
}

const cache = new Map<string, THREE.MeshStandardMaterial>();

function make(key: string, color: number, opts: MaterialOptions): THREE.MeshStandardMaterial {
  const hit = cache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.45,
    metalness: opts.metalness ?? 0.05,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    flatShading: opts.flatShading ?? true,
  });
  cache.set(key, mat);
  return mat;
}

export function tileMaterial(tileType: number): THREE.MeshStandardMaterial {
  const c = tileColor(tileType);
  return make(`tile:${tileType}`, parseInt(c.main.slice(1), 16), { roughness: 0.45 });
}

export function tileTopMaterial(tileType: number): THREE.MeshStandardMaterial {
  const c = tileColor(tileType);
  return make(`tile-top:${tileType}`, parseInt(c.dark.slice(1), 16), { roughness: 0.5 });
}

export function specialMaterial(special: number): THREE.MeshStandardMaterial {
  const map: Record<number, string> = {
    1: SPECIAL_COLORS.lineHorizontal,
    2: SPECIAL_COLORS.lineVertical,
    3: SPECIAL_COLORS.bomb,
    4: SPECIAL_COLORS.colorBomb,
  };
  const hex = map[special] ?? "#FFFFFF";
  return make(`special:${special}`, parseInt(hex.slice(1), 16), {
    roughness: 0.25,
    emissive: parseInt(hex.slice(1), 16),
    emissiveIntensity: 0.9,
  });
}

export function blockerMaterial(typeId: number): THREE.MeshStandardMaterial {
  // Low-saturation warm grey family, darker with more HP handled by view scale.
  const base = 0x8a8578 + ((typeId * 0x111111) & 0x1f1f1f);
  return make(`blocker:${typeId}`, base, { roughness: 0.8, metalness: 0.05 });
}

export function stateMaterial(state: keyof typeof STATE_COLORS): THREE.MeshStandardMaterial {
  const hex = STATE_COLORS[state];
  return make(`state:${state}`, parseInt(hex.slice(1), 16), {
    roughness: 0.15,
    transparent: true,
    opacity: 0.45,
    emissive: parseInt(hex.slice(1), 16),
    emissiveIntensity: 0.3,
  });
}

export function floorMaterial(): THREE.MeshStandardMaterial {
  return make("floor", 0x1b2033, { roughness: 0.9, metalness: 0 });
}

export function boardFrameMaterial(): THREE.MeshStandardMaterial {
  return make("frame", 0x2a3350, { roughness: 0.7, metalness: 0.1 });
}

export function disposeMaterialCache(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
