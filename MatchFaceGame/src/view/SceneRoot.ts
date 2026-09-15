/**
 * Three.js scene root: renderer, orthographic camera, lighting, board frame.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.3.4.
 */
import * as THREE from "three";
import { TweenManager } from "../core/Tween.js";


export class SceneRoot {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly tweens = new TweenManager();
  readonly boardRoot = new THREE.Group();

  private container: HTMLElement;
  private clock = new THREE.Clock();
  private running = false;
  private onFrame: ((dt: number) => void) | null = null;
  private boardSize = { rows: 7, cols: 7 };
  private bossStrip = 0;
  private readonly boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();

  private ambient: THREE.Group | null = null;
  private ambientHalos: THREE.Mesh[] = [];
  private ambientParticles: THREE.Points | null = null;
  private ambientParticleBase: Float32Array | null = null;
  private ambientGlows: Array<{ mesh: THREE.Mesh; base: number; phase: number; speed: number }> = [];
  private ambientTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x0f1220);
    // No distance fog: the camera is a pure top-down orthographic view.

    this.camera = new THREE.OrthographicCamera(-6, 6, 6, -6, -100, 100);

    this.setupLights();
    this.scene.add(this.boardRoot);

    window.addEventListener("resize", () => this.onResize());
  }

  private setupLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x1a1d2e, 0.9));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(6, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -10;
    key.shadow.camera.right = 10;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x5fa8ff, 0.6);
    rim.position.set(-8, 6, -6);
    this.scene.add(rim);
  }

  /** Rebuild floor/frame for the given board dimensions and fit the camera. */
  layoutBoard(rows: number, cols: number, cellSize = 1, usable?: boolean[]): void {
    this.boardSize = { rows, cols };
    // clear previous frame
    for (const child of [...this.boardRoot.children]) {
      if (child.name === "floor" || child.name === "frame" || child.name === "grid") this.boardRoot.remove(child);
    }
    const w = cols * cellSize;
    const d = rows * cellSize;

    // no solid board background: only the usable cells carry the grid pattern
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(w + 1, 0.6, d + 1),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    floor.name = "floor";
    floor.position.y = -0.3;
    this.boardRoot.add(floor);

    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({
        map: boardGridTexture(rows, cols, usable),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
    );
    grid.name = "grid";
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.004;
    grid.renderOrder = 0; // under the tile sprites (which start at renderOrder 1)
    this.boardRoot.add(grid);

    const frameGeo = new THREE.BoxGeometry(w + 1.5, 0.25, d + 1.5);
    const frame = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    frame.name = "frame";
    frame.position.y = -0.9;
    this.boardRoot.add(frame);

    this.fitCamera(w, d);
    this.buildAmbient(w, d);
  }

  /**
   * Low-contrast scenery around the board so the level scene feels alive:
   * two counter-rotating halos, drifting motes and breathing glow spots.
   * Rebuilt per level size; kept outside the board and never occluding tiles.
   */
  private buildAmbient(w: number, d: number): void {
    this.clearAmbient();
    const group = new THREE.Group();
    group.name = "ambient";
    const reach = Math.max(w, d);

    // two counter-rotating halos (blue / purple, very low contrast)
    const halos = [
      { color: "#4c9aff", radius: reach * 0.62, width: 9, opacity: 0.16, spin: 0.06 },
      { color: "#a55cff", radius: reach * 0.78, width: 7, opacity: 0.12, spin: -0.045 },
    ];
    for (const h of halos) {
      const mat = new THREE.MeshBasicMaterial({
        map: haloTexture(h.color, h.width),
        transparent: true,
        opacity: h.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h.radius * 2.35, h.radius * 2.35), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = Math.random() * Math.PI;
      mesh.position.y = -0.06;
      mesh.renderOrder = -3;
      mesh.userData.spin = h.spin;
      group.add(mesh);
      this.ambientHalos.push(mesh);
    }

    // drifting motes scattered in a band around the board
    const count = 90;
    const positions = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const wx = w / reach + 0.15;
    const wz = d / reach + 0.15;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = reach * (0.5 + Math.random() * 0.45);
      const x = Math.cos(angle) * radius * wx;
      const z = Math.sin(angle) * radius * wz;
      const y = -0.05 + Math.random() * 0.1;
      positions[i * 3] = base[i * 3] = x;
      positions[i * 3 + 1] = base[i * 3 + 1] = y;
      positions[i * 3 + 2] = base[i * 3 + 2] = z;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: moteTexture(),
        color: 0xbfd4ff,
        size: 5,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      })
    );
    points.renderOrder = -2;
    points.userData.phases = phases;
    group.add(points);
    this.ambientParticles = points;
    this.ambientParticleBase = base;

    // breathing glow spots tucked around the edges / corners
    const glowColors = ["#4ce0d2", "#a55cff", "#4c9aff", "#4ce0d2", "#a55cff", "#4c9aff"];
    const spots: Array<[number, number]> = [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, -1],
      [0, 1],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [sx, sz] = spots[i];
      const size = reach * (0.34 + Math.random() * 0.16);
      const mat = new THREE.MeshBasicMaterial({
        map: glowTexture(glowColors[i % glowColors.length]),
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(sx * (w / 2) * 1.28, -0.05, sz * (d / 2) * 1.28);
      mesh.renderOrder = -4;
      group.add(mesh);
      this.ambientGlows.push({ mesh, base: 0.16, phase: Math.random() * Math.PI * 2, speed: 0.4 + Math.random() * 0.35 });
    }

    this.boardRoot.add(group);
    this.ambient = group;
  }

  private updateAmbient(dt: number): void {
    if (!this.ambient) return;
    this.ambientTime += dt;
    const t = this.ambientTime;
    for (const h of this.ambientHalos) h.rotation.z += dt * ((h.userData.spin as number) ?? 0);

    const points = this.ambientParticles;
    const base = this.ambientParticleBase;
    if (points && base) {
      const attr = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const phases = points.userData.phases as Float32Array;
      for (let i = 0; i < phases.length; i++) {
        arr[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.6 + phases[i]) * 0.08;
      }
      attr.needsUpdate = true;
      points.rotation.y = t * 0.02;
    }

    for (const g of this.ambientGlows) {
      const k = 0.5 + 0.5 * Math.sin(t * g.speed + g.phase);
      (g.mesh.material as THREE.MeshBasicMaterial).opacity = g.base * (0.55 + 0.45 * k);
      g.mesh.scale.setScalar(0.92 + 0.16 * k);
    }
  }

  private clearAmbient(): void {
    if (this.ambient) {
      this.ambient.traverse((o) => {
        const obj = o as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        obj.geometry?.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
        for (const m of mats) {
          (m as THREE.MeshBasicMaterial).map?.dispose();
          m.dispose();
        }
      });
      this.boardRoot.remove(this.ambient);
    }
    this.ambient = null;
    this.ambientHalos = [];
    this.ambientParticles = null;
    this.ambientParticleBase = null;
    this.ambientGlows = [];
    this.ambientTime = 0;
  }

  /** Reserve extra world-space at the top of the view for the boss strip. */
  setBossStrip(worldUnits: number): void {
    this.bossStrip = Math.max(0, worldUnits);
    this.fitCamera(this.boardSize.cols, this.boardSize.rows);
  }

  private fitCamera(w: number, d: number): void {
    const aspect = (this.container.clientWidth || window.innerWidth) / (this.container.clientHeight || window.innerHeight);
    const portrait = aspect < 1;
    // safe band: leave room for the top HUD (wallet/stats/goals/boss) and the
    // bottom cluster (ultimate/items/toolbar)
    const topFrac = portrait ? 0.27 : 0.2;
    const botFrac = portrait ? 0.14 : 0.14;
    const bandFrac = Math.max(0.3, 1 - topFrac - botFrac);

    // largest board that fits BOTH the viewport width and the safe band height;
    // only shrink (zoom out) when the height band cannot hold it.
    // keep ~10% horizontal margin so the board never touches the screen edges.
    const widthFill = 0.9;
    const contentH = d + this.bossStrip + 0.4;
    const Hw = w / 2 / (widthFill * aspect);
    const Hh = contentH / 2 / bandFrac;
    const H = Math.max(Hw, Hh);
    // portrait: nudge the board slightly upward for a better vertical balance
    const lift = portrait ? 0.05 * (2 * H) : 0;
    const center = this.bossStrip / 2 - (botFrac - topFrac) * H - lift;
    const top = center + H;
    const bottom = center - H;
    const hw = H * aspect;

    this.camera.left = -hw;
    this.camera.right = hw;
    this.camera.top = top;
    this.camera.bottom = bottom;
    // Pure top-down view: look straight down -Y, with board -Z as screen-up.
    this.camera.position.set(0, 60, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.updateProjectionMatrix();
  }

  onResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.fitCamera(this.boardSize.cols, this.boardSize.rows);
  }

  /** Screen coords -> board-local (x,z) on the y=0 plane, or null. */
  screenToBoard(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const point = new THREE.Vector3();
    const ok = this.raycaster.ray.intersectPlane(this.boardPlane, point);
    if (!ok) return null;
    return { x: point.x, z: point.z };
  }

  setFrameCallback(cb: (dt: number) => void): void {
    this.onFrame = cb;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      this.tweens.update(dt);
      this.updateAmbient(dt);
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose(): void {
    this.stop();
    this.renderer.dispose();
  }
}

// ── procedural board grid (checker + lines), sized to the board ──
const gridCache = new Map<string, THREE.CanvasTexture>();
function boardGridTexture(rows: number, cols: number, usable?: boolean[]): THREE.CanvasTexture {
  const key = `${rows}x${cols}:${usable ? usable.map((u) => (u ? 1 : 0)).join("") : "all"}`;
  const hit = gridCache.get(key);
  if (hit) return hit;
  const CELL = 64;
  const c = document.createElement("canvas");
  c.width = cols * CELL;
  c.height = rows * CELL;
  const g = c.getContext("2d")!;
  const ok = (r: number, col: number): boolean =>
    r >= 0 && r < rows && col >= 0 && col < cols && (!usable || usable[r * cols + col] === true);

  // interleaved checker cells (only where a tile can actually sit)
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (!ok(r, col)) continue;
      if ((r + col) % 2 === 0) {
        g.fillStyle = "rgba(255,255,255,0.045)";
        g.fillRect(col * CELL, r * CELL, CELL, CELL);
      }
    }
  }
  // grid lines: only along edges shared between usable cells
  g.strokeStyle = "rgba(255,255,255,0.075)";
  g.lineWidth = 2;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (!ok(r, col)) continue;
      const x = col * CELL;
      const y = r * CELL;
      if (!ok(r, col - 1)) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + CELL);
        g.stroke();
      }
      if (!ok(r, col + 1)) {
        g.beginPath();
        g.moveTo(x + CELL, y);
        g.lineTo(x + CELL, y + CELL);
        g.stroke();
      }
      if (!ok(r - 1, col)) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + CELL, y);
        g.stroke();
      }
      if (!ok(r + 1, col)) {
        g.beginPath();
        g.moveTo(x, y + CELL);
        g.lineTo(x + CELL, y + CELL);
        g.stroke();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  gridCache.set(key, tex);
  return tex;
}

// ── ambient textures: dashed halo ring, soft glow, round mote ──
function haloTexture(color: string, lineWidth: number): THREE.CanvasTexture {
  const size = 512;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.translate(size / 2, size / 2);
  g.strokeStyle = color;
  g.lineWidth = lineWidth;
  g.lineCap = "round";
  g.shadowColor = color;
  g.shadowBlur = 18;
  const radius = size * 0.42;
  const dashes = 72;
  for (let i = 0; i < dashes; i++) {
    const a0 = (i / dashes) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / dashes) * 0.45;
    g.beginPath();
    g.arc(0, 0, radius, a0, a1);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(color: string): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moteTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
