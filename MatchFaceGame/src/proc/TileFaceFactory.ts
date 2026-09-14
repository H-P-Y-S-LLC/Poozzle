/**
 * Element tiles — "glowing retro pixel" style.
 * Drawn on a 20×20 pixel grid, upscaled with nearest-neighbour and a soft halo.
 * Flat sprite (plane), same as before, so it stays distinct from 3D blockers.
 */
import * as THREE from "three";
import { TILE_PALETTE, tileColor } from "./Palette.js";
import { pixelCanvas, pixelTexture, pixelGlowCanvas, mixHex, type Px } from "./pixel.js";

const S = 20;
const texCache = new Map<number, THREE.CanvasTexture>();

type Shape = string;

function inShape(shape: Shape, x: number, y: number): boolean {
  const cx = (S - 1) / 2;
  const cy = (S - 1) / 2;
  const dx = (x - cx) / 1;
  const dy = (y - cy) / 1;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  switch (shape) {
    case "roundedBox": {
      // gumdrop / dome: round bottom, tapered top (clearly not a square)
      const r = 8.4;
      if (dy >= 0) return ax * ax + dy * dy <= r * r;
      const taper = 1 - (-dy / r) * 0.6;
      return ax <= r * taper && -dy <= r * 1.05;
    }
    case "icosa": {
      // pointy-top hexagon
      const hx = 8.6;
      const hy = 8;
      return ay <= hy && ax <= hx * (1 - (ay / hy) * 0.5);
    }
    case "hexPrism":
      // wide bean / oval
      return (ax / 9.2) ** 2 + (ay / 6.8) ** 2 <= 1;
    case "octa":
      return ax / 8.8 + ay / 8.8 <= 1;
    case "cylinder": {
      // teardrop / droplet
      const r = 8.4;
      if (dy < 0) return ax <= r * (1 - (-dy / r) * 0.85) && -dy <= r * 1.05;
      return dx * dx + dy * dy <= r * r;
    }
    case "flattenedBlob":
      // irregular pebble (deterministic notches)
      return (ax / 8.8) ** 2 + (ay / 6.8) ** 2 <= 1 - (((x * 7 + y * 13) % 5) === 0 ? 0.12 : 0);
    default:
      return dx * dx + dy * dy <= 8.8 * 8.8; // sphere
  }
}

function drawBase(px: Px, tileType: number): void {
  const col = tileColor(tileType);
  const shape = (TILE_PALETTE[tileType]?.shape ?? "sphere") as Shape;
  const light = mixHex(col.main, 0.35);
  const mid = col.main;
  const dark = col.dark;
  const outline = mixHex(col.dark, -0.45);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (!inShape(shape, x, y)) continue;
      // 1px dark outline where a neighbour is outside the shape
      const edge =
        !inShape(shape, x - 1, y) || !inShape(shape, x + 1, y) || !inShape(shape, x, y - 1) || !inShape(shape, x, y + 1);
      if (edge) {
        px(x, y, 1, 1, outline);
        continue;
      }
      const t = y / (S - 1);
      px(x, y, 1, 1, t < 0.34 ? light : t < 0.72 ? mid : dark);
    }
  }
}

function drawFace(px: Px, tileType: number, blink = false): void {
  const ink = "#151820";
  const eyeL = 6;
  const eyeR = 13;
  const eyeY = 7;
  const eye = (x: number, closed = false): void => {
    if (closed || blink) {
      px(x - 1, eyeY + 1, 3, 1, ink);
      return;
    }
    px(x, eyeY, 2, 2, ink);
    px(x, eyeY, 1, 1, "#ffffff");
  };
  const smile = (wide: boolean): void => {
    const w = wide ? 7 : 5;
    const x0 = Math.round((S - w) / 2);
    const y = 13;
    px(x0, y, 1, 1, ink);
    px(x0 + w - 1, y, 1, 1, ink);
    px(x0 + 1, y + 1, w - 2, 1, ink);
    if (wide) px(x0 + 1, y, w - 2, 1, "#ffffff"); // tooth row
  };

  switch (tileType) {
    case 1: // happy
      eye(eyeL);
      eye(eyeR);
      smile(true);
      break;
    case 2: // surprised
      eye(eyeL);
      eye(eyeR);
      px(9, 13, 2, 2, ink);
      px(9, 13, 1, 1, "#ffffff");
      break;
    case 3: // sleepy
      eye(eyeL, true);
      eye(eyeR, true);
      px(9, 14, 2, 1, ink);
      break;
    case 4: // angry
      eye(eyeL);
      eye(eyeR);
      px(eyeL, eyeY - 2, 3, 1, ink);
      px(eyeR - 1, eyeY - 2, 3, 1, ink);
      px(7, 14, 6, 1, ink);
      px(7, 13, 1, 1, ink);
      px(12, 13, 1, 1, ink);
      break;
    case 5: // wink
      eye(eyeL);
      eye(eyeR, true);
      smile(false);
      break;
    case 6: // grin
      eye(eyeL);
      eye(eyeR);
      smile(true);
      break;
    default: // mud / inert
      eye(eyeL, true);
      eye(eyeR, true);
      px(8, 14, 4, 1, ink);
      break;
  }
}

function texture(tileType: number, blink = false): THREE.CanvasTexture {
  const key = tileType + (blink ? 1000 : 0);
  let t = texCache.get(key);
  if (t) return t;
  const art = pixelCanvas(S, (px) => {
    drawBase(px, tileType);
    drawFace(px, tileType, blink);
  });
  t = pixelTexture(art, "", 12);
  texCache.set(key, t);
  return t;
}

/** Eyes-closed frame used for the random blink animation. */
export function elementBlinkTexture(tileType: number): THREE.CanvasTexture {
  return texture(tileType, true);
}

/** Native-aspect pixel art canvas for HUD icons (upscaled, no glow). */
export function elementIconCanvas(tileType: number, scale = 8): HTMLCanvasElement {
  const art = pixelCanvas(S, (px) => {
    drawBase(px, tileType);
    drawFace(px, tileType);
  });
  return pixelGlowCanvas(art, scale, "");
}

export function makeFaceObject(tileType: number): THREE.Group {
  const group = new THREE.Group();
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: texture(tileType),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.02;
  plane.userData.isFlatSprite = true;
  group.userData.isFlatSprite = true;
  group.userData.blinkMat = plane.material;
  // random blinking state per tile
  group.userData.blink = {
    open: texture(tileType, false),
    closed: elementBlinkTexture(tileType),
    nextAt: performance.now() + 1500 + Math.random() * 5000,
    until: 0,
  };
  group.add(plane);
  return group;
}
