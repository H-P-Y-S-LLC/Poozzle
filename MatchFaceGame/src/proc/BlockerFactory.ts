/**
 * Per-TypeId procedural blocker shapes (approximation of §5.3.5).
 * All low-poly, zero external assets. Used by both the board view and the
 * asset gallery so what you see in the gallery matches the game.
 */
import * as THREE from "three";

interface Spec {
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
  metal?: number;
  opacity?: number;
}

const SPECS: Record<number, Spec> = {
  1: { color: 0x7a7f8c, metal: 0.7 },
  2: { color: 0x6e6a63 },
  3: { color: 0xffe9a8, emissive: 0xffe9a8, emissiveIntensity: 0.6 },
  4: { color: 0xe8e2d4 },
  5: { color: 0x7fd48f },
  6: { color: 0x8f7ba8 },
  7: { color: 0xc9a86b },
  8: { color: 0x6fa84a },
  9: { color: 0xa8e6f0 },
  10: { color: 0xf0f0f5 },
  11: { color: 0xe8b89a },
  12: { color: 0xffd93b },
  13: { color: 0xd96a7a },
  14: { color: 0xf2f2f5 },
  15: { color: 0x5a7a8c, opacity: 0.75 },
  16: { color: 0x4fa3d9 },
  17: { color: 0xd9a54f },
  18: { color: 0x6e7580, metal: 0.6 },
  19: { color: 0x6b4a2f },
  20: { color: 0xc9b08a },
  21: { color: 0x9a7b4f },
  22: { color: 0x7fa85a },
  23: { color: 0xffd60a, emissive: 0xffd60a, emissiveIntensity: 1.2, metal: 0.4 },
};

function material(spec: Spec): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: spec.color,
    emissive: spec.emissive ?? 0x000000,
    emissiveIntensity: spec.emissiveIntensity ?? 0,
    metalness: spec.metal ?? 0.05,
    roughness: 0.6,
    transparent: spec.opacity !== undefined,
    opacity: spec.opacity ?? 1,
    flatShading: true,
  });
}

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, pos: [number, number, number], rot?: [number, number, number], scale?: [number, number, number]): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** Returns a blocker group normalized to roughly one cell (0.82 units). */
export function makeBlockerObject(typeId: number): THREE.Group {
  const spec = SPECS[typeId] ?? { color: 0x8a8578 };
  const mat = material(spec);
  const group = new THREE.Group();
  const dark = material({ color: 0x2a2a32 });

  switch (typeId) {
    case 1: {
      add(group, new THREE.CylinderGeometry(0.22, 0.22, 0.7, 14), mat, [0, 0.35, 0], [0, 0, Math.PI / 2]);
      add(group, new THREE.TorusGeometry(0.24, 0.05, 8, 16), mat, [-0.34, 0.35, 0], [0, Math.PI / 2, 0]);
      add(group, new THREE.TorusGeometry(0.24, 0.05, 8, 16), mat, [0.34, 0.35, 0], [0, Math.PI / 2, 0]);
      break;
    }
    case 2: {
      add(group, new THREE.BoxGeometry(0.84, 0.14, 0.84), mat, [0, 0.14, 0]);
      add(group, new THREE.BoxGeometry(0.5, 0.02, 0.06), dark, [0, 0.22, 0]);
      add(group, new THREE.BoxGeometry(0.06, 0.02, 0.5), dark, [0, 0.22, 0]);
      break;
    }
    case 3: {
      add(group, new THREE.SphereGeometry(0.28, 14, 10), mat, [0, 0.44, 0]);
      add(group, new THREE.CylinderGeometry(0.12, 0.14, 0.2, 10), dark, [0, 0.12, 0]);
      break;
    }
    case 4: {
      const geo = new THREE.IcosahedronGeometry(0.36, 1);
      jitter(geo, 0.1);
      add(group, geo, mat, [0, 0.36, 0]);
      break;
    }
    case 5: {
      add(group, new THREE.SphereGeometry(0.26, 12, 10), mat, [0, 0.36, 0]);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        add(group, new THREE.CapsuleGeometry(0.03, 0.22, 3, 6), mat, [Math.cos(a) * 0.3, 0.36, Math.sin(a) * 0.3], [0, -a, Math.PI / 2]);
      }
      break;
    }
    case 6: {
      add(group, new THREE.ConeGeometry(0.36, 0.3, 12), mat, [0, 0.5, 0]);
      add(group, new THREE.CylinderGeometry(0.1, 0.12, 0.4, 8), material({ color: 0xd8c9b0 }), [0, 0.2, 0]);
      break;
    }
    case 7: {
      add(group, new THREE.SphereGeometry(0.2, 10, 8), mat, [0, 0.3, 0]);
      add(group, new THREE.TorusGeometry(0.28, 0.04, 6, 16), mat, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    case 8: {
      const geo = new THREE.IcosahedronGeometry(0.36, 2);
      dent(geo, 0.12);
      add(group, geo, mat, [0, 0.36, 0]);
      break;
    }
    case 9: {
      add(group, new THREE.BoxGeometry(0.7, 0.34, 0.5), mat, [0, 0.3, 0]);
      break;
    }
    case 10: {
      for (const [x, z] of [
        [-0.22, -0.22],
        [0.22, -0.22],
        [-0.22, 0.22],
        [0.22, 0.22],
      ] as const) add(group, new THREE.SphereGeometry(0.16, 10, 8), mat, [x, 0.3, z]);
      add(group, new THREE.SphereGeometry(0.2, 12, 10), material({ color: 0x3a4a6b }), [0, 0.36, 0]);
      break;
    }
    case 11: {
      add(group, new THREE.CapsuleGeometry(0.16, 0.24, 4, 8), mat, [0, 0.24, 0]);
      add(group, new THREE.CapsuleGeometry(0.14, 0.22, 4, 8), mat, [0, 0.52, 0]);
      add(group, new THREE.SphereGeometry(0.18, 10, 8), mat, [0, 0.74, 0]);
      break;
    }
    case 12: {
      add(group, new THREE.SphereGeometry(0.32, 12, 10), mat, [0, 0.32, -0.05], undefined, [1, 0.9, 1.2]);
      add(group, new THREE.SphereGeometry(0.22, 12, 10), mat, [0, 0.6, 0.2]);
      add(group, new THREE.ConeGeometry(0.1, 0.18, 8), material({ color: 0xff8c42 }), [0, 0.58, 0.42], [Math.PI / 2, 0, 0]);
      break;
    }
    case 13: {
      add(group, new THREE.TorusGeometry(0.3, 0.1, 8, 16, Math.PI), mat, [0, 0.36, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) add(group, new THREE.BoxGeometry(0.08, 0.14, 0.06), material({ color: 0xfff2f2 }), [-0.18 + i * 0.12, 0.3, 0.14]);
      break;
    }
    case 14: {
      add(group, new THREE.BoxGeometry(0.72, 0.34, 0.46), mat, [0, 0.28, 0]);
      add(group, new THREE.BoxGeometry(0.6, 0.1, 0.36), material({ color: 0x5a7a8c }), [0, 0.34, 0]);
      break;
    }
    case 15: {
      const geo = new THREE.CircleGeometry(0.44, 10);
      add(group, geo, mat, [0, 0.02, 0], [-Math.PI / 2, 0, 0]);
      break;
    }
    case 16: {
      add(group, new THREE.CylinderGeometry(0.18, 0.18, 0.6, 12), mat, [0, 0.32, 0]);
      add(group, new THREE.TorusGeometry(0.19, 0.03, 6, 14), material({ color: 0xffffff, metal: 0.3 }), [0, 0.36, 0], [Math.PI / 2, 0, 0]);
      add(group, new THREE.CylinderGeometry(0.03, 0.03, 0.24, 6), dark, [0.16, 0.72, 0], [0, 0, -0.6]);
      break;
    }
    case 17: {
      add(group, new THREE.BoxGeometry(0.56, 0.56, 0.56), mat, [0, 0.36, 0]);
      add(group, new THREE.BoxGeometry(0.62, 0.12, 0.12), material({ color: 0xff5a5f }), [0, 0.36, 0]);
      add(group, new THREE.BoxGeometry(0.12, 0.12, 0.62), material({ color: 0xff5a5f }), [0, 0.36, 0]);
      break;
    }
    case 18: {
      add(group, new THREE.CylinderGeometry(0.38, 0.38, 0.12, 16), mat, [0, 0.08, 0]);
      for (let i = 0; i < 5; i++) add(group, new THREE.BoxGeometry(0.6, 0.03, 0.04), dark, [0, 0.15, -0.24 + i * 0.12]);
      break;
    }
    case 19: {
      add(group, new THREE.CapsuleGeometry(0.2, 0.4, 4, 8), material({ color: 0x6b4a2f }), [0, 0.32, 0], [Math.PI / 2, 0, 0], [1, 1, 1]);
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(group, new THREE.CapsuleGeometry(0.03, 0.24, 3, 6), dark, [s * 0.24, 0.18, -0.2 + i * 0.2], [0, 0, s * 0.9]);
      break;
    }
    case 20: {
      add(group, new THREE.CapsuleGeometry(0.3, 0.5, 5, 10), mat, [0, 0.34, -0.1], [Math.PI / 2, 0, 0]);
      add(group, new THREE.SphereGeometry(0.2, 10, 8), mat, [0, 0.4, 0.42]);
      break;
    }
    case 21: {
      add(group, new THREE.ConeGeometry(0.42, 0.5, 10), mat, [0, 0.25, 0]);
      break;
    }
    case 22: {
      for (let i = 0; i < 6; i++) add(group, new THREE.ConeGeometry(0.12 + i * 0.02, 0.14, 10), mat, [0, 0.08 + i * 0.1, 0]);
      break;
    }
    case 23: {
      add(group, new THREE.CylinderGeometry(0.36, 0.36, 0.16, 10), mat, [0, 0.3, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        add(group, new THREE.BoxGeometry(0.12, 0.16, 0.12), mat, [Math.cos(a) * 0.42, 0.3, Math.sin(a) * 0.42], [0, -a, 0]);
      }
      add(group, new THREE.TorusGeometry(0.16, 0.04, 8, 16), material({ color: 0xfff2a0, emissive: 0xffd60a, emissiveIntensity: 0.8 }), [0, 0.3, 0], [Math.PI / 2, 0, 0]);
      break;
    }
    default: {
      add(group, new THREE.BoxGeometry(0.8, 0.6, 0.8), mat, [0, 0.3, 0]);
    }
  }

  return group;
}

export function blockerColor(typeId: number): number {
  return (SPECS[typeId] ?? { color: 0x8a8578 }).color;
}

function jitter(geo: THREE.BufferGeometry, amount: number): void {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + (Math.random() - 0.5) * amount, pos.getY(i) + (Math.random() - 0.5) * amount, pos.getZ(i) + (Math.random() - 0.5) * amount);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function dent(geo: THREE.BufferGeometry, amount: number): void {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    const k = 1 - ((Math.sin(v.x * 8) + Math.cos(v.y * 8) + Math.sin(v.z * 8)) / 6) * amount;
    pos.setXYZ(i, v.x * k, v.y * k, v.z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}
