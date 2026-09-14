/**
 * BossCoin card/coin icon: procedural canvas emblem built from the boss's shape
 * params (no external assets). Spec §5.5.5 says to derive the icon from the boss
 * model; we approximate the model as a flat silhouette to stay DOM/canvas-only.
 */
import { bossShapeParams, type BossBodyType } from "./BossShapeParams.js";
import { pixelFromVector, pixelGlowCanvas, quantize } from "./pixel.js";

const cache = new Map<string, string>();

/** Draw the coin emblem onto a fresh canvas (also used as a 3D texture source). */
export function bossCoinIconCanvas(bossId: string, size = 96): HTMLCanvasElement {
  // draw on a small pixel grid, then upscale crisp (retro pixel look)
  const PIX = Math.max(16, Math.round(size / 6));
  const art = quantize(pixelFromVector(size, PIX, (g, ref) => drawCoinVector(g, bossId, ref)), 8, 0.45);
  return pixelGlowCanvas(art, Math.max(2, Math.round(size / PIX)), "");
}

function drawCoinVector(g: CanvasRenderingContext2D, bossId: string, size: number): void {
  const p = bossShapeParams(bossId);
  const cx = size / 2;
  const cy = size / 2;

  const grad = g.createRadialGradient(cx, cy * 0.8, size * 0.05, cx, cy, size * 0.5);
  grad.addColorStop(0, "#FFF3C4");
  grad.addColorStop(0.6, "#E7B84B");
  grad.addColorStop(1, "#8A6A16");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, size * 0.46, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = Math.max(1, size * 0.06);
  g.strokeStyle = "#6B4E10";
  g.stroke();

  g.save();
  g.translate(cx, cy);
  drawBossSilhouette(g, p.colorPrimary, p.colorAccent, size * 0.34, p.bodyType);
  g.restore();
}

export function bossCoinIconDataURL(bossId: string, size = 96): string {
  const key = `${bossId}@${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = bossCoinIconCanvas(bossId, size).toDataURL("image/png");
  cache.set(key, url);
  return url;
}

function drawBossSilhouette(
  g: CanvasRenderingContext2D,
  primary: string,
  accent: string,
  r: number,
  bodyType: BossBodyType
): void {
  const segs = bodyType === "worm" || bodyType === "slug" ? 4 : bodyType === "spider" ? 2 : 2;

  g.fillStyle = primary;
  g.strokeStyle = accent;
  g.lineWidth = Math.max(1, r * 0.14);
  g.lineJoin = "round";

  if (bodyType === "spider") {
    g.beginPath();
    g.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = primary;
    g.lineWidth = Math.max(1, r * 0.16);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4);
      g.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
      g.stroke();
    }
    return;
  }

  if (bodyType === "worm" || bodyType === "slug") {
    for (let i = 0; i < segs; i++) {
      const y = -r * 0.7 + (i / (segs - 1)) * r * 1.4;
      g.beginPath();
      g.ellipse(0, y, r * (0.42 - i * 0.05), r * 0.34, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    return;
  }

  g.beginPath();
  g.ellipse(0, 0, r * 0.78, r * 0.58, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, -r * 0.72, r * 0.36, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = accent;
  g.beginPath();
  g.arc(-r * 0.14, -r * 0.76, r * 0.08, 0, Math.PI * 2);
  g.arc(r * 0.14, -r * 0.76, r * 0.08, 0, Math.PI * 2);
  g.fill();
  if (bodyType === "gecko" || bodyType === "roach" || bodyType === "beetle") {
    g.strokeStyle = primary;
    g.lineWidth = Math.max(1, r * 0.14);
    for (const sx of [-1, 1]) {
      g.beginPath();
      g.moveTo(sx * r * 0.4, r * 0.2);
      g.lineTo(sx * r * 0.85, r * 0.5);
      g.stroke();
    }
  }
}
