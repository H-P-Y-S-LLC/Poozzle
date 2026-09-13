/**
 * Renders element faces to small data-URL icons for the DOM HUD (goal chips),
 * so the goal uses the exact same 3D look as the board elements.
 */
import * as THREE from "three";
import { makeFaceObject } from "./TileFaceFactory.js";

interface Setup {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
}

let setup: Setup | null = null;
const cache = new Map<number, string>();

function ensureSetup(): Setup {
  if (setup) return setup;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(72, 72);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(2, 3, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fbcff, 0.6);
  rim.position.set(-2, 1.5, -2);
  scene.add(rim);

  const camera = new THREE.OrthographicCamera(-0.8, 0.8, 0.8, -0.8, 0.1, 30);
  camera.position.set(0, 2.4, 1.75);
  camera.lookAt(0, 0.15, 0);
  camera.updateProjectionMatrix();

  setup = { renderer, scene, camera };
  return setup;
}

export function elementIconDataURL(tileType: number): string {
  const cached = cache.get(tileType);
  if (cached) return cached;
  const { renderer, scene, camera } = ensureSetup();
  const obj = makeFaceObject(tileType);
  scene.add(obj);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(obj);
  cache.set(tileType, url);
  return url;
}
