/**
 * Item icons — hand-drawn pixel art (crisp, quantized colors), consistent with
 * elements/specials/blockers. DOM icons are emitted as SVG pixel art.
 */
import { pixelCanvas, pixelGlowCanvas, pixelSVG, type Px } from "./pixel.js";

const S = 20;
const cache = new Map<string, string>();

const STEEL = "#c3ccd9";
const STEEL_D = "#8b95a5";
const WOOD = "#a9713a";
const WOOD_D = "#7c4f26";
const INK = "#151820";
const WHITE = "#eef2f8";
const RED = "#d8433b";
const GLASS = "#63c8ff";
const FLAME = "#ffa02e";
const CYAN = "#37d6c2";
const BLUE = "#3f8fe8";
const BLUE_D = "#2f6cb8";
const PURPLE = "#a05ce8";
const SKIN = "#c9a0ff";

function drawItem(px: Px, id: string): void {
  switch (id) {
    case "hammer":
      // handle
      px(8, 6, 2, 12, WOOD);
      px(8, 17, 2, 1, WOOD_D);
      // steel head + claw
      px(4, 3, 9, 4, STEEL);
      px(4, 6, 9, 1, STEEL_D);
      px(3, 4, 1, 2, STEEL_D);
      px(2, 5, 1, 1, INK);
      px(5, 2, 7, 1, STEEL_D);
      break;
    case "rocket":
      // nose
      px(9, 2, 2, 1, RED);
      px(8, 3, 4, 2, RED);
      // body
      px(7, 5, 6, 9, WHITE);
      px(7, 13, 6, 1, STEEL_D);
      px(7, 11, 6, 1, RED);
      // window
      px(9, 7, 2, 2, GLASS);
      px(9, 7, 1, 1, WHITE);
      // fins
      px(5, 11, 2, 4, RED);
      px(13, 11, 2, 4, RED);
      // flame
      px(8, 14, 4, 2, FLAME);
      px(9, 16, 2, 1, FLAME);
      break;
    case "shuffle":
      px(3, 5, 12, 2, CYAN);
      px(14, 3, 2, 6, CYAN);
      px(3, 13, 12, 2, CYAN);
      px(4, 11, 2, 6, CYAN);
      break;
    case "glove":
      px(6, 8, 9, 9, BLUE);
      px(6, 8, 9, 1, BLUE_D);
      // fingers
      px(6, 4, 2, 5, BLUE);
      px(8, 3, 2, 6, BLUE);
      px(10, 4, 2, 5, BLUE);
      px(12, 5, 2, 4, BLUE);
      // thumb
      px(4, 10, 2, 4, BLUE);
      // cuff
      px(6, 16, 9, 2, BLUE_D);
      break;
    default:
      // finger (pointing)
      px(7, 9, 8, 9, PURPLE);
      px(9, 2, 3, 8, SKIN); // index
      px(7, 12, 2, 3, SKIN); // folded
      px(12, 12, 2, 3, SKIN);
      px(4, 11, 2, 3, SKIN); // thumb
      px(7, 17, 8, 2, PURPLE);
      break;
  }
}

export function itemIconCanvas(id: string): HTMLCanvasElement {
  // pixel art upscaled with nearest-neighbour (crisp when used as a texture)
  return pixelGlowCanvas(pixelCanvas(S, (px) => drawItem(px, id)), 12, "");
}

export function itemIconDataURL(id: string, _size = 40, disabled = false): string {
  const key = `${id}:${disabled ? "u" : "n"}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let art = pixelCanvas(S, (px) => drawItem(px, id));
  if (disabled) {
    const d = document.createElement("canvas");
    d.width = art.width;
    d.height = art.height;
    const dg = d.getContext("2d")!;
    dg.filter = "grayscale(1) brightness(0.75)";
    dg.drawImage(art, 0, 0);
    art = d;
  }
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(pixelSVG(art))}`;
  cache.set(key, url);
  return url;
}
