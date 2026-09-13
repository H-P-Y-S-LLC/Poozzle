/**
 * Procedural item icons (hammer / rocket / shuffle / glove / finger).
 * Spec: §5.7.2 — SVG-ish simple strokes drawn on a 20×20 grid, no external assets.
 */
const cache = new Map<string, string>();

export function itemIconDataURL(id: string, size = 40, disabled = false): string {
  const key = `${id}@${size}@${disabled ? "u" : "n"}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  if (!g) return "";
  const s = size / 20;
  const color = disabled ? "#6b7285" : itemColor(id);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 1.8 * s;
  g.lineCap = "round";
  g.lineJoin = "round";

  switch (id) {
    case "hammer":
      rect(g, 8, 3, 9, 5, s, color); // head
      line(g, 6, 9, 14, 17, s, color); // handle
      break;
    case "rocket":
      path(g, [[10, 2], [14, 9], [13, 14], [7, 14], [6, 9]], s, color, true);
      line(g, 8, 14, 7, 18, s, color);
      line(g, 12, 14, 13, 18, s, color);
      break;
    case "shuffle":
      arrow(g, 3, 6, 16, 6, s, color);
      arrow(g, 16, 14, 3, 14, s, color);
      break;
    case "glove":
      path(g, [[6, 17], [6, 9], [8, 9], [8, 5], [10, 5], [10, 9], [12, 9], [12, 7], [14, 7], [14, 17]], s, color, false);
      break;
    case "finger":
      path(g, [[10, 3], [10, 12]], s, color, false);
      path(g, [[7, 6], [7, 12], [10, 15], [14, 12], [14, 6], [11, 6], [11, 12]], s, color, false);
      break;
    default:
      g.beginPath();
      g.arc(10 * s, 10 * s, 6 * s, 0, Math.PI * 2);
      g.stroke();
  }
  if (disabled) {
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = "rgba(20,22,34,0.45)";
    g.fillRect(0, 0, size, size);
  }

  const url = c.toDataURL("image/png");
  cache.set(key, url);
  return url;
}

function itemColor(id: string): string {
  switch (id) {
    case "hammer":
      return "#f0f0f0";
    case "rocket":
      return "#ff8c42";
    case "shuffle":
      return "#5fe3d0";
    case "glove":
      return "#4c9aff";
    case "finger":
      return "#b06bff";
    default:
      return "#c8ccd8";
  }
}

function line(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, s: number, color: string): void {
  g.strokeStyle = color;
  g.beginPath();
  g.moveTo(x1 * s, y1 * s);
  g.lineTo(x2 * s, y2 * s);
  g.stroke();
}

function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, s: number, color: string): void {
  g.fillStyle = color;
  g.fillRect(x * s, y * s, w * s, h * s);
}

function path(
  g: CanvasRenderingContext2D,
  pts: Array<[number, number]>,
  s: number,
  color: string,
  close: boolean
): void {
  g.strokeStyle = color;
  g.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * s, y * s) : g.lineTo(x * s, y * s)));
  if (close) g.closePath();
  g.stroke();
}

function arrow(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, s: number, color: string): void {
  line(g, x1, y1, x2, y2, s, color);
  const dir = x2 >= x1 ? 1 : -1;
  g.strokeStyle = color;
  g.beginPath();
  g.moveTo(x2 * s, y2 * s);
  g.lineTo((x2 - dir * 3) * s, (y2 - 3) * s);
  g.moveTo(x2 * s, y2 * s);
  g.lineTo((x2 - dir * 3) * s, (y2 + 3) * s);
  g.stroke();
}
