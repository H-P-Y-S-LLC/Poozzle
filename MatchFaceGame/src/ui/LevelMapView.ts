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
import type { I18n } from "./i18n.js";

export interface MapSaveState {
  unlocked: Set<string>;
  stars: Record<string, number>;
}

type NodeState = "locked" | "unlocked" | "cleared";

const SPACING = 116;
const MARGIN = 120;

export class LevelMapView {
  private i18n: I18n;
  private cfg: LevelMapConfig;
  private layer: HTMLElement;

  constructor(uiRoot: HTMLElement, i18n: I18n, cfg: LevelMapConfig) {
    this.i18n = i18n;
    this.cfg = cfg;
    this.layer = document.createElement("div");
    this.layer.className = "map-overlay hidden";
    uiRoot.appendChild(this.layer);
  }

  hide(): void {
    this.layer.classList.add("hidden");
    this.layer.innerHTML = "";
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

    // path behind nodes
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 100 ${track.style.height.replace("px", "")}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("map-path");
    const stateOf = (e: ManifestEntry): NodeState =>
      !save.unlocked.has(e.levelId) ? "locked" : (save.stars[e.levelId] ?? 0) > 0 ? "cleared" : "unlocked";
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = positions[i];
      const b = positions[i + 1];
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(a.x));
      line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x));
      line.setAttribute("y2", String(b.y));
      line.setAttribute("stroke", pathColor(stateOf(sorted[i + 1]), this.cfg.pathStyle));
      line.setAttribute("stroke-width", "3");
      line.setAttribute("stroke-linecap", "round");
      svg.appendChild(line);
    }
    track.appendChild(svg);

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
      node.disabled = state === "locked";
      node.addEventListener("click", () => {
        if (suppressClick) return;
        if (state !== "locked") onPick(entry);
      });

      if (isBoss) {
        const id = meta.get(entry.levelId)?.bossId ?? "";
        const wrap = el("div", "boss-fig-wrap");
        wrap.innerHTML = bossFigureSVG(bossShapeParams(id));
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

    // drag to scroll vertically (mouse + touch), no scrollbar.
    // Capture is only taken once a real drag starts, so node clicks still work.
    let pointerId: number | null = null;
    let dragging = false;
    let startY = 0;
    let startTop = 0;
    scroller.addEventListener("pointerdown", (e) => {
      pointerId = e.pointerId;
      dragging = false;
      suppressClick = false;
      startY = e.clientY;
      startTop = scroller.scrollTop;
    });
    scroller.addEventListener("pointermove", (e) => {
      if (pointerId !== e.pointerId) return;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) <= 6) return;
        dragging = true;
        suppressClick = true;
        scroller.classList.add("dragging");
        try {
          scroller.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      scroller.scrollTop = startTop - dy;
    });
    const endDrag = (e: PointerEvent): void => {
      if (pointerId !== e.pointerId) return;
      if (dragging) {
        try {
          scroller.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
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

/** Procedural boss figure for the map, derived from the same params as battle. */
function bossFigureSVG(p: BossShapeParams): string {
  const primary = p.colorPrimary;
  const accent = p.colorAccent;
  const eye = "#f4f4f8";
  const pupil = "#14141c";

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
    segs.push(`<ellipse cx="32" cy="${cy}" rx="${r}" ry="${r * (p.bodyType === "roach" ? 0.6 : 0.8)}" fill="${primary}"/>`);
  }

  const shell = p.shell ? `<ellipse cx="32" cy="30" rx="22" ry="12" fill="${accent}" opacity="0.4"/>` : "";
  const tail = p.tail ? `<path d="M24 44 Q16 52 20 58" stroke="${primary}" fill="none" stroke-width="4" stroke-linecap="round"/>` : "";
  const antennae =
    p.antennae > 0
      ? `<line class="bf-ant" x1="27" y1="20" x2="18" y2="6" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>` +
        `<line class="bf-ant" style="animation-delay:.15s" x1="37" y1="20" x2="46" y2="6" stroke="${accent}" stroke-width="2" stroke-linecap="round"/>`
      : "";
  const proboscis = p.feature === "proboscis" ? `<line x1="32" y1="18" x2="32" y2="2" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>` : "";
  const wings =
    p.feature === "wings2"
      ? `<ellipse class="bf-wing" cx="20" cy="22" rx="14" ry="6" fill="${accent}" opacity="0.7" transform="rotate(-20 20 22)"/>` +
        `<ellipse class="bf-wing" style="animation-delay:.1s" cx="44" cy="22" rx="14" ry="6" fill="${accent}" opacity="0.7" transform="rotate(20 44 22)"/>`
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

function el(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

