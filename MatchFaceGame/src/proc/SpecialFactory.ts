/**
 * Special block shapes per spec §5.4.2:
 *  - LineHorizontal / LineVertical: flat double-arrow prism bar
 *  - Bomb3x3: spiked sphere
 *  - ColorBomb: rainbow icosahedron
 * All get a translucent emissive glow shell.
 */
import * as THREE from "three";
import { SpecialType } from "../logic/Match3Types.js";
import { SPECIAL_COLORS } from "./Palette.js";

function emissiveMaterial(color: string, intensity: number): THREE.MeshStandardMaterial {
  const hex = parseInt(color.slice(1), 16);
  return new THREE.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: intensity,
    roughness: 0.3,
    metalness: 0.1,
    flatShading: true,
  });
}

function glowShell(color: string, radius: number, opacity = 0.28): THREE.Mesh {
  const hex = parseInt(color.slice(1), 16);
  const mat = new THREE.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity,
    roughness: 0.1,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), mat);
  mesh.name = "glow";
  return mesh;
}

function makeLineBar(): THREE.Group {
  const g = new THREE.Group();
  const mat = emissiveMaterial(SPECIAL_COLORS.lineHorizontal, 0.9);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.24), mat);
  g.add(bar);
  const headGeo = new THREE.ConeGeometry(0.2, 0.3, 6);
  const headR = new THREE.Mesh(headGeo, mat);
  headR.position.x = 0.85;
  headR.rotation.z = -Math.PI / 2;
  const headL = new THREE.Mesh(headGeo, mat);
  headL.position.x = -0.85;
  headL.rotation.z = Math.PI / 2;
  g.add(headR, headL);
  return g;
}

export function makeSpecialObject(special: SpecialType): THREE.Group {
  const group = new THREE.Group();
  group.userData.special = special;

  if (special === SpecialType.LineHorizontal || special === SpecialType.LineVertical) {
    const bar = makeLineBar();
    if (special === SpecialType.LineVertical) bar.rotation.y = Math.PI / 2;
    group.add(bar);
    group.add(glowShell(SPECIAL_COLORS.lineHorizontal, 0.62, 0.22));
  } else if (special === SpecialType.Bomb3x3) {
    const mat = emissiveMaterial(SPECIAL_COLORS.bomb, 0.9);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 10), mat);
    group.add(core);
    const spikeGeo = new THREE.ConeGeometry(0.09, 0.3, 6);
    for (let i = 0; i < 12; i++) {
      const spike = new THREE.Mesh(spikeGeo, mat);
      const theta = (i / 12) * Math.PI * 2;
      const phi = i % 2 === 0 ? Math.PI / 3 : (2 * Math.PI) / 3;
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      spike.position.copy(dir).multiplyScalar(0.42);
      spike.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
      group.add(spike);
    }
    group.add(glowShell(SPECIAL_COLORS.bomb, 0.62, 0.22));
  } else if (special === SpecialType.ColorBomb) {
    const geo = new THREE.IcosahedronGeometry(0.46, 2);
    const colors = new Float32Array(geo.getAttribute("position").count * 3);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const hue = ((Math.atan2(pos.getZ(i), pos.getX(i)) / Math.PI + 1) * 0.5) % 1;
      c.setHSL(hue, 0.85, 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: 0x1a0a2e,
      emissiveIntensity: 0.25,
      roughness: 0.22,
      metalness: 0.15,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    group.add(glowShell("#7A4FD0", 0.6, 0.2));
    group.userData.spin = true;
  } else {
    // fallback
    const mat = emissiveMaterial(SPECIAL_COLORS.lineHorizontal, 0.9);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.3), mat));
  }

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  return group;
}
