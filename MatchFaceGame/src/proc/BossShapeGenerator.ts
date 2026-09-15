/**
 * Parametric procedural boss generator (zero model files).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.5.1 / §5.5.2.
 *
 * Produces visually distinct creatures per bodyType, using the exact per-boss
 * parameters from the spec table. Local space: head at +Z, tail at -Z, on XZ.
 */
import * as THREE from "three";
import type { BossShapeParams } from "./BossShapeParams.js";

export interface BossModel {
  group: THREE.Group;
  head: THREE.Group;
  legs: THREE.Group[];
  wings: Array<{ group: THREE.Group; side: number }>;
  tail: THREE.Group[];
  antennae: Array<{ group: THREE.Group; side: number }>;
  bodyMaterials: THREE.MeshStandardMaterial[];
  eyes: THREE.Group;
}

export function generateBossModel(p: BossShapeParams): BossModel {
  const group = new THREE.Group();
  const primary = new THREE.MeshStandardMaterial({ color: p.colorPrimary, roughness: 0.55, flatShading: true });
  const accent = new THREE.MeshStandardMaterial({
    color: p.colorAccent,
    roughness: 0.45,
    metalness: p.shell ? 0.5 : 0.1,
    emissive: p.emissiveAccent ? p.colorAccent : 0x000000,
    emissiveIntensity: p.emissiveAccent ? 0.5 : 0,
    flatShading: true,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14141c, roughness: 0.5, flatShading: true });
  const bodyMaterials = [primary, accent, dark];

  const head = new THREE.Group();
  const eyesGroup = new THREE.Group();
  const legs: THREE.Group[] = [];
  const wings: Array<{ group: THREE.Group; side: number }> = [];
  const tail: THREE.Group[] = [];
  const antennae: Array<{ group: THREE.Group; side: number }> = [];

  const sphere = (parent: THREE.Object3D, pos: [number, number, number], r: number, mat: THREE.Material, scale: [number, number, number] = [1, 1, 1]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat);
    m.position.set(...pos);
    m.scale.set(...scale);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const L = p.bodyLength * 0.5; // world length of the torso
  const spacing = L / Math.max(1, p.segments);
  const baseR = p.bodyRadius * 0.55;
  const slimTypes = new Set(["worm", "slug", "mosquito"]);
  const slim = slimTypes.has(p.bodyType);

  // ── torso: segments along Z (head +Z, tail -Z) ──
  for (let i = 0; i < p.segments; i++) {
    const t = i / Math.max(1, p.segments - 1);
    const z = L * 0.5 - i * spacing;
    const bulge = Math.sin(t * Math.PI) * 0.35 + 0.8;
    const r = baseR * bulge * (slim ? 0.85 : 1);
    const bodyY = p.shell ? 0.2 : 0.3;
    const bodyYScale = (p.bodyType === "roach" ? 0.5 : p.bodyType === "spider" ? 1 : 0.95) * (p.shell ? 0.85 : 1);
    sphere(group, [0, bodyY, z], r, primary, [
      p.bodyType === "roach" ? 1.25 : 1,
      bodyYScale,
      p.bodyType === "worm" || p.bodyType === "slug" ? 0.85 : 1.35,
    ]);
    if (p.feature === "segmentRings" && i > 0) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.04, 6, 16), accent);
      ring.position.set(0, 0.3, z + spacing * 0.5);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }
  }

  // shell (beetle/roach): translucent carapace over the torso
  if (p.shell) {
    const shellMat = new THREE.MeshStandardMaterial({
      color: p.colorAccent,
      metalness: 0.6,
      roughness: 0.3,
      transparent: false,
      opacity: 1,
      flatShading: true,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(baseR * 1.25, 14, 10), shellMat);
    shell.position.set(0, 0.42, 0);
    shell.scale.set(1.15, 0.55, (L * 1.05) / (baseR * 1.25));
    group.add(shell);
  }

  // ── head + eyes ──
  const headZ = L * 0.5 + baseR * 0.6 + 0.1;
  head.position.set(0, 0.32, headZ);
  group.add(head);
  const headR = baseR * (p.bodyType === "ant" ? 1.1 : 0.95);
  sphere(head, [0, 0, 0], headR, primary, [1, 0.95, 1]);
  const eyeCount = Math.max(0, Math.min(8, p.eyes));
  const scleraGeo = new THREE.SphereGeometry(headR * 0.28, 8, 6);
  const pupilGeo = new THREE.SphereGeometry(headR * 0.13, 6, 5);
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f8, roughness: 0.3 });
  for (let i = 0; i < eyeCount; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const e = new THREE.Mesh(scleraGeo, scleraMat);
    e.position.set(side * headR * (0.36 + row * 0.16), headR * (0.45 - row * 0.28), headR * 0.72);
    head.add(e);
    const pupil = new THREE.Mesh(pupilGeo, dark);
    pupil.position.copy(e.position).add(new THREE.Vector3(0, 0, headR * 0.2));
    head.add(pupil);
  }
  head.add(eyesGroup);

  // ── legs (pairs along the body; legs is the TOTAL count) ──
  const pairs = Math.ceil(p.legs / 2);
  for (let s = 0; s < pairs; s++) {
    const z = L * 0.35 - (s * (L * 0.8)) / Math.max(1, pairs - 1 || 1);
    for (const side of [1, -1]) {
      const hip = new THREE.Group();
      hip.position.set(side * baseR * 0.9, 0.3, z);
      const len = baseR * (p.bodyType === "spider" ? 3.2 : 2.2);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.14, baseR * 0.11, len, 6), accent);
      upper.castShadow = true;
      upper.position.set(side * len * 0.32, -len * 0.18, 0);
      upper.rotation.z = side * 1.0;
      hip.add(upper);
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.1, baseR * 0.06, len * 0.9, 6), accent);
      lower.castShadow = true;
      lower.position.set(side * len * 0.85, -len * 0.5, 0);
      lower.rotation.z = side * 0.35;
      hip.add(lower);
      group.add(hip);
      legs.push(hip);
    }
  }

  // ── antennae ──
  for (let i = 0; i < p.antennae; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const a = new THREE.Group();
    a.position.set(side * headR * 0.3, 0.45, headZ + headR * 0.2);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.06, baseR * 0.04, baseR * (p.bodyType === "roach" ? 4 : 2.2), 6), accent);
    tube.position.set(side * baseR * 0.3, baseR * 0.8, baseR * 0.5);
    tube.rotation.z = side * 0.5;
    tube.rotation.x = -0.5;
    a.add(tube);
    sphere(a, [side * baseR * 0.5, baseR * 1.6, baseR * 0.95], baseR * 0.1, accent);
    group.add(a);
    antennae.push({ group: a, side });
  }

  // ── tail ──
  if (p.tail) {
    let parent: THREE.Object3D = group;
    const isGecko = p.bodyType === "gecko";
    const n = isGecko ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, isGecko ? -0.02 : 0.05, i === 0 ? -L * 0.5 : -spacing * 0.9);
      const r = baseR * (isGecko ? 0.9 - i * 0.12 : 0.7 - i * 0.12);
      sphere(seg, [0, 0, 0], Math.max(0.04, r), i % 2 ? primary : primary, [1, 0.9, 1.4]);
      parent.add(seg);
      tail.push(seg);
      parent = seg;
    }
  }

  // ── body-type features ──
  if (p.feature === "pincers") {
    for (const side of [1, -1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.22, baseR * 1.3, 6), accent);
      cone.castShadow = true;
      cone.position.set(side * baseR * 0.5, 0.3, -L * 0.5 - baseR * 0.7);
      cone.rotation.x = -Math.PI / 2;
      cone.rotation.z = side * 0.5;
      group.add(cone);
    }
  }
  if (p.feature === "proboscis") {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(baseR * 0.14, baseR * 3.2, 6), accent);
    cone.castShadow = true;
    cone.position.set(0, 0.28, headZ + headR * 1.6);
    cone.rotation.x = Math.PI / 2;
    group.add(cone);
  }
  if (p.feature === "wings2") {
    for (let pair = 0; pair < 2; pair++) {
      for (const side of [1, -1]) {
        const w = new THREE.Group();
        w.position.set(side * baseR * 0.5, 0.55 - pair * 0.06, L * 0.15 - pair * 0.5);
        const wing = new THREE.Mesh(new THREE.SphereGeometry(baseR * 1.5, 10, 6), accent);
        wing.scale.set(1.4, 0.06, 0.7);
        wing.position.set(side * baseR * 1.4, 0, -baseR * 0.4);
        w.add(wing);
        group.add(w);
        wings.push({ group: w, side });
      }
    }
  }
  if (p.feature === "eyestalks") {
    for (const side of [1, -1]) {
      const st = new THREE.Group();
      st.position.set(side * headR * 0.35, 0.5, headZ);
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(baseR * 0.09, baseR * 0.09, baseR * 1.6, 6), primary);
      stalk.position.y = baseR * 0.8;
      st.add(stalk);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(baseR * 0.22, 8, 6), scleraMat);
      eye.position.y = baseR * 1.6;
      st.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(baseR * 0.1, 6, 5), dark);
      pupil.position.set(0, baseR * 1.6, baseR * 0.16);
      st.add(pupil);
      group.add(st);
      antennae.push({ group: st, side });
    }
  }

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });

  return { group, head, legs, wings, tail, antennae, bodyMaterials, eyes: eyesGroup };
}
