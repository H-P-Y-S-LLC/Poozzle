/**
 * Level map: one continuous vertical track, level 1 at the bottom and the
 * highest level at the top, a bigger boss node every 10 levels, and an
 * auto-scroll to the current (highest unlocked) level.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §2.7.4, §5.6.4, §5.9.
 */
import type { ManifestEntry } from "../config/LevelManifest.js";
import type { LevelBossMeta } from "../config/ConfigLoader.js";
import type { LevelMapConfig } from "../config/ThemeConfig.js";
import { bossShapeParams, type BossShapeParams } from "../proc/BossShapeParams.js";
import { pixelSVG } from "../proc/pixel.js";
import type { I18n } from "./i18n.js";

export interface MapSaveState {
  unlocked: Set<string>;
  stars: Record<string, number>;
}

type NodeState = "locked" | "unlocked" | "cleared";

const SPACING = 112;
const MARGIN = 116;

export class LevelMapView {
  private i18n: I18n;
  private cfg: LevelMapConfig;
  private layer: HTMLElement;
  private inertiaRaf = 0;

  constructor(uiRoot: HTMLElement, i18n: I18n, cfg: LevelMapConfig) {
    this.i18n = i18n;
    this.cfg = cfg;
    this.layer = document.createElement("div");
    this.layer.className = "map-overlay hidden";
    uiRoot.appendChild(this.layer);
  }

  hide(): void {
    this.stopInertia();
    this.layer.classList.add("hidden");
    this.layer.innerHTML = "";
  }

  private stopInertia(): void {
    if (this.inertiaRaf) cancelAnimationFrame(this.inertiaRaf);
    this.inertiaRaf = 0;
  }

  get visible(): boolean {
    return !this.layer.classList.contains("hidden");
  }

  show(
    entries: ManifestEntry[],
    save: MapSaveState,
    meta: Map<string, LevelBossMeta>,
    onPick: (entry: ManifestEntry) => void
  ): void {
    this.layer.classList.remove("hidden");
    this.layer.innerHTML = "";
    this.stopInertia();

    const panel = el("div", "map3d-panel");
    const header = el("div", "map3d-header");
    const title = el("h2", "map3d-title");
    title.textContent = this.i18n.t("selectLevel");
    header.append(title);
    panel.appendChild(header);

    const scroller = el("div", "map-scroll");
    const track = el("div", "map-track");

    // highest level at the top -> render descending so level 1 ends up at the bottom
    const sorted = [...entries].sort((a, b) => b.order - a.order);
    track.style.height = `${MARGIN * 2 + Math.max(0, sorted.length - 1) * SPACING}px`;

    const positions: Array<{ x: number; y: number }> = [];
    sorted.forEach((_entry, i) => {
      const y = MARGIN + i * SPACING;
      const x = 50 + Math.sin(i * 0.55) * 22;
      positions.push({ x, y });
    });

    // ── chapter theming: every 10 levels (9 + boss) shares its boss's identity ──
    const chapterOf = (order: number): number => Math.floor((order - 1) / 10);
    interface ChapterTheme {
      color: string;
      kind: string;
      topIdx: number;
      botIdx: number;
    }
    const themes = new Map<number, ChapterTheme>();
    sorted.forEach((entry, i) => {
      const ch = chapterOf(entry.order);
      if (!themes.has(ch)) themes.set(ch, { color: "#4c9aff", kind: "soil", topIdx: i, botIdx: i });
      const t = themes.get(ch)!;
      t.topIdx = Math.min(t.topIdx, i);
      t.botIdx = Math.max(t.botIdx, i);
    });
    sorted.forEach((entry) => {
      const m = meta.get(entry.levelId);
      if (m?.isBoss && m.bossId) {
        const t = themes.get(chapterOf(entry.order))!;
        const p = bossShapeParams(m.bossId);
        t.color = p.colorAccent;
        t.kind = decorKind(m.bossId, p);
      }
    });

    // chapter tint bands (behind everything else)
    for (const t of themes.values()) {
      const yTop = positions[t.topIdx].y - SPACING * 0.62;
      const yBot = positions[t.botIdx].y + SPACING * 0.62;
      const band = el("div", "chapter-band");
      band.style.top = `${yTop}px`;
      band.style.height = `${Math.max(80, yBot - yTop)}px`;
      band.style.background = `linear-gradient(180deg, ${hexA(t.color, 0.16)}, ${hexA(t.color, 0.05)} 30%, ${hexA(t.color, 0.04)} 70%, ${hexA(t.color, 0.14)})`;
      track.appendChild(band);
    }

    // ── smooth flowing road: dark roadbed + per-segment state color + dashed centerline ──
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 100 ${track.style.height.replace("px", "")}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("map-path");
    const stateOf = (e: ManifestEntry): NodeState =>
      !save.unlocked.has(e.levelId) ? "locked" : (save.stars[e.levelId] ?? 0) > 0 ? "cleared" : "unlocked";

    const pts = positions.map((p) => ({ x: p.x, y: p.y }));
    const segPath = (i: number): string => {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    };
    const fullPath = (): string => {
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const seg = segPath(i).replace(/^M[^C]+/, "");
        d += ` ${seg}`;
      }
      return d;
    };
    const addPath = (d: string, stroke: string, width: number, extra = ""): void => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", stroke);
      p.setAttribute("stroke-width", String(width));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("vector-effect", "non-scaling-stroke");
      if (extra) p.setAttribute("style", extra);
      svg.appendChild(p);
    };

    // roadbed (unifies the route) + centerline
    addPath(fullPath(), "rgba(10,12,22,0.55)", 16);
    addPath(fullPath(), "rgba(255,255,255,0.12)", 1.6, "stroke-dasharray:7 9;");

    // colored state segments on top
    for (let i = 0; i < sorted.length - 1; i++) {
      addPath(segPath(i), pathColor(stateOf(sorted[i + 1]), this.cfg.pathStyle), 6);
    }
    track.appendChild(svg);

    // sparse themed motifs along the track (kept dim so entries stand out)
    for (const [ch, t] of themes) {
      const yTop = positions[t.topIdx].y - SPACING * 0.62;
      const yBot = positions[t.botIdx].y + SPACING * 0.62;
      const span = yBot - yTop;
      const rnd = (n: number): number => {
        const x = Math.sin(n * 127.1 + ch * 311.7) * 43758.5453;
        return x - Math.floor(x);
      };
      const n = Math.max(5, Math.round(span / (SPACING * 1.05)));
      for (let k = 0; k < n; k++) {
        const sidePick = rnd(k * 2 + 1);
        const leftPct = sidePick < 0.4 ? 7 + rnd(k * 3) * 15 : sidePick < 0.8 ? 78 + rnd(k * 5) * 15 : 30 + rnd(k * 7) * 40;
        const y = yTop + (span * (k + 0.35)) / n + (rnd(k * 11) - 0.5) * 34;
        const scale = 0.7 + rnd(k * 13) * 0.9;
        const rot = (rnd(k * 17) - 0.5) * 70;
        const m = el("div", "chapter-motif");
        m.style.left = `${leftPct}%`;
        m.style.top = `${y}px`;
        m.style.width = `${54 * scale}px`;
        m.style.height = `${48 * scale}px`;
        m.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
        m.style.opacity = `${0.24 + rnd(k * 19) * 0.24}`;
        m.innerHTML = motifSVG(t.kind, t.color);
        track.appendChild(m);
      }
      // landmark: one bigger motif right at the chapter entry (bottom) and boss (top)
      for (const [yy, side] of [[yBot - SPACING * 0.7, 12], [yTop + SPACING * 0.7, 74]] as Array<[number, number]>) {
        const m = el("div", "chapter-motif");
        m.style.left = `${side}%`;
        m.style.top = `${yy}px`;
        m.style.width = "86px";
        m.style.height = "76px";
        m.style.transform = `translate(-50%,-50%) rotate(${(rnd(yy) - 0.5) * 40}deg)`;
        m.style.opacity = "0.5";
        m.innerHTML = motifSVG(t.kind, t.color);
        track.appendChild(m);
      }
    }

    let currentEl: HTMLElement | null = null;
    let latestOrder = -Infinity;
    let suppressClick = false;

    sorted.forEach((entry, i) => {
      const state = stateOf(entry);
      const isBoss = meta.get(entry.levelId)?.isBoss ?? false;
      const pos = positions[i];
      const node = document.createElement("button");
      node.className = `map-node map-node-abs ${state}${isBoss ? " boss-node" : ""}`;
      node.style.left = `${pos.x}%`;
      node.style.top = `${pos.y}px`;
      // chapter-tinted frame so each stretch of the track reads as its own area
      const theme = themes.get(chapterOf(entry.order))!;
      if (!isBoss) {
        if (state === "locked") node.style.borderColor = hexA(theme.color, 0.35);
        else node.style.borderColor = hexA(theme.color, 0.95);
        node.style.boxShadow = `0 0 0 3px ${hexA(theme.color, state === "unlocked" ? 0.3 : 0.16)}`;
      }
      node.disabled = state === "locked";
      node.addEventListener("click", () => {
        if (suppressClick) return;
        if (state !== "locked") onPick(entry);
      });

      if (isBoss) {
        const id = meta.get(entry.levelId)?.bossId ?? "";
        const p = bossShapeParams(id);
        const wrap = el("div", "boss-fig-wrap");
        const decor = el("div", "boss-decor");
        decor.innerHTML = bossDecorSVG(id, p);
        wrap.appendChild(decor);
        const figure = el("div", "boss-fig-holder");
        const svg = bossFigureSVG(p);
        figure.innerHTML = svg;
        wrap.appendChild(figure);
        // swap the vector figure for crisp pixel art once rasterized
        const svgSized = svg.replace("<svg ", '<svg width="64" height="62" ');
        rasterizeBossPixel(svgSized, id).then((px) => {
          if (px && figure.isConnected) figure.innerHTML = px;
        });
        node.appendChild(wrap);
        const label = el("span", "map-boss-label");
        label.textContent = entry.displayName || entry.levelId.replace(/\D/g, "");
        node.appendChild(label);
      } else {
        const num = el("span", "map-node-num");
        num.textContent = entry.displayName || entry.levelId.replace(/\D/g, "");
        node.appendChild(num);
        if (state === "cleared") {
          const stars = el("span", "map-node-stars");
          const s = Math.max(1, Math.min(5, save.stars[entry.levelId] ?? 1));
          stars.textContent = "★".repeat(s);
          node.appendChild(stars);
        }
      }
      if (state === "locked") {
        const lock = el("span", "map-node-lock");
        lock.textContent = "🔒";
        node.appendChild(lock);
      }
      track.appendChild(node);

      if (state !== "locked" && entry.order > latestOrder) {
        latestOrder = entry.order;
        currentEl = node;
      }
    });

    scroller.appendChild(track);
    panel.appendChild(scroller);
    this.layer.appendChild(panel);

    // Drag-to-scroll:
    //  - touch: left to the browser (native momentum + acceleration + damping)
    //  - mouse: custom drag with velocity sampling and inertial decay
    let pointerId: number | null = null;
    let dragging = false;
    let startY = 0;
    let startTop = 0;
    let lastY = 0;
    let lastT = 0;
    let vel = 0; // px / ms (finger direction)

    const maxTop = (): number => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    const clampTop = (v: number): number => Math.max(0, Math.min(maxTop(), v));

    scroller.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") return; // native scroll handles touch
      this.stopInertia();
      pointerId = e.pointerId;
      dragging = false;
      suppressClick = false;
      startY = lastY = e.clientY;
      startTop = scroller.scrollTop;
      lastT = performance.now();
      vel = 0;
    });
    scroller.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" || pointerId !== e.pointerId) return;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) <= 4) return;
        dragging = true;
        suppressClick = true;
        scroller.classList.add("dragging");
        try {
          scroller.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      vel = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = now;
      // follow the pointer 1:1, with resistance past the ends
      const max = maxTop();
      let v = startTop - dy;
      if (v < 0) v *= 0.5;
      else if (v > max) v = max + (v - max) * 0.5;
      scroller.scrollTop = v;
    });
    const endDrag = (e: PointerEvent): void => {
      if (e.pointerType === "touch" || pointerId !== e.pointerId) return;
      if (dragging) {
        try {
          scroller.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        scroller.scrollTop = clampTop(scroller.scrollTop);
        // inertial fling with friction
        let v = -vel * 16;
        if (Math.abs(v) > 4) {
          const step = (): void => {
            v *= 0.94;
            if (Math.abs(v) < 0.4) {
              this.inertiaRaf = 0;
              return;
            }
            scroller.scrollTop = clampTop(scroller.scrollTop + v);
            this.inertiaRaf = requestAnimationFrame(step);
          };
          this.inertiaRaf = requestAnimationFrame(step);
        }
      }
      pointerId = null;
      dragging = false;
      scroller.classList.remove("dragging");
    };
    scroller.addEventListener("pointerup", endDrag);
    scroller.addEventListener("pointercancel", endDrag);

    // auto-scroll so the current/latest level is centered
    if (currentEl) {
      (currentEl as HTMLElement).classList.add("current");
      const target = currentEl as HTMLElement;
      requestAnimationFrame(() => {
        scroller.scrollTop = Math.max(0, target.offsetTop - scroller.clientHeight / 2);
      });
    }
  }
}

function pathColor(state: NodeState, style: LevelMapConfig["pathStyle"]): string {
  const custom = state === "locked" ? style.lockedColor : state === "cleared" ? style.clearedColor : style.unlockedColor;
  if (custom && custom !== "transparent" && custom !== "#00000000") return custom;
  return state === "locked" ? "#5A6172" : state === "cleared" ? "#FFD60A" : "#4C9AFF";
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── crisp pixel-art boss figures (rasterize the vector figure once, then resample) ──
const bossPixelCache = new Map<string, string>();
const bossPixelPending = new Map<string, Promise<string>>();

function rasterizeBossPixel(svgSized: string, key: string): Promise<string> {
  const hit = bossPixelCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = bossPixelPending.get(key);
  if (pending) return pending;
  const task = new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const PX = 28;
      const c = document.createElement("canvas");
      c.width = PX;
      c.height = PX;
      const g = c.getContext("2d")!;
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, PX, PX);
      const out = pixelSVG(c);
      bossPixelCache.set(key, out);
      bossPixelPending.delete(key);
      resolve(out);
    };
    img.onerror = () => {
      bossPixelPending.delete(key);
      resolve("");
    };
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svgSized)}`;
  });
  bossPixelPending.set(key, task);
  return task;
}

/** Small ambient motif placed along the track, themed by chapter kind. */
function motifSVG(kind: string, color: string): string {
  const parts: string[] = [];
  switch (kind) {
    case "web":
      for (let i = 0; i < 4; i++) {
        const ang = (Math.PI / 2) * (i / 3) + Math.PI * 0.5;
        parts.push(`<line x1="32" y1="32" x2="${32 + Math.cos(ang) * 26}" y2="${32 + Math.sin(ang) * 26}" stroke="${color}" stroke-width="1.2" opacity="0.8"/>`);
      }
      parts.push(`<path d="M8 32 Q 32 48 56 32" fill="none" stroke="${color}" stroke-width="1.2" opacity="0.7"/>`);
      break;
    case "leaves":
      for (const [x, y, rot] of [[20, 34, -25], [42, 26, 30]]) {
        parts.push(`<g transform="translate(${x} ${y}) rotate(${rot})"><path d="M0 0 Q8 -9 17 0 Q8 9 0 0" fill="${color}" opacity="0.75"/><line x1="0" y1="0" x2="16" y2="0" stroke="#10121a" stroke-width="0.8" opacity="0.5"/></g>`);
      }
      break;
    case "drops":
      for (const [x, y, s] of [[24, 30, 1], [42, 38, 0.75]]) {
        parts.push(`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 -10 C 6 -2 8 2 8 5 A 8 8 0 0 1 -8 5 C -8 2 -6 -2 0 -10Z" fill="${color}" opacity="0.8"/></g>`);
      }
      break;
    case "crumbs":
      for (const [x, y] of [[22, 34], [34, 26], [46, 36]]) {
        parts.push(`<circle cx="${x}" cy="${y}" r="2.2" fill="${color}" opacity="0.8"/>`);
      }
      parts.push(`<path d="M14 42 Q 32 34 50 44" fill="none" stroke="${color}" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.7"/>`);
      break;
    case "slime":
      parts.push(`<path d="M10 34 Q 24 26 36 34 Q 46 40 56 32" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.55"/>`);
      break;
    case "dust":
      for (let i = 0; i < 5; i++) {
        parts.push(`<circle cx="${14 + i * 9}" cy="${26 + ((i * 13) % 18)}" r="${1.8 + (i % 2)}" fill="${color}" opacity="0.7"/>`);
      }
      break;
    default: {
      // soil: mound + grass
      parts.push(`<ellipse cx="32" cy="46" rx="20" ry="5" fill="${color}" opacity="0.5"/>`);
      for (const [x, h] of [[22, 12], [30, 16], [42, 10]]) {
        parts.push(`<path d="M${x} 44 C ${x - 3} ${44 - h * 0.6} ${x + 3} ${44 - h} ${x} ${44 - h}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`);
      }
      break;
    }
  }
  return `<svg viewBox="0 0 64 56" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
}

/** Procedural boss figure for the map, derived from the same params as battle. */
function bossFigureSVG(p: BossShapeParams): string {
  const primary = p.colorPrimary;
  const accent = p.colorAccent;
  const eye = "#f4f4f8";
  const pupil = "#14141c";
  const contactShadow = `<ellipse cx="32" cy="52" rx="20" ry="5" fill="rgba(0,0,0,0.4)"/>`;

  const legs = [];
  const legPairs = Math.min(7, Math.ceil(p.legs / 2));
  for (let i = 0; i < legPairs; i++) {
    const x = 16 + (i * 32) / Math.max(1, legPairs - 1 || 1);
    legs.push(`<line class="bf-leg" style="animation-delay:${(i % 3) * 0.12}s" x1="${x}" y1="34" x2="${x - 3}" y2="50" stroke="${accent}" stroke-width="2.6" stroke-linecap="round"/>`);
    legs.push(`<line class="bf-leg" style="animation-delay:${(i % 3) * 0.12 + 0.06}s" x1="${x}" y1="34" x2="${x + 3}" y2="50" stroke="${accent}" stroke-width="2.6" stroke-linecap="round"/>`);
  }

  const segs: string[] = [];
  const n = Math.max(1, p.segments);
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const r = 8 + Math.sin(t * Math.PI) * 6;
    const cy = 34 - i * (18 / n);
    segs.push(
      `<ellipse cx="32" cy="${cy}" rx="${r}" ry="${r * (p.bodyType === "roach" ? 0.6 : 0.8)}" fill="${lightenHex(primary, 0.14)}" stroke="#10121a" stroke-width="2"/>`
    );
  }

  const shell = p.shell ? `<ellipse cx="32" cy="30" rx="22" ry="12" fill="${accent}" opacity="0.85"/>` : "";
  const tail = p.tail ? `<path d="M24 44 Q16 52 20 58" stroke="${primary}" fill="none" stroke-width="4" stroke-linecap="round"/>` : "";
  const antennae =
    p.antennae > 0
      ? `<line class="bf-ant" x1="27" y1="20" x2="18" y2="6" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>` +
        `<line class="bf-ant" style="animation-delay:.15s" x1="37" y1="20" x2="46" y2="6" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`
      : "";
  const proboscis = p.feature === "proboscis" ? `<line x1="32" y1="18" x2="32" y2="2" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>` : "";
  const wings =
    p.feature === "wings2"
      ? `<ellipse class="bf-wing" cx="20" cy="22" rx="14" ry="6" fill="${accent}" opacity="1" transform="rotate(-20 20 22)"/>` +
        `<ellipse class="bf-wing" style="animation-delay:.1s" cx="44" cy="22" rx="14" ry="6" fill="${accent}" opacity="1" transform="rotate(20 44 22)"/>`
      : "";
  const pincers =
    p.feature === "pincers"
      ? `<path d="M26 50 l-6 -8" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>` +
        `<path d="M38 50 l6 -8" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>`
      : "";

  const eyeDots: string[] = [];
  const eyeCount = Math.min(8, p.eyes);
  for (let i = 0; i < eyeCount; i++) {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    const ex = 32 + side * (4 + row * 3);
    const ey = 18 - row * 3;
    eyeDots.push(`<circle cx="${ex}" cy="${ey}" r="2.6" fill="${eye}"/><circle cx="${ex}" cy="${ey}" r="1.3" fill="${pupil}"/>`);
  }

  return (
    `<svg class="boss-fig" viewBox="0 0 64 62" xmlns="http://www.w3.org/2000/svg">` +
    contactShadow +
    tail +
    wings +
    legs.join("") +
    segs.join("") +
    shell +
    pincers +
    proboscis +
    antennae +
    eyeDots.join("") +
    `</svg>`
  );
}

/** Mix a hex color toward white so dark bosses still read on the dark map. */
function lightenHex(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const m = (v: number) => Math.round(v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}

/** Environment decorations around a boss node, chosen by the boss's attributes. */
function bossDecorSVG(bossId: string, p: BossShapeParams): string {
  const a = p.colorAccent;
  const c = p.colorPrimary;
  const kind = decorKind(bossId, p);
  const parts: string[] = [];
  const wrap = (s: string): string => s;

  switch (kind) {
    case "web": {
      // radial silk + spiral + hanging thread
      const cx = 46;
      const cy = 44;
      for (let i = 0; i < 7; i++) {
        const ang = (Math.PI / 2) * (i / 6) + Math.PI * 0.5;
        parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(ang) * 54}" y2="${cy + Math.sin(ang) * 54}" stroke="${a}" stroke-width="1" opacity="0.5"/>`);
      }
      for (let r = 12; r <= 52; r += 13) {
        parts.push(`<path d="M ${cx - r} ${cy} Q ${cx} ${cy + r * 0.55} ${cx + r} ${cy}" fill="none" stroke="${a}" stroke-width="1" opacity="0.45"/>`);
      }
      parts.push(`<line class="bfd-sway" x1="118" y1="18" x2="118" y2="66" stroke="${a}" stroke-width="1.2" opacity="0.6"/>`);
      parts.push(`<circle class="bfd-float" cx="118" cy="70" r="3" fill="${c}" opacity="0.8"/>`);
      break;
    }
    case "leaves": {
      for (const [x, y, rot, s] of [[26, 118, -30, 1], [132, 34, 25, 0.85], [24, 40, 60, 0.7], [136, 120, -15, 0.9]]) {
        parts.push(
          `<g class="bfd-sway" transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">` +
            `<path d="M0 0 Q12 -14 26 0 Q12 14 0 0" fill="${a}" opacity="0.4"/>` +
            `<line x1="0" y1="0" x2="24" y2="0" stroke="${c}" stroke-width="1" opacity="0.6"/>` +
            `</g>`
        );
      }
      break;
    }
    case "drops": {
      for (const [x, y, s] of [[30, 46, 1], [130, 60, 0.8], [44, 126, 0.9], [124, 122, 0.7]]) {
        parts.push(
          `<g class="bfd-float" transform="translate(${x} ${y}) scale(${s})">` +
            `<path d="M0 -12 C 7 -3 10 2 10 6 A 10 10 0 0 1 -10 6 C -10 2 -7 -3 0 -12Z" fill="${a}" opacity="0.45"/>` +
            `</g>`
        );
        parts.push(`<ellipse cx="${x}" cy="${y + 16}" rx="14" ry="4" fill="none" stroke="${c}" stroke-width="1" opacity="0.3"/>`);
      }
      break;
    }
    case "dust": {
      for (let i = 0; i < 10; i++) {
        const x = 20 + ((i * 37) % 120);
        const y = 22 + ((i * 53) % 116);
        parts.push(`<circle class="bfd-float" style="animation-delay:${(i % 4) * 0.4}s" cx="${x}" cy="${y}" r="${2 + (i % 3)}" fill="${a}" opacity="0.3"/>`);
      }
      break;
    }
    case "crumbs": {
      for (let i = 0; i < 7; i++) {
        const x = 24 + ((i * 41) % 112);
        const y = 108 + ((i * 17) % 34);
        parts.push(`<circle cx="${x}" cy="${y}" r="${2 + (i % 2)}" fill="${c}" opacity="0.5"/>`);
      }
      parts.push(`<path class="bfd-dash" d="M18 132 Q 60 116 80 132 Q 104 148 142 128" fill="none" stroke="${a}" stroke-width="1.5" stroke-dasharray="4 6" opacity="0.5"/>`);
      break;
    }
    case "slime": {
      parts.push(`<path class="bfd-dash" d="M14 128 Q 50 108 80 126 Q 110 144 148 122" fill="none" stroke="${a}" stroke-width="6" stroke-linecap="round" stroke-dasharray="10 12" opacity="0.35"/>`);
      break;
    }
    default: {
      // soil: dirt mounds + grass blades + pebbles
      parts.push(`<ellipse cx="80" cy="132" rx="62" ry="12" fill="${c}" opacity="0.18"/>`);
      parts.push(`<ellipse cx="42" cy="128" rx="16" ry="7" fill="${c}" opacity="0.3"/>`);
      parts.push(`<ellipse cx="118" cy="130" rx="14" ry="6" fill="${c}" opacity="0.3"/>`);
      for (const [x, h, s] of [[26, 30, 0.8], [34, 22, 0.6], [132, 34, 0.9], [140, 24, 0.7]]) {
        parts.push(
          `<path class="bfd-sway" d="M${x} 132 C ${x - 6} ${132 - h * 0.6} ${x + 6} ${132 - h} ${x} ${132 - h}" fill="none" stroke="${a}" stroke-width="2.4" stroke-linecap="round" opacity="0.6" transform="scale(${s}) translate(${x * (1 / s - 1)} ${132 * (1 / s - 1)})"/>`
        );
      }
      for (const [x, y, r] of [[22, 106, 5], [138, 100, 6], [120, 116, 4]]) {
        parts.push(`<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.7}" fill="${a}" opacity="0.35"/>`);
      }
      break;
    }
  }

  return `<svg class="bf-decor-svg" viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">${wrap(parts.join(""))}</svg>`;
}

/** Pick a decoration theme from the boss identity + traits. */
function decorKind(bossId: string, p: BossShapeParams): string {
  switch (bossId) {
    case "boss_placeholder_02":
      return "web";
    case "boss_placeholder_04":
    case "boss_placeholder_07":
      return "leaves";
    case "boss_placeholder_05":
    case "boss_placeholder_09":
      return "dust";
    case "boss_placeholder_06":
      return "drops";
    case "boss_placeholder_08":
      return "crumbs";
    case "boss_placeholder_10":
      return "slime";
    default:
      if (p.bodyType === "worm" || p.bodyType === "beetle") return "soil";
      if (p.feature === "wings2") return "dust";
      return "soil";
  }
}

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

