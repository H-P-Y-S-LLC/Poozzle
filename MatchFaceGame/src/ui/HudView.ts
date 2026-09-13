/**
 * DOM/CSS HUD overlay, settlement dialog and level select.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.9.
 */
import type { BoardLogic } from "../logic/BoardLogic.js";
import type { ManifestEntry } from "../config/LevelManifest.js";
import { elementIconDataURL } from "../proc/ElementIconFactory.js";
import { blockerIconDataURL } from "../proc/BlockerIconFactory.js";
import { tileColor } from "../proc/Palette.js";
import type { BossCoinAnimation } from "../config/BossCoinConfig.js";
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
  private ultimateWrap: HTMLElement;
  private useBtn: HTMLButtonElement;
  private ultimateSlots: HTMLElement[] = [];
  private ultElement = 0;
  private ultFilled = 0;
  private ultAnimating = false;
  private ultReadyState = false;
  private bossCoinTray: HTMLElement;
  private bossCoinCoins: HTMLElement;
  private bossCoinLabel: HTMLElement;
  private coinOverlay: HTMLElement;
  private coinBusy = false;
  private goalChips = new Map<number, HTMLElement>();
  private blockerChips = new Map<number, HTMLElement>();
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

    // ultimate: 3 charge slots (display) + a separate "use" button
    this.ultimateWrap = div("ultimate-wrap hidden");
    const slots = div("ultimate-slots");
    for (let i = 0; i < 3; i++) {
      const slot = div("ultimate-slot");
      slots.appendChild(slot);
      this.ultimateSlots.push(slot);
    }
    this.useBtn = document.createElement("button");
    this.useBtn.className = "ultimate-use";
    this.useBtn.textContent = "大招";
    this.useBtn.disabled = true;
    this.ultimateWrap.append(slots, this.useBtn);
    root.appendChild(this.ultimateWrap);

    // boss coin tray: owned coins, displayed next to the ultimate, usable anytime
    this.bossCoinTray = div("bosscoin-tray hidden");
    this.bossCoinLabel = document.createElement("span");
    this.bossCoinLabel.className = "bosscoin-label";
    this.bossCoinCoins = div("bosscoin-coins");
    this.bossCoinTray.append(this.bossCoinLabel, this.bossCoinCoins);
    root.appendChild(this.bossCoinTray);

    this.coinOverlay = div("coin-toss hidden");
    root.appendChild(this.coinOverlay);
  }

  get bossCoinTrayEl(): HTMLElement {
    return this.bossCoinTray;
  }

  get useButton(): HTMLButtonElement {
    return this.useBtn;
  }

  updateUltimate(state: { enabled: boolean; ready: boolean; element: number; count: number; required: number }): void {
    if (!state.enabled) {
      this.ultimateWrap.classList.add("hidden");
      return;
    }
    this.ultimateWrap.classList.remove("hidden");
    this.ultReadyState = state.ready;
    this.applyUltimateReady();

    const color = state.element > 0 ? tileColor(state.element).main : "#4C9AFF";
    this.ultimateWrap.style.setProperty("--ult-color", color);

    // reset visual fill when the accumulated element changes or on release
    if (state.element > 0 && state.element !== this.ultElement) this.resetUltimateVisual(state.element);
    if (state.count === 0 && this.ultFilled > 0) this.resetUltimateVisual(0);

    // a level that starts already ready shows all slots full immediately
    if (state.ready && this.ultFilled === 0 && state.element > 0) {
      for (let i = 0; i < 3; i++) this.fillUltimateSlot(i, state.element);
    }

    this.useBtn.title = state.ready ? "使用大招：点击选中，再点棋盘目标释放" : `充能 ${state.count}/${state.required}`;
  }

  /** Charge/fill animation running: keep the use button disabled until it ends. */
  setUltimateAnimating(on: boolean): void {
    this.ultAnimating = on;
    this.applyUltimateReady();
  }

  private applyUltimateReady(): void {
    const clickable = this.ultReadyState && !this.ultAnimating;
    this.useBtn.disabled = !clickable;
    this.useBtn.classList.toggle("ready", clickable);
    this.ultimateWrap.classList.toggle("ready-glow", clickable);
    if (!clickable) this.ultimateWrap.classList.remove("glow-done");
  }

  /** Clear the visual slots and set the element that will fill them. */
  resetUltimateVisual(element: number): void {
    this.ultElement = element;
    this.ultFilled = 0;
    this.ultimateSlots.forEach((slot) => {
      slot.classList.remove("filled");
      slot.innerHTML = "";
    });
  }

  /** Fill one slot (called when the flying icon arrives). */
  fillUltimateSlot(i: number, element: number): void {
    if (i < 0 || i >= this.ultimateSlots.length || element <= 0) return;
    const slot = this.ultimateSlots[i];
    slot.classList.add("filled");
    slot.innerHTML = `<img src="${elementIconDataURL(element)}" alt="" />`;
    this.ultFilled = Math.max(this.ultFilled, i + 1);
  }

  /** Screen center of the i-th ultimate slot (for fly-in animation). */
  ultimateSlotCenter(i: number): { x: number; y: number } | null {
    const slot = this.ultimateSlots[Math.max(0, Math.min(this.ultimateSlots.length - 1, i))];
    if (!slot) return null;
    const r = slot.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  popUltimateSlot(i: number): void {
    const slot = this.ultimateSlots[Math.max(0, Math.min(this.ultimateSlots.length - 1, i))];
    if (!slot) return;
    slot.classList.remove("pop");
    void slot.offsetWidth;
    slot.classList.add("pop");
  }

  setAiming(on: boolean): void {
    this.useBtn.classList.toggle("selected", on);
    document.body.classList.toggle("aim-mode", on);
  }

  /**
   * Show/refresh the owned-coin tray (next to the ultimate, usable anytime).
   * `coins` lists every owned coin; click events are delegated via data-boss.
   */
  updateBossCoinTray(state: {
    enabled: boolean;
    remaining: number;
    total: number;
    coins: Array<{ bossId: string; name: string; desc: string; icon: string }>;
  }): void {
    if (!state.enabled || state.coins.length === 0) {
      this.bossCoinTray.classList.add("hidden");
      return;
    }
    this.bossCoinTray.classList.remove("hidden");
    this.bossCoinLabel.textContent = `硬币 ${Math.max(0, state.remaining)}/${state.total}`;
    const usable = state.remaining > 0 && !this.coinBusy;
    this.bossCoinTray.classList.toggle("ready-glow", usable);

    const sig = state.coins.map((c) => c.bossId).join("|") + (usable ? "1" : "0");
    if (this.bossCoinCoins.dataset.sig === sig) return;
    this.bossCoinCoins.dataset.sig = sig;
    this.bossCoinCoins.innerHTML = "";
    for (const c of state.coins) {
      const btn = document.createElement("button");
      btn.className = "bosscoin-coin";
      btn.dataset.boss = c.bossId;
      btn.disabled = !usable;
      btn.title = `${c.name}：${c.desc}`;
      btn.innerHTML = `<img src="${c.icon}" alt="" />`;
      this.bossCoinCoins.appendChild(btn);
    }
  }

  get bossCoinIsBusy(): boolean {
    return this.coinBusy;
  }

  /** Throw the coin: rise, spin, reveal heads (success) or tails (failure). */
  async playCoinToss(success: boolean, anim: BossCoinAnimation, icon: string): Promise<void> {
    this.coinBusy = true;
    this.bossCoinCoins.querySelectorAll("button").forEach((b) => {
      (b as HTMLButtonElement).disabled = true;
    });
    this.coinOverlay.classList.remove("hidden");
    this.coinOverlay.innerHTML = "";

    const scale = anim.scale > 0 ? anim.scale : 2;
    const coin = div("coin3d");
    coin.innerHTML =
      `<div class="coin-face coin-front"><img src="${icon}" alt="" /></div>` +
      `<div class="coin-face coin-back"><span>★</span></div>`;
    this.coinOverlay.appendChild(coin);

    await delay(Math.max(0, anim.tossStartDelay) * 1000);

    const span = Math.max(0, anim.maxSpinTurns - anim.minSpinTurns);
    const turns = anim.minSpinTurns + Math.floor(Math.random() * (span + 1));
    const total = Math.max(0.08, anim.tossUpDuration + anim.spinDuration + anim.settleDuration);
    const upFrac = Math.min(0.9, Math.max(0.1, anim.tossUpDuration / total));
    const finalX = success ? turns * 360 + 180 : turns * 360;
    const rise = Math.min(Math.max(60, anim.tossHeight), window.innerHeight * 0.36);

    const a = coin.animate(
      [
        { transform: `translateY(0) rotateX(0deg) scale(${scale})` },
        { transform: `translateY(${-rise}px) rotateX(${finalX * upFrac}deg) scale(${scale})`, offset: upFrac },
        { transform: `translateY(0) rotateX(${finalX}deg) scale(${scale})` },
      ],
      { duration: total * 1000, easing: "ease-in-out", fill: "forwards" }
    );
    await a.finished.catch(() => undefined);

    coin.classList.add(success ? "coin-success" : "coin-fail");
    this.spawnCoinParticles(success);
    await delay(Math.max(0, anim.revealDuration + anim.resultPauseDuration) * 1000);

    this.coinOverlay.classList.add("hidden");
    this.coinOverlay.innerHTML = "";
    this.coinBusy = false;
    this.bossCoinCoins.dataset.sig = "";
  }

  private spawnCoinParticles(success: boolean): void {
    const n = 16;
    for (let i = 0; i < n; i++) {
      const p = div("coin-particle");
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 50 + Math.random() * 70;
      p.style.background = success ? (i % 2 ? "#FFD866" : "#FFB302") : "#8A8F99";
      this.coinOverlay.appendChild(p);
      p.animate(
        [
          { transform: `translate(-50%,-50%) translate(0,0) scale(1)`, opacity: 1 },
          { transform: `translate(-50%,-50%) translate(${Math.cos(a) * dist}px, ${Math.sin(a) * dist}px) scale(0)`, opacity: 0 },
        ],
        { duration: success ? 520 : 620, easing: "ease-out", fill: "forwards" }
      );
    }
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
    const blockerGoals = board.blockerProgress();
    const sig =
      goals.map((g) => `t${g.tileType}:${g.required}`).join("|") +
      "||" +
      blockerGoals.map((g) => `b${g.typeId}:${g.required}`).join("|");
    if (sig !== this.goalSig) {
      this.goalSig = sig;
      this.goalChips.clear();
      this.blockerChips.clear();
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
      for (const g of blockerGoals) {
        const chip = div("goal-chip goal-blocker");
        const img = document.createElement("img");
        img.className = "goal-icon";
        img.src = blockerIconDataURL(g.typeId);
        img.alt = `blocker ${g.typeId}`;
        const label = document.createElement("b");
        label.className = "goal-count";
        label.textContent = `${g.current}/${g.required}`;
        chip.append(img, label);
        this.goalRow.appendChild(chip);
        this.blockerChips.set(g.typeId, chip);
      }
    } else {
      for (const g of goals) {
        const chip = this.goalChips.get(g.tileType);
        const count = chip?.querySelector(".goal-count") as HTMLElement | null;
        if (count) count.textContent = `${g.current}/${g.required}`;
      }
      for (const g of blockerGoals) {
        const chip = this.blockerChips.get(g.typeId);
        const count = chip?.querySelector(".goal-count") as HTMLElement | null;
        if (count) count.textContent = `${g.current}/${g.required}`;
      }
    }

    this.renderBoss(board);
  }

  /** Screen center of a blocker goal chip (typeId 0 = total). */
  blockerChipCenter(typeId: number): { x: number; y: number } | null {
    const chip = this.blockerChips.get(typeId) ?? this.blockerChips.get(0);
    if (!chip) return null;
    const r = chip.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  popBlockerGoal(typeId: number): void {
    const chip = this.blockerChips.get(typeId) ?? this.blockerChips.get(0);
    if (!chip) return;
    chip.classList.remove("pop");
    void chip.offsetWidth;
    chip.classList.add("pop");
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
      const img = document.createElement("img");
      img.className = "weak-icon";
      img.src = elementIconDataURL(w.tileType);
      img.alt = `weakness ${w.tileType}`;
      const txt = document.createElement("span");
      txt.textContent = `×${w.damage}`;
      chip.append(img, txt);
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
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
