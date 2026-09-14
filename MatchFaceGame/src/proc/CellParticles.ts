/**
 * Small animated particle cluster rendered UNDER a special/blocker sprite so the
 * two categories read differently even though both are flat and transparent:
 *  - special: bright energy motes rising and orbiting (additive)
 *  - blocker: slow dusty motes drifting around the base (normal blend)
 */
import * as THREE from "three";

let dotTex: THREE.CanvasTexture | null = null;
function dotTexture(): THREE.CanvasTexture {
  if (dotTex) return dotTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 1, 32, 32, 30);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fill();
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}

const COUNT = 16;

export interface ParticleHandle {
  points: THREE.Points;
  update: (t: number) => void;
}

export function makeCellParticles(kind: "special" | "blocker", color: string): ParticleHandle {
  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) seeds[i] = Math.random() * Math.PI * 2;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    map: dotTexture(),
    color: parseInt(color.slice(1), 16),
    size: kind === "special" ? 0.38 : 0.28,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: kind === "special" ? THREE.AdditiveBlending : THREE.NormalBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 0; // drawn under the sprites (which start at renderOrder 1)

  const update = (t: number): void => {
    for (let i = 0; i < COUNT; i++) {
      const s = seeds[i];
      let x: number;
      let y: number;
      let z: number;
      if (kind === "special") {
        // low orbit right around the icon so the motes stay visible in play
        const cycle = (t * 0.9 + s) % 1;
        y = 0.04 + cycle * 0.16;
        const r = 0.42;
        x = Math.cos(s * 3 + t * 1.8) * r;
        z = Math.sin(s * 3 + t * 1.8) * r;
      } else {
        y = 0.04 + Math.sin(t * 1.1 + s) * 0.04;
        const r = 0.5;
        x = Math.cos(s + t * 0.5) * r;
        z = Math.sin(s * 1.7 + t * 0.45) * r;
      }
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  };
  // seed initial positions
  update(0);

  return { points, update };
}
