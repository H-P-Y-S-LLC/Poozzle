/**
 * Flat-drawn item icons (hammer / rocket / shuffle / glove / finger), matching
 * the flat sprite language used by elements/specials/blockers. No external
 * assets; rendered on a canvas and returned as a data URL for DOM <img>s.
 */
const SIZE = 256;
const cache = new Map<string, THREEImage>();

interface THREEImage {
  url: string;
}

const INK = "rgba(22,24,34,0.92)";

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function draw(g: CanvasRenderingContext2D, id: string, cx: number, cy: number, r: number): void {
  g.lineJoin = "round";
  g.lineCap = "round";
  switch (id) {
    case "hammer": {
      // wooden handle
      g.save();
      g.translate(cx, cy);
      g.rotate(-0.5);
      g.fillStyle = "#a9713a";
      rr(g, -r * 0.12, -r * 0.05, r * 0.24, r * 1.15, r * 0.1);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = SIZE * 0.018;
      rr(g, -r * 0.12, -r * 0.05, r * 0.24, r * 1.15, r * 0.1);
      g.stroke();
      // steel head
      g.fillStyle = "#c3ccd9";
      rr(g, -r * 0.72, -r * 0.62, r * 1.44, r * 0.55, r * 0.14);
      g.fill();
      g.stroke();
      g.fillStyle = "#9aa4b3";
      rr(g, r * 0.42, -r * 0.66, r * 0.34, r * 0.63, r * 0.12);
      g.fill();
      g.stroke();
      // claw
      g.fillStyle = "#c3ccd9";
      g.beginPath();
      g.moveTo(-r * 0.7, -r * 0.58);
      g.lineTo(-r * 1.05, -r * 0.28);
      g.lineTo(-r * 0.7, -r * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
      break;
    }
    case "rocket": {
      g.save();
      g.translate(cx, cy + r * 0.05);
      // flame
      g.fillStyle = "#ffa02e";
      g.beginPath();
      g.moveTo(-r * 0.26, r * 0.62);
      g.quadraticCurveTo(0, r * 1.15, r * 0.26, r * 0.62);
      g.closePath();
      g.fill();
      // fins
      g.fillStyle = "#d8433b";
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(s * r * 0.28, r * 0.2);
        g.lineTo(s * r * 0.62, r * 0.66);
        g.lineTo(s * r * 0.28, r * 0.62);
        g.closePath();
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = SIZE * 0.016;
        g.stroke();
      }
      // body
      g.fillStyle = "#eef2f8";
      rr(g, -r * 0.3, -r * 0.4, r * 0.6, r * 1.05, r * 0.16);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = SIZE * 0.018;
      rr(g, -r * 0.3, -r * 0.4, r * 0.6, r * 1.05, r * 0.16);
      g.stroke();
      // nose
      g.fillStyle = "#d8433b";
      g.beginPath();
      g.moveTo(0, -r * 0.95);
      g.lineTo(r * 0.3, -r * 0.34);
      g.lineTo(-r * 0.3, -r * 0.34);
      g.closePath();
      g.fill();
      g.stroke();
      // window
      g.fillStyle = "#63c8ff";
      g.beginPath();
      g.arc(0, -r * 0.08, r * 0.14, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
      break;
    }
    case "shuffle": {
      const cyan = "#37d6c2";
      g.strokeStyle = cyan;
      g.fillStyle = cyan;
      g.lineWidth = SIZE * 0.055;
      for (const dir of [1, -1]) {
        const y = cy + dir * r * 0.32;
        g.beginPath();
        g.moveTo(cx - r * 0.72, y);
        g.lineTo(cx + r * 0.5, y);
        g.stroke();
        g.beginPath();
        g.moveTo(cx + r * 0.72, y);
        g.lineTo(cx + r * 0.34, y - r * 0.22);
        g.lineTo(cx + r * 0.34, y + r * 0.22);
        g.closePath();
        g.fill();
      }
      break;
    }
    case "glove": {
      const blue = "#3f8fe8";
      const dark = "#2f6cb8";
      g.fillStyle = blue;
      rr(g, cx - r * 0.5, cy - r * 0.15, r * 1.0, r * 1.0, r * 0.24);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = SIZE * 0.018;
      rr(g, cx - r * 0.5, cy - r * 0.15, r * 1.0, r * 1.0, r * 0.24);
      g.stroke();
      // fingers
      for (let i = 0; i < 4; i++) {
        const x = cx - r * 0.36 + i * r * 0.24;
        g.fillStyle = blue;
        rr(g, x - r * 0.1, cy - r * 0.72, r * 0.2, r * 0.6, r * 0.1);
        g.fill();
        g.stroke();
      }
      // thumb
      g.fillStyle = blue;
      g.beginPath();
      g.ellipse(cx + r * 0.55, cy + r * 0.08, r * 0.2, r * 0.34, -0.6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // cuff
      g.fillStyle = dark;
      rr(g, cx - r * 0.56, cy + r * 0.72, r * 1.12, r * 0.3, r * 0.1);
      g.fill();
      g.stroke();
      break;
    }
    default: {
      // finger (pointing)
      const purple = "#a05ce8";
      const skin = "#c9a0ff";
      g.fillStyle = purple;
      rr(g, cx - r * 0.45, cy - r * 0.05, r * 0.9, r * 0.9, r * 0.22);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = SIZE * 0.018;
      rr(g, cx - r * 0.45, cy - r * 0.05, r * 0.9, r * 0.9, r * 0.22);
      g.stroke();
      // pointing index
      g.fillStyle = skin;
      rr(g, cx - r * 0.2, cy - r * 0.85, r * 0.28, r * 0.85, r * 0.14);
      g.fill();
      g.stroke();
      // folded fingers
      for (let i = 0; i < 3; i++) {
        g.fillStyle = skin;
        rr(g, cx - r * 0.02 + i * r * 0.26, cy + r * 0.02, r * 0.2, r * 0.4, r * 0.1);
        g.fill();
        g.stroke();
      }
      // thumb
      g.fillStyle = skin;
      g.beginPath();
      g.ellipse(cx + r * 0.5, cy + r * 0.2, r * 0.18, r * 0.3, -0.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      break;
    }
  }
}

function drawIcon(id: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const g = c.getContext("2d")!;
  draw(g, id, SIZE / 2, SIZE / 2, SIZE * 0.33);
  return c;
}

export function itemIconCanvas(id: string): HTMLCanvasElement {
  return drawIcon(id);
}

export function itemIconDataURL(id: string, _size = 40, disabled = false): string {
  const key = `${id}:${disabled ? "u" : "n"}`;
  const hit = cache.get(key);
  if (hit) return hit.url;

  const c = drawIcon(id);
  let url: string;
  if (disabled) {
    const d = document.createElement("canvas");
    d.width = SIZE;
    d.height = SIZE;
    const dg = d.getContext("2d")!;
    dg.filter = "grayscale(1) brightness(0.75)";
    dg.drawImage(c, 0, 0);
    url = d.toDataURL("image/png");
  } else {
    url = c.toDataURL("image/png");
  }
  cache.set(key, { url });
  return url;
}
