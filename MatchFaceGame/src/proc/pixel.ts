/**
 * "Glowing retro pixel" art kit.
 * Draw on a small pixel grid, upscale with nearest-neighbour (crisp pixels) and
 * add a soft additive halo behind it. Shared by all in-game sprites so the whole
 * game reads as one pixel-art set.
 */
import * as THREE from "three";

export type Px = (x: number, y: number, w: number, h: number, color: string) => void;

/** Create a `size`×`size` pixel canvas; `draw` receives a crisp fillRect helper. */
export function pixelCanvas(size: number, draw: (px: Px) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  const px: Px = (x, y, w, h, color) => {
    g.fillStyle = color;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  };
  draw(px);
  return c;
}

/**
 * Upscale pixel art with nearest-neighbour and bake a soft glow halo behind it.
 * `glow` is an rgba color; pass "" to skip the halo.
 */
export function pixelGlowCanvas(
  src: HTMLCanvasElement,
  scale: number,
  glow: string,
  glowScale = 1.12
): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width * scale;
  out.height = src.height * scale;
  const g = out.getContext("2d")!;
  g.imageSmoothingEnabled = false;

  if (glow) {
    // halo: draw the art several times with a big blur, then composite down
    g.save();
    g.shadowColor = glow;
    for (let i = 0; i < 4; i++) {
      g.shadowBlur = 8 * glowScale * (i + 1) * (scale / 4);
      g.drawImage(src, 0, 0, out.width, out.height);
    }
    g.restore();
    g.globalAlpha = 0.5;
    g.drawImage(src, 0, 0, out.width, out.height);
    g.globalAlpha = 1;
  }
  g.drawImage(src, 0, 0, out.width, out.height);
  return out;
}

/** Turn a pixel canvas into a crisp, glow-baked, unlit sprite texture. */
export function pixelTexture(src: HTMLCanvasElement, glow = "", scale = 12): THREE.CanvasTexture {
  const out = pixelGlowCanvas(src, scale, glow);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

/** Mix a palette color toward white (t<0 darkens). */
export function mixHex(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (v: number): number => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/**
 * Rasterize an existing vector drawing into a tiny pixel canvas (nearest-neighbour
 * look when later upscaled). `draw` uses the original reference coordinate space.
 */
export function pixelFromVector(ref: number, pxSize: number, draw: (g: CanvasRenderingContext2D, ref: number) => void): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = pxSize;
  c.height = pxSize;
  const g = c.getContext("2d")!;
  const s = pxSize / ref;
  g.scale(s, s);
  draw(g, ref);
  return c;
}

/**
 * Posterize + alpha-threshold a pixel canvas so upscaled art stays crisp
 * instead of showing blended (blurry) edge pixels.
 */
export function quantize(c: HTMLCanvasElement, levels = 8, alphaCut = 0.45): HTMLCanvasElement {
  const g = c.getContext("2d")!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < alphaCut * 255) {
      d[i + 3] = 0;
      continue;
    }
    d[i + 3] = 255;
    d[i] = Math.round(Math.round(d[i] / step) * step);
    d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
    d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Convert a pixel canvas into crisp SVG pixel art (one <rect> per opaque pixel). */
export function pixelSVG(c: HTMLCanvasElement): string {
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const data = g.getImageData(0, 0, w, h).data;
  const rects: string[] = [];
  const seen = new Map<number, string>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 40) continue;
      const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      let css = seen.get(key);
      if (!css) {
        css = `#${key.toString(16).padStart(6, "0")}`;
        seen.set(key, css);
      }
      rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${css}"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${rects.join("")}</svg>`;
}

