/**
 * Flat-drawn blocker sprites (variant design): blockers are 2D canvas icons in
 * a matte, desaturated "object" palette (no face, no glow) so they read as
 * physical obstacles, distinct from candy elements and glowing specials.
 * Contact shadow is baked into the sprite; materials don't write depth so
 * coplanar tiles never flicker during swaps.
 */
import * as THREE from "three";

let glowTex: THREE.CanvasTexture | null = null;
function bottomGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const s = 128;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(s / 2, s / 2, 4, s / 2, s / 2, s / 2);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.72, "rgba(255,255,255,0.22)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const TEX = 256;
const cache = new Map<number, THREE.CanvasTexture>();

const INK = "rgba(24,26,36,0.9)";
const LINE = 5;

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function poly(g: CanvasRenderingContext2D, pts: Array<[number, number]>): void {
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
  g.closePath();
}
function spokeWheel(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  g.strokeStyle = color;
  g.lineWidth = LINE * 1.6;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = LINE * 1.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.stroke();
  }
}

function draw(g: CanvasRenderingContext2D, type: number, cx: number, cy: number, r: number): void {
  g.lineJoin = "round";
  g.lineCap = "round";
  switch (type) {
    case 1: {
      // valve: pipes + red wheel
      g.fillStyle = "#8b94a6";
      rr(g, cx - r * 0.9, cy - r * 0.22, r * 1.8, r * 0.44, r * 0.12);
      g.fill();
      rr(g, cx - r * 0.22, cy - r * 0.85, r * 0.44, r * 0.7, r * 0.1);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.9, cy - r * 0.22, r * 1.8, r * 0.44, r * 0.12);
      g.stroke();
      spokeWheel(g, cx, cy - r * 0.45, r * 0.42, "#e0563f");
      break;
    }
    case 2: {
      // cracked floor
      g.fillStyle = "#5b6070";
      rr(g, cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, r * 0.14);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, r * 0.14);
      g.stroke();
      g.strokeStyle = "#2f333d";
      g.lineWidth = LINE * 1.3;
      g.beginPath();
      g.moveTo(cx - r * 0.5, cy - r * 0.5);
      g.lineTo(cx - r * 0.05, cy - r * 0.05);
      g.lineTo(cx - r * 0.35, cy + r * 0.45);
      g.moveTo(cx + r * 0.45, cy - r * 0.2);
      g.lineTo(cx - r * 0.05, cy - r * 0.05);
      g.stroke();
      break;
    }
    case 3: {
      // bulb: glass + filament + screw base
      g.fillStyle = "#fff2b8";
      g.beginPath();
      g.arc(cx, cy - r * 0.28, r * 0.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.strokeStyle = "#c9922e";
      g.lineWidth = LINE;
      g.beginPath();
      g.moveTo(cx - r * 0.22, cy + r * 0.02);
      g.lineTo(cx - r * 0.06, cy - r * 0.32);
      g.lineTo(cx + r * 0.08, cy + r * 0.02);
      g.stroke();
      g.fillStyle = "#9aa1ad";
      rr(g, cx - r * 0.34, cy + r * 0.28, r * 0.68, r * 0.5, r * 0.1);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.34, cy + r * 0.28, r * 0.68, r * 0.5, r * 0.1);
      g.stroke();
      break;
    }
    case 4: {
      // paper ball: spiky pale polygon
      const pts: Array<[number, number]> = [];
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rad = r * (i % 2 ? 0.68 : 0.92);
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
      g.fillStyle = "#e6eaf2";
      poly(g, pts);
      g.fill();
      g.strokeStyle = "#9aa2b2";
      g.lineWidth = LINE;
      g.stroke();
      g.strokeStyle = "#c3c9d6";
      g.lineWidth = LINE;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(cx - r * 0.4 + i * r * 0.35, cy - r * 0.3);
        g.lineTo(cx - r * 0.1 + i * r * 0.35, cy + r * 0.35);
        g.stroke();
      }
      break;
    }
    case 5: {
      // germ: green sphere + spikes
      g.fillStyle = "#7fd08a";
      g.beginPath();
      g.arc(cx, cy, r * 0.6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55);
        g.lineTo(cx + Math.cos(a) * r * 0.88, cy + Math.sin(a) * r * 0.88);
        g.stroke();
      }
      break;
    }
    case 6: {
      // mold: dome + spots
      g.fillStyle = "#9a7bd0";
      g.beginPath();
      g.ellipse(cx, cy + r * 0.1, r * 0.72, r * 0.6, 0, Math.PI, 0);
      g.fill();
      g.closePath();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.beginPath();
      g.ellipse(cx, cy + r * 0.1, r * 0.72, r * 0.6, 0, Math.PI, 0);
      g.stroke();
      g.fillStyle = "#c9b4ee";
      for (const [dx, dy] of [[-0.3, -0.05], [0.1, -0.25], [0.35, 0.0]]) {
        g.beginPath();
        g.arc(cx + dx * r, cy + dy * r, r * 0.12, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 7: {
      // spore: yellow-green spiky ball
      g.fillStyle = "#c6d24a";
      g.beginPath();
      g.arc(cx, cy, r * 0.58, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.2;
        g.beginPath();
        g.arc(cx + Math.cos(a) * r * 0.72, cy + Math.sin(a) * r * 0.72, r * 0.16, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      }
      break;
    }
    case 8: {
      // corrosion: dark blotch with holes
      g.fillStyle = "#5a6b3a";
      g.beginPath();
      g.ellipse(cx, cy, r * 0.82, r * 0.68, 0.2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "#232a1a";
      for (const [dx, dy, s] of [[-0.25, -0.1, 0.18], [0.2, 0.15, 0.22], [0.05, -0.3, 0.12]]) {
        g.beginPath();
        g.arc(cx + dx * r, cy + dy * r, r * s, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 9: {
      // soap bar + bubbles
      g.fillStyle = "#bfe3ff";
      rr(g, cx - r * 0.75, cy - r * 0.4, r * 1.5, r * 0.8, r * 0.3);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.75, cy - r * 0.4, r * 1.5, r * 0.8, r * 0.3);
      g.stroke();
      g.strokeStyle = "#7fb6e0";
      for (const [dx, dy, s] of [[0.55, -0.55, 0.16], [0.75, -0.2, 0.1]]) {
        g.beginPath();
        g.arc(cx + dx * r, cy + dy * r, r * s, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case 10: {
      // eye
      g.fillStyle = "#f4f6fb";
      g.beginPath();
      g.ellipse(cx, cy, r * 0.85, r * 0.55, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "#4c9aff";
      g.beginPath();
      g.arc(cx, cy, r * 0.36, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#141726";
      g.beginPath();
      g.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 11: {
      // nose
      g.fillStyle = "#e8b98f";
      g.beginPath();
      g.moveTo(cx, cy - r * 0.7);
      g.quadraticCurveTo(cx + r * 0.6, cy + r * 0.2, cx + r * 0.35, cy + r * 0.62);
      g.quadraticCurveTo(cx, cy + r * 0.9, cx - r * 0.35, cy + r * 0.62);
      g.quadraticCurveTo(cx - r * 0.6, cy + r * 0.2, cx, cy - r * 0.7);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "#a9764f";
      g.beginPath();
      g.ellipse(cx - r * 0.22, cy + r * 0.42, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
      g.ellipse(cx + r * 0.22, cy + r * 0.42, r * 0.1, r * 0.07, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 12: {
      // rubber duck
      g.fillStyle = "#ffd24a";
      g.beginPath();
      g.ellipse(cx, cy + r * 0.25, r * 0.7, r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(cx - r * 0.25, cy - r * 0.3, r * 0.4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.beginPath();
      g.ellipse(cx, cy + r * 0.25, r * 0.7, r * 0.5, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.arc(cx - r * 0.25, cy - r * 0.3, r * 0.4, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#ff9a2e";
      g.beginPath();
      g.moveTo(cx - r * 0.6, cy - r * 0.3);
      g.lineTo(cx - r * 0.95, cy - r * 0.2);
      g.lineTo(cx - r * 0.6, cy - r * 0.12);
      g.closePath();
      g.fill();
      g.fillStyle = "#22242e";
      g.beginPath();
      g.arc(cx - r * 0.35, cy - r * 0.4, r * 0.07, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 13: {
      // mouth (lips)
      g.fillStyle = "#e0708a";
      g.beginPath();
      g.moveTo(cx - r * 0.75, cy);
      g.quadraticCurveTo(cx, cy - r * 0.6, cx + r * 0.75, cy);
      g.quadraticCurveTo(cx, cy + r * 0.7, cx - r * 0.75, cy);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.strokeStyle = "#a94a60";
      g.beginPath();
      g.moveTo(cx - r * 0.6, cy);
      g.quadraticCurveTo(cx, cy + r * 0.06, cx + r * 0.6, cy);
      g.stroke();
      // teeth
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(cx - r * 0.5, cy);
      g.quadraticCurveTo(cx, cy - r * 0.4, cx + r * 0.5, cy);
      g.closePath();
      g.fill();
      break;
    }
    case 14: {
      // bathtub + feet
      g.fillStyle = "#eef2f8";
      rr(g, cx - r * 0.8, cy - r * 0.3, r * 1.6, r * 0.7, r * 0.22);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.8, cy - r * 0.3, r * 1.6, r * 0.7, r * 0.22);
      g.stroke();
      g.fillStyle = "#9aa3b2";
      for (const sx of [-1, 1]) {
        rr(g, cx + sx * r * 0.55 - r * 0.1, cy + r * 0.38, r * 0.2, r * 0.28, r * 0.06);
        g.fill();
      }
      g.fillStyle = "#bfe3ff";
      g.beginPath();
      g.ellipse(cx, cy - r * 0.3, r * 0.7, r * 0.14, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 15: {
      // puddle
      g.fillStyle = "#5fa8e8";
      g.beginPath();
      g.ellipse(cx, cy, r * 0.85, r * 0.5, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "rgba(255,255,255,0.6)";
      g.beginPath();
      g.ellipse(cx - r * 0.25, cy - r * 0.12, r * 0.22, r * 0.1, -0.3, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 16: {
      // insecticide spray can
      g.fillStyle = "#7f8a99";
      rr(g, cx - r * 0.35, cy - r * 0.35, r * 0.7, r * 1.15, r * 0.16);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.35, cy - r * 0.35, r * 0.7, r * 1.15, r * 0.16);
      g.stroke();
      g.fillStyle = "#c9d2de";
      rr(g, cx - r * 0.22, cy - r * 0.6, r * 0.44, r * 0.28, r * 0.08);
      g.fill();
      g.stroke();
      g.fillStyle = "#37c98a";
      rr(g, cx - r * 0.35, cy + r * 0.1, r * 0.7, r * 0.4, r * 0.08);
      g.fill();
      g.fillStyle = "#b9c6d6";
      for (const [dx, dy] of [[0.42, -0.5], [0.6, -0.3], [0.5, -0.1]]) {
        g.beginPath();
        g.arc(cx + dx * r, cy + dy * r, r * 0.06, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 17: {
      // blind box with ?
      g.fillStyle = "#d8a96a";
      rr(g, cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4, r * 0.1);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      rr(g, cx - r * 0.7, cy - r * 0.7, r * 1.4, r * 1.4, r * 0.1);
      g.stroke();
      g.strokeStyle = "#b07d3c";
      g.lineWidth = LINE * 1.4;
      g.beginPath();
      g.moveTo(cx, cy - r * 0.7);
      g.lineTo(cx, cy + r * 0.7);
      g.stroke();
      g.fillStyle = "#7a5322";
      g.font = `bold ${r * 0.9}px sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("?", cx - r * 0.32, cy);
      break;
    }
    case 18: {
      // drain grate
      g.fillStyle = "#9aa3b2";
      g.beginPath();
      g.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.strokeStyle = "#4a5160";
      g.lineWidth = LINE * 1.2;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(cx + i * r * 0.24, cy - r * 0.6);
        g.lineTo(cx + i * r * 0.24, cy + r * 0.6);
        g.stroke();
      }
      g.beginPath();
      g.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
      g.stroke();
      break;
    }
    case 19: {
      // roach
      g.fillStyle = "#7a4a24";
      g.beginPath();
      g.ellipse(cx, cy + r * 0.1, r * 0.4, r * 0.62, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.beginPath();
      g.arc(cx, cy - r * 0.5, r * 0.24, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = "#5a3618";
      g.lineWidth = LINE;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(cx + s * r * 0.28, cy - r * 0.2 + i * r * 0.28);
          g.lineTo(cx + s * r * 0.7, cy - r * 0.32 + i * r * 0.28);
          g.stroke();
        }
        g.beginPath();
        g.moveTo(cx + s * r * 0.1, cy - r * 0.62);
        g.lineTo(cx + s * r * 0.5, cy - r * 0.92);
        g.stroke();
      }
      break;
    }
    case 20: {
      // queen ant + crown
      g.fillStyle = "#5a3a52";
      for (const [dx, rr2] of [[0, 0.26], [0, -0.34], [0, -0.72]] as Array<[number, number]>) {
        g.beginPath();
        g.ellipse(cx + dx * r, cy + rr2 * r, r * 0.3, r * 0.26, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = LINE;
        g.stroke();
      }
      g.strokeStyle = "#3a2434";
      g.lineWidth = LINE;
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.moveTo(cx + s * r * 0.18, cy - r * 0.1 + i * r * 0.22);
          g.lineTo(cx + s * r * 0.6, cy - r * 0.22 + i * r * 0.22);
          g.stroke();
        }
      }
      g.fillStyle = "#ffd24a";
      poly(g, [
        [cx - r * 0.3, cy - r * 1.0],
        [cx - r * 0.15, cy - r * 1.3],
        [cx, cy - r * 1.05],
        [cx + r * 0.15, cy - r * 1.3],
        [cx + r * 0.3, cy - r * 1.0],
      ]);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      break;
    }
    case 21: {
      // dirt pile
      g.fillStyle = "#8a6a3f";
      g.beginPath();
      g.moveTo(cx - r * 0.85, cy + r * 0.6);
      g.quadraticCurveTo(cx, cy - r * 0.8, cx + r * 0.85, cy + r * 0.6);
      g.closePath();
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "#6b5030";
      for (const [dx, dy] of [[-0.3, 0.1], [0.15, 0.25], [0.35, -0.05]]) {
        g.beginPath();
        g.arc(cx + dx * r, cy + dy * r, r * 0.08, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 22: {
      // moss mushroom
      g.fillStyle = "#d4c9a8";
      rr(g, cx - r * 0.18, cy + r * 0.1, r * 0.36, r * 0.6, r * 0.1);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "#6fae54";
      g.beginPath();
      g.ellipse(cx, cy + r * 0.1, r * 0.75, r * 0.5, 0, Math.PI, 0);
      g.fill();
      g.beginPath();
      g.ellipse(cx, cy + r * 0.1, r * 0.75, r * 0.5, 0, Math.PI, 0);
      g.stroke();
      g.fillStyle = "#cfe6b8";
      for (const [dx, dy, s] of [[-0.3, -0.1, 0.1], [0.1, -0.3, 0.12], [0.35, -0.02, 0.09]]) {
        g.beginPath();
        g.arc(cx + dx * r, cy + dy * r, r * s, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    default: {
      // reward gear
      g.fillStyle = "#f0c33c";
      const teeth = 10;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < teeth * 2; i++) {
        const a = (i / (teeth * 2)) * Math.PI * 2;
        const rad = r * (i % 2 ? 0.62 : 0.86);
        pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
      }
      poly(g, pts);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = LINE;
      g.stroke();
      g.fillStyle = "#3a3320";
      g.beginPath();
      g.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
}

function makeTexture(type: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = TEX;
  c.height = TEX;
  const g = c.getContext("2d")!;
  const cx = TEX / 2;
  const cy = TEX / 2;
  const r = TEX * 0.36;

  // transparent sprite (no black backing/base)
  draw(g, type, cx, cy, r);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function makeBlockerSprite(typeId: number): THREE.Group {
  const group = new THREE.Group();
  let tex = cache.get(typeId);
  if (!tex) {
    tex = makeTexture(typeId);
    cache.set(typeId, tex);
  }
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.015;
  plane.userData.isFlatSprite = true;
  group.add(plane);
  group.userData.blockerType = typeId;
  group.userData.isFlatSprite = true;

  // glowing halo under every blocker (marks it as an obstacle)
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 1.4),
    new THREE.MeshBasicMaterial({
      map: bottomGlowTexture(),
      color: 0xffb15a,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.008;
  glow.renderOrder = 0; // under the sprite
  group.add(glow);
  group.userData.particlesUpdate = (t: number): void => {
    const k = 0.5 + 0.5 * Math.sin(t * 2.4 + typeId);
    (glow.material as THREE.MeshBasicMaterial).opacity = 0.6 + 0.4 * k;
    glow.scale.setScalar(0.98 + 0.22 * k);
  };

  return group;
}
