/**
 * Flat-drawn element tiles (variant design): elements are 2D canvas sprites so
 * they read clearly as "clearable symbols", distinct from 3D blockers.
 * Silhouettes keep the shape grammar (§5.4.1); faces stay minimal (dot eyes +
 * simple mouth) to preserve the simple style.
 */
import * as THREE from "three";
import { TILE_PALETTE, tileColor } from "./Palette.js";

const textureCache = new Map<number, THREE.CanvasTexture>();
const TEX = 256;

type Shape = "roundedBox" | "sphere" | "icosa" | "octa" | "cylinder" | "hexPrism" | "flattenedBlob" | string;

function shapePath(g: CanvasRenderingContext2D, shape: Shape, cx: number, cy: number, r: number): void {
  g.beginPath();
  switch (shape) {
    case "roundedBox": {
      const s = r * 0.86;
      const k = s * 0.32;
      g.moveTo(cx - s + k, cy - s);
      g.arcTo(cx + s, cy - s, cx + s, cy + s, k);
      g.arcTo(cx + s, cy + s, cx - s, cy + s, k);
      g.arcTo(cx - s, cy + s, cx - s, cy - s, k);
      g.arcTo(cx - s, cy - s, cx + s, cy - s, k);
      g.closePath();
      break;
    }
    case "icosa":
    case "hexPrism": {
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.closePath();
      break;
    }
    case "octa": {
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r * 0.82, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r * 0.82, cy);
      g.closePath();
      break;
    }
    case "flattenedBlob": {
      g.ellipse(cx, cy, r * 1.06, r * 0.72, 0, 0, Math.PI * 2);
      break;
    }
    default: // sphere / cylinder (top view = circle)
      g.arc(cx, cy, r, 0, Math.PI * 2);
  }
}

function drawFace(g: CanvasRenderingContext2D, tileType: number, cx: number, cy: number, r: number): void {
  const ink = "rgba(16,16,24,0.92)";
  const eyeR = r * 0.16;
  const eyeDX = r * 0.34;
  const eyeY = cy - r * 0.06;
  const mouthY = cy + r * 0.4;

  const dot = (x: number): void => {
    g.fillStyle = ink;
    g.beginPath();
    g.arc(x, eyeY, eyeR, 0, Math.PI * 2);
    g.fill();
    // tiny highlight
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath();
    g.arc(x - eyeR * 0.3, eyeY - eyeR * 0.35, eyeR * 0.32, 0, Math.PI * 2);
    g.fill();
  };
  const closedEye = (x: number): void => {
    g.strokeStyle = ink;
    g.lineWidth = r * 0.075;
    g.lineCap = "round";
    g.beginPath();
    g.arc(x, eyeY + eyeR * 0.4, eyeR * 0.9, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  };
  const arcMouth = (up: boolean, w: number): void => {
    g.strokeStyle = ink;
    g.lineWidth = r * 0.08;
    g.lineCap = "round";
    g.beginPath();
    if (up) g.arc(cx, mouthY - r * 0.12, w, Math.PI * 0.15, Math.PI * 0.85);
    else g.arc(cx, mouthY - r * 0.28, w, Math.PI * 1.15, Math.PI * 1.85);
    g.stroke();
  };

  switch (tileType) {
    case 1: // happy
      dot(cx - eyeDX);
      dot(cx + eyeDX);
      arcMouth(false, r * 0.34);
      break;
    case 2: // surprised
      dot(cx - eyeDX);
      dot(cx + eyeDX);
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(cx, mouthY, r * 0.14, r * 0.18, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 3: // sleepy
      closedEye(cx - eyeDX);
      closedEye(cx + eyeDX);
      g.fillStyle = ink;
      g.beginPath();
      g.ellipse(cx, mouthY, r * 0.08, r * 0.1, 0, 0, Math.PI * 2);
      g.fill();
      break;
    case 4: // angry
      dot(cx - eyeDX);
      dot(cx + eyeDX);
      g.strokeStyle = ink;
      g.lineWidth = r * 0.07;
      g.lineCap = "round";
      for (const sx of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + sx * (eyeDX - r * 0.17), eyeY - r * 0.4);
        g.lineTo(cx + sx * (eyeDX + r * 0.17), eyeY - r * 0.26);
        g.stroke();
      }
      arcMouth(true, r * 0.3);
      break;
    case 5: // wink
      dot(cx - eyeDX);
      closedEye(cx + eyeDX);
      arcMouth(false, r * 0.34);
      break;
    case 6: // grin
      dot(cx - eyeDX);
      dot(cx + eyeDX);
      arcMouth(false, r * 0.42);
      break;
    default: // mud / inert
      closedEye(cx - eyeDX);
      closedEye(cx + eyeDX);
      g.strokeStyle = ink;
      g.lineWidth = r * 0.06;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(cx - r * 0.14, mouthY);
      g.lineTo(cx + r * 0.14, mouthY);
      g.stroke();
      break;
  }
}

function makeTexture(tileType: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = TEX;
  c.height = TEX;
  const g = c.getContext("2d")!;
  const cx = TEX / 2;
  const cy = TEX / 2;
  const r = TEX * 0.4;
  const col = tileColor(tileType);
  const shape = (TILE_PALETTE[tileType]?.shape ?? "sphere") as Shape;

  // soft contact shadow inside the sprite so it doesn't float
  g.save();
  g.shadowColor = "rgba(0,0,0,0.35)";
  g.shadowBlur = TEX * 0.06;
  g.shadowOffsetY = TEX * 0.025;
  g.fillStyle = "rgba(0,0,0,0.9)";
  shapePath(g, shape, cx, cy, r);
  g.fill();
  g.restore();

  // body with a gentle top-lit gradient
  const grad = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.15, cx, cy, r * 1.15);
  grad.addColorStop(0, lightenHex(col.main, 0.28));
  grad.addColorStop(0.65, col.main);
  grad.addColorStop(1, col.dark);
  g.fillStyle = grad;
  shapePath(g, shape, cx, cy, r);
  g.fill();

  // crisp rim
  g.strokeStyle = col.dark;
  g.lineWidth = TEX * 0.018;
  shapePath(g, shape, cx, cy, r);
  g.stroke();

  drawFace(g, tileType, cx, cy, r);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function lightenHex(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

export function makeFaceObject(tileType: number): THREE.Group {
  const group = new THREE.Group();
  let tex = textureCache.get(tileType);
  if (!tex) {
    tex = makeTexture(tileType);
    textureCache.set(tileType, tex);
  }
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      // coplanar sprites must NOT write depth or they z-fight/flicker on swap
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  plane.rotation.x = -Math.PI / 2; // lie flat on the board, face up
  plane.position.y = 0.02;
  plane.userData.isFlatSprite = true;
  group.userData.isFlatSprite = true;
  group.add(plane);
  return group;
}
