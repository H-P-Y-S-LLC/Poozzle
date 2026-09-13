/**
 * Procedural geometry factory (zero external model files).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.1.2, §5.4.1.
 */
import * as THREE from "three";

const cache = new Map<string, THREE.BufferGeometry>();

export type PrimitiveName =
  | "roundedBox"
  | "box"
  | "sphere"
  | "icosa"
  | "octa"
  | "cylinder"
  | "hexPrism"
  | "capsule"
  | "torus"
  | "cone"
  | "flattenedBlob"
  | "crumpledBlob";

export interface PrimitiveOptions {
  size?: number;
  radius?: number;
  detail?: number;
  jitter?: number;
}

export function makePrimitive(name: PrimitiveName, opts: PrimitiveOptions = {}): THREE.BufferGeometry {
  const size = opts.size ?? 1;
  const key = `${name}|${size}|${opts.radius ?? ""}|${opts.detail ?? ""}|${opts.jitter ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let geo: THREE.BufferGeometry;
  switch (name) {
    case "roundedBox":
      geo = new THREE.BoxGeometry(size, size, size, 2, 2, 2);
      roundBoxVertices(geo, size * (opts.radius ?? 0.18));
      break;
    case "box":
      geo = new THREE.BoxGeometry(size, size, size);
      break;
    case "sphere":
      geo = new THREE.SphereGeometry(size * 0.5, 18, 14);
      break;
    case "icosa":
      geo = new THREE.IcosahedronGeometry(size * 0.55, opts.detail ?? 0);
      break;
    case "octa":
      geo = new THREE.OctahedronGeometry(size * 0.62, opts.detail ?? 0);
      break;
    case "cylinder":
      geo = new THREE.CylinderGeometry(size * 0.42, size * 0.42, size * 0.9, 20);
      break;
    case "hexPrism":
      geo = new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.8, 6);
      break;
    case "capsule":
      geo = new THREE.CapsuleGeometry(size * 0.35, size * 0.5, 4, 12);
      break;
    case "torus":
      geo = new THREE.TorusGeometry(size * 0.35, size * 0.14, 10, 24);
      break;
    case "cone":
      geo = new THREE.ConeGeometry(size * 0.45, size, 18);
      break;
    case "flattenedBlob":
      geo = new THREE.SphereGeometry(size * 0.5, 16, 10);
      geo.scale(1.15, 0.35, 1.15);
      break;
    case "crumpledBlob": {
      geo = new THREE.IcosahedronGeometry(size * 0.55, 1);
      jitterVertices(geo, opts.jitter ?? 0.12, 1337);
      break;
    }
    default:
      geo = new THREE.BoxGeometry(size, size, size);
  }
  cache.set(key, geo);
  return geo;
}

/** Parameterized tile geometry for TileType 1..7 (see §5.4.1 / Palette). */
export function makeTileGeometry(tileType: number): THREE.BufferGeometry {
  switch (tileType) {
    case 1:
      return makePrimitive("roundedBox", { size: 0.86, radius: 0.22 });
    case 2:
      return makePrimitive("icosa", { size: 0.95 });
    case 3:
      return makePrimitive("sphere", { size: 0.86 });
    case 4:
      return makePrimitive("cylinder", { size: 0.9 });
    case 5:
      return makePrimitive("octa", { size: 0.95 });
    case 6:
      return makePrimitive("hexPrism", { size: 0.92 });
    case 7:
      return makePrimitive("flattenedBlob", { size: 0.95 });
    default:
      return makePrimitive("roundedBox", { size: 0.86 });
  }
}

function jitterVertices(geo: THREE.BufferGeometry, amount: number, seed: number): void {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + (rnd() - 0.5) * amount,
      pos.getY(i) + (rnd() - 0.5) * amount,
      pos.getZ(i) + (rnd() - 0.5) * amount
    );
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function roundBoxVertices(geo: THREE.BufferGeometry, radius: number): void {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const half = 0.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.max(-half, Math.min(half, x));
    const ny = Math.max(-half, Math.min(half, y));
    const nz = Math.max(-half, Math.min(half, z));
    const dx = x - nx;
    const dy = y - ny;
    const dz = z - nz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const f = Math.max(0, Math.min(1, radius / dist));
    pos.setXYZ(i, x - dx * f, y - dy * f, z - dz * f);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function disposeGeometryCache(): void {
  for (const g of cache.values()) g.dispose();
  cache.clear();
}
