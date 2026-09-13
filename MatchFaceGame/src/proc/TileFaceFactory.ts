/**
 * 3D "face" element factory. Base geometry + palette come from the spec
 * (§5.3.1 / §5.4.1); the facial features are added on top so MatchFace tiles
 * really show a face. Features face +Y (the board is viewed top-down).
 */
import * as THREE from "three";
import { makeTileGeometry } from "./ShapeFactory.js";
import { tileMaterial } from "./MaterialFactory.js";
import { TILE_PALETTE, tileColor } from "./Palette.js";

const featureCache = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = featureCache.get(key);
  if (!g) {
    g = make();
    featureCache.set(key, g);
  }
  return g;
}

function darkMaterial(tileType: number): THREE.MeshStandardMaterial {
  const c = tileColor(tileType);
  return new THREE.MeshStandardMaterial({ color: parseInt(c.dark.slice(1), 16), roughness: 0.5, flatShading: true });
}

function eyeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0x101018, roughness: 0.3, flatShading: true });
}

function mouthMaterial(tileType: number): THREE.MeshStandardMaterial {
  return darkMaterial(tileType);
}

function shapeIsRound(tileType: number): boolean {
  const shape = TILE_PALETTE[tileType]?.shape;
  return shape === "sphere" || shape === "icosa" || shape === "octa";
}

export function makeFaceObject(tileType: number): THREE.Group {
  const group = new THREE.Group();
  const geoBase = makeTileGeometry(tileType);
  const base = new THREE.Mesh(geoBase, tileMaterial(tileType));
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);

  geoBase.computeBoundingBox();
  const bb = geoBase.boundingBox!;
  const topY = bb.max.y;
  const round = shapeIsRound(tileType);

  const eyeGeo = geo("face-eye", () => new THREE.SphereGeometry(0.075, 10, 8));
  const pupilGeo = geo("face-pupil", () => new THREE.SphereGeometry(0.03, 8, 6));

  // surface height for a feature offset from the top center
  const surf = (dx: number, dz: number): number => {
    if (!round) return topY + 0.02;
    const r = topY;
    const d2 = dx * dx + dz * dz;
    return Math.sqrt(Math.max(0.02, r * r - d2)) - 0.02;
  };

  const eyeZ = 0.1;
  const eyeSpec: Array<{ x: number; scale: number; brow: number }> = [];
  // expression per tile type
  switch (tileType) {
    case 1: // coral - happy
      eyeSpec.push({ x: -0.15, scale: 1, brow: 0 }, { x: 0.15, scale: 1, brow: 0 });
      break;
    case 2: // amber - surprised (big eyes)
      eyeSpec.push({ x: -0.16, scale: 1.25, brow: 0 }, { x: 0.16, scale: 1.25, brow: 0 });
      break;
    case 3: // mint - sleepy
      eyeSpec.push({ x: -0.15, scale: 0.85, brow: 0 }, { x: 0.15, scale: 0.85, brow: 0 });
      break;
    case 4: // sky - angry (brows)
      eyeSpec.push({ x: -0.15, scale: 1, brow: 0.5 }, { x: 0.15, scale: 1, brow: -0.5 });
      break;
    case 5: // violet - wink
      eyeSpec.push({ x: -0.15, scale: 1, brow: 0 }, { x: 0.15, scale: 0.5, brow: 0 });
      break;
    default: // peach / mud - neutral
      eyeSpec.push({ x: -0.15, scale: 1, brow: 0 }, { x: 0.15, scale: 1, brow: 0 });
      break;
  }

  const eyeMat = eyeMaterial();
  const pupilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 });
  for (const e of eyeSpec) {
    const y = surf(e.x, eyeZ) + 0.06 * e.scale;
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(e.x, y, eyeZ);
    eye.scale.setScalar(e.scale);
    group.add(eye);
    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.set(e.x + 0.015, y + 0.045 * e.scale, eyeZ + 0.02);
    group.add(pupil);
    if (e.brow !== 0) {
      const brow = new THREE.Mesh(geo("face-brow", () => new THREE.BoxGeometry(0.14, 0.03, 0.04)), darkMaterial(tileType));
      brow.position.set(e.x, y + 0.11, eyeZ + 0.02);
      brow.rotation.z = e.brow;
      group.add(brow);
    }
  }

  // mouth per expression
  const mouthZ = 0.24;
  const mouthY = surf(0, mouthZ) + 0.03;
  const mMat = mouthMaterial(tileType);
  if (tileType === 2) {
    // surprised: round O
    const m = new THREE.Mesh(geo("face-mouth-o", () => new THREE.TorusGeometry(0.06, 0.028, 8, 14)), mMat);
    m.position.set(0, mouthY, mouthZ);
    m.rotation.x = -Math.PI / 2;
    group.add(m);
  } else {
    const dir = tileType === 4 ? -1 : 1; // angry frown else smile
    const arc = new THREE.Mesh(
      geo(`face-mouth-arc-${dir}`, () => {
        const t = new THREE.TorusGeometry(0.12, 0.03, 6, 16, Math.PI);
        return t;
      }),
      mMat
    );
    arc.position.set(0, mouthY, mouthZ - 0.05);
    arc.rotation.x = -Math.PI / 2;
    arc.rotation.z = dir > 0 ? 0 : Math.PI;
    group.add(arc);
    if (tileType === 1 || tileType === 6) {
      // add a small tongue-ish bar for a grin
      const bar = new THREE.Mesh(geo("face-mouth-bar", () => new THREE.BoxGeometry(0.16, 0.03, 0.05)), mMat);
      bar.position.set(0, mouthY - 0.01, mouthZ);
      group.add(bar);
    }
  }

  return group;
}
