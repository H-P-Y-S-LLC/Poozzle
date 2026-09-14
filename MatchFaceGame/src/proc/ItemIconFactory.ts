/**
 * Item icons rendered from small procedural three.js models (real 3/4-lit
 * miniatures), rasterized offscreen once and cached as data URLs.
 * Spec: §5.7 procedural icons, zero external assets.
 */
import * as THREE from "three";

const cache = new Map<string, string>();

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;

function ensureStage(): void {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(160, 160);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x30364a, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.7);
  rim.position.set(-2.5, 1, -2);
  scene.add(rim);

  camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(1.9, 1.7, 3.1);
  camera.lookAt(0, 0, 0);
}

function mat(color: number, rough = 0.45, metal = 0.15): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

/** Build the item model; roughly unit-sized, auto-framed later. */
export function buildItemModel(id: string): THREE.Group {
  const g = new THREE.Group();
  switch (id) {
    case "hammer": {
      const steel = mat(0xb9c2d0, 0.32, 0.85);
      const wood = mat(0x8a5a2b, 0.7, 0.05);
      const dark = mat(0x6e7580, 0.4, 0.8);
      // head: main block + striking face + claw wedge
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.42, 0.44), steel, 0, 0.62, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 20), dark, 0.52, 0.62, 0));
      (g.children[g.children.length - 1] as THREE.Mesh).rotation.z = Math.PI / 2;
      const claw = mesh(new THREE.ConeGeometry(0.26, 0.5, 4), steel, -0.62, 0.7, 0);
      claw.rotation.z = Math.PI / 2.4;
      g.add(claw);
      // handle
      const handle = mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 14), wood, -0.06, -0.35, 0);
      handle.rotation.z = 0.12;
      g.add(handle);
      break;
    }
    case "rocket": {
      const body = mat(0xe8ecf2, 0.35, 0.5);
      const red = mat(0xd8433b, 0.4, 0.2);
      const flame = new THREE.MeshStandardMaterial({
        color: 0xffa02e,
        emissive: 0xff7a00,
        emissiveIntensity: 1.6,
        roughness: 0.5,
      });
      g.add(mesh(new THREE.CylinderGeometry(0.27, 0.27, 1.05, 20), body, 0, 0.1, 0));
      g.add(mesh(new THREE.ConeGeometry(0.27, 0.52, 20), red, 0, 0.9, 0));
      // window
      g.add(mesh(new THREE.SphereGeometry(0.11, 14, 12), mat(0x63c8ff, 0.15, 0.3), 0, 0.28, 0.24));
      // fins
      for (let i = 0; i < 3; i++) {
        const fin = mesh(new THREE.BoxGeometry(0.07, 0.42, 0.3), red, 0, -0.38, 0);
        fin.rotation.y = (i / 3) * Math.PI * 2;
        fin.translateZ(0.28);
        g.add(fin);
      }
      // exhaust nozzle + flame
      g.add(mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.18, 16), mat(0x545b66, 0.4, 0.7), 0, -0.52, 0));
      g.add(mesh(new THREE.ConeGeometry(0.17, 0.5, 14), flame, 0, -0.85, 0));
      (g.children[g.children.length - 1] as THREE.Mesh).rotation.x = Math.PI;
      break;
    }
    case "shuffle": {
      const cyan = mat(0x37d6c2, 0.35, 0.3);
      const arcGeo = new THREE.TorusGeometry(0.62, 0.1, 12, 40, Math.PI * 1.1);
      const top = mesh(arcGeo, cyan, 0, 0.22, 0);
      top.rotation.z = Math.PI * 0.95;
      g.add(top);
      const bottom = mesh(arcGeo.clone(), cyan, 0, -0.22, 0);
      bottom.rotation.z = Math.PI * 1.95;
      g.add(bottom);
      // arrow heads at the arc ends
      const head1 = mesh(new THREE.ConeGeometry(0.2, 0.42, 12), cyan, 0.62, 0.38, 0);
      head1.rotation.z = -Math.PI / 2;
      g.add(head1);
      const head2 = mesh(new THREE.ConeGeometry(0.2, 0.42, 12), cyan, -0.62, -0.38, 0);
      head2.rotation.z = Math.PI / 2;
      g.add(head2);
      break;
    }
    case "glove": {
      const blue = mat(0x3f8fe8, 0.5, 0.1);
      const darker = mat(0x2f6cb8, 0.55, 0.1);
      // palm
      g.add(mesh(new THREE.BoxGeometry(0.62, 0.72, 0.3), blue, 0, -0.1, 0));
      // fingers
      for (let i = 0; i < 4; i++) {
        const finger = mesh(new THREE.CapsuleGeometry(0.095, 0.34, 6, 12), blue, -0.225 + i * 0.15, 0.42, 0);
        g.add(finger);
      }
      // thumb
      const thumb = mesh(new THREE.CapsuleGeometry(0.11, 0.3, 6, 12), blue, 0.42, -0.05, 0.05);
      thumb.rotation.z = -0.9;
      g.add(thumb);
      // cuff
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.22, 0.36), darker, 0, -0.56, 0));
      break;
    }
    case "finger": {
      const purple = mat(0xa05ce8, 0.5, 0.1);
      const skin = mat(0xc9a0ff, 0.55, 0.05);
      // palm
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.66, 0.28), purple, 0, -0.18, 0));
      // pointing index finger
      g.add(mesh(new THREE.CapsuleGeometry(0.1, 0.62, 6, 12), skin, -0.14, 0.5, 0));
      // folded fingers
      for (let i = 0; i < 3; i++) {
        const folded = mesh(new THREE.CapsuleGeometry(0.09, 0.16, 6, 12), skin, 0.02 + i * 0.16, 0.2, 0.08);
        folded.rotation.x = Math.PI / 2.4;
        g.add(folded);
      }
      // thumb across
      const thumb = mesh(new THREE.CapsuleGeometry(0.1, 0.26, 6, 12), skin, 0.34, -0.1, 0.06);
      thumb.rotation.z = -1.2;
      g.add(thumb);
      // cuff
      g.add(mesh(new THREE.BoxGeometry(0.66, 0.2, 0.34), mat(0x6f3fb0, 0.55, 0.1), 0, -0.58, 0));
      break;
    }
    default: {
      g.add(mesh(new THREE.SphereGeometry(0.6, 20, 16), mat(0xc8ccd8)));
    }
  }
  return g;
}

/** Render one item to a transparent data URL (cached). */
export function itemIconDataURL(id: string, _size = 40, disabled = false): string {
  const key = `${id}:${disabled ? "u" : "n"}`;
  const hit = cache.get(key);
  if (hit) return hit;

  ensureStage();
  if (!renderer || !scene || !camera) return "";

  const group = buildItemModel(id);
  // gentle 3/4 turn so the miniatures read as modeled, not flat
  group.rotation.set(0.42, 0.62, 0);

  // frame: fit bounding sphere
  const box = new THREE.Box3().setFromObject(group);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const scale = 1.55 / Math.max(0.001, sphere.radius);
  group.scale.setScalar(scale);
  const center = sphere.center.clone().multiplyScalar(scale);
  group.position.set(-center.x, -center.y, -center.z);
  scene.add(group);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(group);

  let final = url;
  if (disabled) {
    // desaturate + dim for the unavailable state (canvas->canvas is synchronous)
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.filter = "grayscale(1) brightness(0.75)";
      ctx.drawImage(renderer.domElement, 0, 0);
      final = c.toDataURL("image/png");
    }
  }
  cache.set(key, final);
  return final;
}
