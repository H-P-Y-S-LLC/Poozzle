/**
 * Three.js scene root: renderer, orthographic camera, lighting, board frame.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.3.4.
 */
import * as THREE from "three";
import { TweenManager } from "../core/Tween.js";
import { boardFrameMaterial, floorMaterial } from "../proc/MaterialFactory.js";

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
  private readonly boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();

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
  layoutBoard(rows: number, cols: number, cellSize = 1): void {
    this.boardSize = { rows, cols };
    // clear previous frame
    for (const child of [...this.boardRoot.children]) {
      if (child.name === "floor" || child.name === "frame") this.boardRoot.remove(child);
    }
    const w = cols * cellSize;
    const d = rows * cellSize;

    const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.6, d + 1), floorMaterial());
    floor.name = "floor";
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    this.boardRoot.add(floor);

    const frameGeo = new THREE.BoxGeometry(w + 1.5, 0.25, d + 1.5);
    const frame = new THREE.Mesh(frameGeo, boardFrameMaterial());
    frame.name = "frame";
    frame.position.y = -0.9;
    frame.receiveShadow = true;
    this.boardRoot.add(frame);

    this.fitCamera(w, d);
  }

  private fitCamera(w: number, d: number): void {
    const aspect = (this.container.clientWidth || window.innerWidth) / (this.container.clientHeight || window.innerHeight);
    const marginX = 1.35;
    const marginY = 1.5; // extra room for HUD bars top/bottom
    let halfH = (d / 2) * marginY;
    let halfW = (w / 2) * marginX;
    if (halfW / halfH < aspect) halfW = halfH * aspect;
    else halfH = halfW / aspect;

    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
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
