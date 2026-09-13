/**
 * DOM/CSS HUD overlay, settlement dialog and level select.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.9.
 */
import type { BoardLogic } from "../logic/BoardLogic.js";
import { SpecialType } from "../logic/Match3Types.js";
import type { ManifestEntry } from "../config/LevelManifest.js";
import { elementIconDataURL } from "../proc/ElementIconFactory.js";
import type { I18n } from "./i18n.js";

export interface SettlementInfo {
  victory: boolean;
  score: number;
  stars: number;
  reason: string;
}

export class HudView {
  private i18n: I18n;
  private overlayRoot: HTMLElement;
  private topBar: HTMLElement;
  private bossRow: HTMLElement;
  private goalRow: HTMLElement;
  private overlay: HTMLElement;
  private loading: HTMLElement;
  private goalChips = new Map<number, HTMLElement>();
  private goalSig = "";

  constructor(root: HTMLElement, i18n: I18n) {
    this.i18n = i18n;
    this.overlayRoot = root;

    this.topBar = div("hud-top");
    this.bossRow = div("hud-boss");
    this.goalRow = div("hud-goals");
    this.overlay = div("hud-overlay hidden");
    this.loading = div("hud-loading hidden");
    this.loading.textContent = i18n.t("loading");

    root.append(this.topBar, this.bossRow, this.goalRow, this.overlay, this.loading);
  }

  setLoading(on: boolean): void {
    this.loading.classList.toggle("hidden", !on);
  }

  update(board: BoardLogic, levelLabel: string): void {
    const moves = board.remainingMoves;
    this.topBar.innerHTML = "";
    this.topBar.append(
      stat(this.i18n.t("level"), levelLabel),
      stat(this.i18n.t("score"), String(board.currentScore)),
      stat(this.i18n.t("moves"), moves >= 999 ? "∞" : String(moves))
    );

    const goals = board.collectProgress();
    const sig = goals.map((g) => `${g.tileType}:${g.required}`).join("|");
    if (sig !== this.goalSig) {
      this.goalSig = sig;
      this.goalChips.clear();
      this.goalRow.innerHTML = "";
      for (const g of goals) {
        const chip = div("goal-chip");
        const img = document.createElement("img");
        img.className = "goal-icon";
        img.src = elementIconDataURL(g.tileType);
        img.alt = `tile ${g.tileType}`;
        const label = document.createElement("b");
        label.className = "goal-count";
        label.textContent = `${g.current}/${g.required}`;
        chip.append(img, label);
        this.goalRow.appendChild(chip);
        this.goalChips.set(g.tileType, chip);
      }
    } else {
      for (const g of goals) {
        const chip = this.goalChips.get(g.tileType);
        const count = chip?.querySelector(".goal-count") as HTMLElement | null;
        if (count) count.textContent = `${g.current}/${g.required}`;
      }
    }

    this.renderBoss(board);
  }

  /** Screen center of a goal chip (for fly-to-goal animation), or null. */
  goalChipCenter(tileType: number): { x: number; y: number } | null {
    const chip = this.goalChips.get(tileType);
    if (!chip) return null;
    const r = chip.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  popGoal(tileType: number): void {
    const chip = this.goalChips.get(tileType);
    if (!chip) return;
    chip.classList.remove("pop");
    void chip.offsetWidth;
    chip.classList.add("pop");
  }

  private renderBoss(board: BoardLogic): void {
    this.bossRow.innerHTML = "";
    const boss = board.boss;
    if (!boss) return;
    const pct = Math.max(0, Math.min(100, (boss.currentHp / boss.maxHp) * 100));
    const wrap = div("boss-hud");
    const label = div("boss-bar-label");
    label.textContent = `BOSS  ${boss.currentHp} / ${boss.maxHp}`;
    const bar = div("boss-bar");
    const fill = div("boss-bar-fill");
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    const weak = div("boss-weak");
    for (const w of boss.weaknessTileTypes()) {
      const chip = document.createElement("span");
      chip.className = "weak-chip";
      chip.innerHTML = `<i style="background:${tileColorHex(w.tileType)}"></i>×${w.damage}`;
      weak.appendChild(chip);
    }
    wrap.append(label, bar, weak);
    this.bossRow.appendChild(wrap);
  }

  /** Full-screen victory/defeat burst + text before the settlement panel. */
  showCelebration(victory: boolean, onDone: () => void): void {
    const overlay = div(`celebration ${victory ? "win" : "lose"}`);
    const text = div("celebration-text");
    text.textContent = victory ? this.i18n.t("win") : this.i18n.t("lose");
    overlay.appendChild(text);

    const colors = victory
      ? ["#FFD60A", "#4CE0D2", "#4C9AFF", "#FF7A45", "#2ED47A", "#A55CFF"]
      : ["#FF5A5F", "#7A4FD0", "#5A6172", "#C0392B"];
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    for (let i = 0; i < 90; i++) {
      const p = div("celebration-particle");
      p.style.background = colors[i % colors.length];
      p.style.left = `${cx}px`;
      p.style.top = `${cy}px`;
      overlay.appendChild(p);
      const angle = Math.random() * Math.PI * 2;
      const dist = 120 + Math.random() * Math.min(window.innerWidth, window.innerHeight) * 0.6;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist + (victory ? 120 : 260);
      const size = 6 + Math.random() * 10;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
      requestAnimationFrame(() => {
        p.style.transition = `transform ${0.9 + Math.random() * 0.8}s cubic-bezier(.15,.7,.3,1), opacity 1.1s ease`;
        p.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${Math.random() * 720 - 360}deg)`;
        p.style.opacity = "0";
      });
    }

    this.overlayRoot.appendChild(overlay);
    window.setTimeout(() => {
      overlay.classList.add("fade");
      window.setTimeout(() => {
        overlay.remove();
        onDone();
      }, 320);
    }, 1700);
  }

  showSettlement(info: SettlementInfo, onRetry: () => void, onNext: () => void, onMap: () => void): void {
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = "";
    const panel = div("settle-panel");
    const title = document.createElement("h2");
    title.textContent = info.victory ? this.i18n.t("win") : this.i18n.t("lose");
    title.className = info.victory ? "win" : "lose";
    const stars = document.createElement("div");
    stars.className = "settle-stars";
    stars.textContent = info.victory ? "★".repeat(Math.max(1, info.stars)) + "☆".repeat(5 - Math.max(1, info.stars)) : "☆☆☆☆☆";
    const score = document.createElement("p");
    score.textContent = `${this.i18n.t("score")}: ${info.score}`;
    const buttons = div("settle-buttons");
    buttons.append(
      mkButton(this.i18n.t("retry"), onRetry, "ghost"),
      mkButton(this.i18n.t("next"), onNext, "primary"),
      mkButton(this.i18n.t("map"), onMap, "ghost")
    );
    panel.append(title, stars, score, buttons);
    this.overlay.appendChild(panel);
  }

  hideSettlement(): void {
    this.overlay.classList.add("hidden");
    this.overlay.innerHTML = "";
  }

  showLevelSelect(entries: ManifestEntry[], unlocked: Set<string>, onPick: (e: ManifestEntry) => void, onClose: () => void): void {
    this.overlay.classList.remove("hidden");
    this.overlay.innerHTML = "";
    const panel = div("map-panel");
    const title = document.createElement("h2");
    title.textContent = this.i18n.t("selectLevel");
    const grid = div("map-grid");
    for (const e of entries) {
      const isUnlocked = unlocked.has(e.levelId);
      const b = document.createElement("button");
      b.className = `map-cell${isUnlocked ? "" : " locked"}`;
      b.textContent = e.displayName || e.levelId;
      b.disabled = !isUnlocked;
      b.addEventListener("click", () => onPick(e));
      grid.appendChild(b);
    }
    const close = mkButton(this.i18n.t("back"), onClose, "ghost");
    panel.append(title, grid, close);
    this.overlay.appendChild(panel);
  }

  hideOverlay(): void {
    this.overlay.classList.add("hidden");
    this.overlay.innerHTML = "";
  }
}

function div(cls: string): HTMLElement {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}

function stat(label: string, value: string): HTMLElement {
  const el = div("hud-stat");
  el.innerHTML = `<span class="hud-label">${label}</span><span class="hud-value">${value}</span>`;
  return el;
}

function mkButton(text: string, onClick: () => void, variant: "primary" | "ghost"): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `btn ${variant}`;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function tileColorHex(tileType: number): string {
  const map: Record<number, string> = {
    1: "#FF5A5F",
    2: "#FFB020",
    3: "#2ED47A",
    4: "#2D9CFF",
    5: "#A55CFF",
    6: "#FF7A45",
    7: "#8C6A3F",
  };
  void SpecialType;
  return map[tileType] ?? "#888";
}
