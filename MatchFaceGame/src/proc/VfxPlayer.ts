/**
 * Lightweight GPU particle burst player (zero external assets).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.6.1.
 */
import * as THREE from "three";
import { Prng } from "../core/Prng.js";

const MAX = 700;

function makeSoftDot(): THREE.CanvasTexture {
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  r: number;
  g: number;
  b: number;
  gravity: number;
  drag: number;
}

export class VfxPlayer {
  private points: THREE.Points;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private alpha = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private pool: Particle[] = [];
  private cursor = 0;
  private rnd = new Prng(0xc0ffee);
  private camera: THREE.Camera;
  private fx: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; max: number; kind: "beam" | "ring"; axis?: "x" | "z"; to: number; base?: number }> = [];

  constructor(parent: THREE.Object3D, camera: THREE.Camera) {
    this.camera = camera;
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute("aColor", new THREE.BufferAttribute(this.col, 3));
    this.geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alpha, 1));
    this.geo.setAttribute("aSize", new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: makeSoftDot() },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
        uPointScale: { value: 90 },
      },
      vertexShader: `
        attribute vec3 aColor;
        attribute float aAlpha;
        attribute float aSize;
        uniform float uPixelRatio;
        uniform float uPointScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          gl_PointSize = aSize * uPixelRatio * uPointScale;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(vColor, 1.0) * t * vAlpha;
          if (gl_FragColor.a < 0.01) discard;
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 100000; // always above flat sprites
    parent.add(this.points);
    for (let i = 0; i < MAX; i++) {
      this.pool.push({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 0.1, r: 1, g: 1, b: 1, gravity: 7, drag: 1.4 });
    }
  }

  /** Burst `count` shards from a world position. */
  burst(position: THREE.Vector3, color: THREE.Color, count = 9, speed = 3): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      const a = this.rnd.next() * Math.PI * 2;
      const up = 0.3 + this.rnd.next() * 0.9;
      const horiz = Math.sqrt(Math.max(0, 1 - up * up));
      const sp = speed * (0.5 + this.rnd.next() * 0.9);
      p.alive = true;
      p.x = position.x + (this.rnd.next() - 0.5) * 0.2;
      p.y = position.y + this.rnd.next() * 0.1;
      p.z = position.z + (this.rnd.next() - 0.5) * 0.2;
      p.vx = Math.cos(a) * horiz * sp;
      p.vy = up * sp;
      p.vz = Math.sin(a) * horiz * sp;
      p.life = 0.45 + this.rnd.next() * 0.35;
      p.max = p.life;
      p.size = 0.09 + this.rnd.next() * 0.1;
      p.r = color.r;
      p.g = color.g;
      p.b = color.b;
    }
  }

  /** Expanding energy beam across a full row (horizontal) or column. */
  beam(position: THREE.Vector3, horizontal: boolean, length: number, color: THREE.Color): void {
    // two layers: a wide soft halo + a bright thin core, stretched across the screen
    const layers: Array<{ w: number; h: number; opacity: number }> = [
      { w: 0.06, h: 0.42, opacity: 0.35 },
      { w: 0.05, h: 0.16, opacity: 0.95 },
    ];
    for (const layer of layers) {
      const geo = new THREE.BoxGeometry(1, 0.12, 0.2);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: layer.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 100001;
      mesh.position.copy(position);
      mesh.position.y = 0.34;
      if (horizontal) mesh.scale.set(0.02, layer.h, layer.w);
      else {
        mesh.rotation.y = Math.PI / 2;
        mesh.scale.set(0.02, layer.h, layer.w);
      }
      this.points.parent?.add(mesh);
      this.fx.push({ mesh, mat, life: 0.34, max: 0.34, kind: "beam", axis: horizontal ? "x" : "z", to: length, base: layer.opacity });
    }
  }

  /** Expanding shockwave ring (bomb / colorbomb). */
  shockwave(position: THREE.Vector3, color: THREE.Color, radius: number): void {
    const geo = new THREE.TorusGeometry(0.6, 0.08, 8, 32);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 100001;
    mesh.position.copy(position);
    mesh.position.y = 0.3;
    mesh.rotation.x = -Math.PI / 2;
    this.points.parent?.add(mesh);
    this.fx.push({ mesh, mat, life: 0.45, max: 0.45, kind: "ring", to: radius });
  }

  /** Particles streaming from `from` toward `to`, bursting on arrival. */
  projectile(from: THREE.Vector3, to: THREE.Vector3, color: THREE.Color, count = 16): void {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length() || 1;
    dir.normalize();
    const life = 0.5;
    const speed = dist / life;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      p.alive = true;
      p.x = from.x + (this.rnd.next() - 0.5) * 0.25;
      p.y = from.y + (this.rnd.next() - 0.5) * 0.25;
      p.z = from.z + (this.rnd.next() - 0.5) * 0.25;
      const sp = speed * (0.85 + this.rnd.next() * 0.3);
      p.vx = dir.x * sp + (this.rnd.next() - 0.5) * 0.5;
      p.vy = dir.y * sp + (this.rnd.next() - 0.5) * 0.5;
      p.vz = dir.z * sp + (this.rnd.next() - 0.5) * 0.5;
      p.life = life;
      p.max = life;
      p.size = 0.09 + this.rnd.next() * 0.07;
      p.r = color.r;
      p.g = color.g;
      p.b = color.b;
      p.gravity = 0;
      p.drag = 0;
    }
    window.setTimeout(() => this.burst(to, color, 12, 2.4), Math.round(life * 1000 * 0.8));
  }

  update(dt: number): void {
    this.updateFx(dt);
    // keep point size consistent regardless of viewport/frustum
    const cam = this.camera as THREE.OrthographicCamera;
    if (cam.top !== undefined) {
      const worldH = cam.top - cam.bottom;
      const px = (window.innerHeight || 800) / Math.max(0.001, worldH);
      this.mat.uniforms.uPointScale.value = px * 0.75;
    }
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p.alive) {
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }
      p.vy -= p.gravity * dt;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const k = p.life / p.max;
      const o = i * 3;
      this.pos[o] = p.x;
      this.pos[o + 1] = p.y;
      this.pos[o + 2] = p.z;
      this.col[o] = p.r;
      this.col[o + 1] = p.g;
      this.col[o + 2] = p.b;
      this.alpha[i] = k * k;
      this.size[i] = p.size * (0.5 + k * 0.7);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }

  dispose(): void {
    for (const f of this.fx) {
      f.mesh.parent?.remove(f.mesh);
      f.mesh.geometry.dispose();
      f.mat.dispose();
    }
    this.fx = [];
    this.points.parent?.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
  }

  private updateFx(dt: number): void {
    if (this.fx.length === 0) return;
    const keep: typeof this.fx = [];
    for (const f of this.fx) {
      f.life -= dt;
      if (f.life <= 0) {
        f.mesh.parent?.remove(f.mesh);
        f.mesh.geometry.dispose();
        f.mat.dispose();
        continue;
      }
      const k = 1 - f.life / f.max;
      if (f.kind === "beam") {
        const grow = Math.min(1, k * 3.5);
        f.mesh.scale.x = Math.max(0.02, f.to * grow);
        f.mat.opacity = (f.base ?? 0.95) * (1 - k * k);
      } else {
        f.mesh.scale.setScalar(0.4 + k * f.to);
        f.mat.opacity = (f.base ?? 0.9) * (1 - k);
      }
      keep.push(f);
    }
    this.fx = keep;
  }
}
