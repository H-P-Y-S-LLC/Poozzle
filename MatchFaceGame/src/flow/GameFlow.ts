/**
 * Game flow: level enter / play / settle / progression.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §7.
 */
import type { ConfigLoader, LevelBossMeta } from "../config/ConfigLoader.js";
import { selectMatch3Levels, type ManifestEntry } from "../config/LevelManifest.js";
import { parseThemeConfig, type LevelMapConfig } from "../config/ThemeConfig.js";
import { FinishReason } from "../logic/Match3Types.js";
import { BoardLogic } from "../logic/BoardLogic.js";
import { SceneRoot } from "../view/SceneRoot.js";
import { BoardView } from "../view/BoardView.js";
import { BoardController } from "../bridge/BoardController.js";
import { HudView } from "../ui/HudView.js";
import { LevelMapView } from "../ui/LevelMapView.js";
import { BossView } from "../view/BossView.js";
import { AudioBus } from "../audio/AudioBus.js";
import { MusicGenerator } from "../audio/MusicGenerator.js";
import { elementIconDataURL } from "../proc/ElementIconFactory.js";
import type { BoardEvent } from "../logic/BoardLogic.js";
import * as THREE from "three";
import type { I18n } from "../ui/i18n.js";
import { createLogger } from "../core/Logger.js";

const log = createLogger("GameFlow");
const SAVE_KEY = "matchface.save.v1";

const DEFAULT_LEVEL_MAP: LevelMapConfig = {
  levelsPerChunk: 12,
  bossOrderOffset: -110,
  designWidth: 1376,
  designHeight: 1376,
  pathStyle: { thickness: 0, lockedColor: "", unlockedColor: "", clearedColor: "" },
  modeStateIconSizeByModeId: {},
};

interface SaveData {
  unlocked: string[];
  stars: Record<string, number>;
  best: Record<string, number>;
}

export class GameFlow {
  private container: HTMLElement;
  private loader: ConfigLoader;
  private i18n: I18n;
  private hud: HudView;
  private scene: SceneRoot;

  private entries: ManifestEntry[] = [];
  private save: SaveData = loadSave();
  private index = 0;
  private board: BoardLogic | null = null;
  private view: BoardView | null = null;
  private controller: BoardController | null = null;
  private bossView: BossView | null = null;
  private mapView: LevelMapView;
  private levelMapCfg: LevelMapConfig = DEFAULT_LEVEL_MAP;
  private busy = false;
  private timedAccum = 0;
  private celebrating = false;
  private audio = new AudioBus();
  private music = new MusicGenerator(this.audio);
  private bossMeta = new Map<string, LevelBossMeta>();
  private listenerForward = new THREE.Vector3();

  constructor(container: HTMLElement, loader: ConfigLoader, i18n: I18n, hud: HudView, uiRoot: HTMLElement) {
    this.container = container;
    this.loader = loader;
    this.i18n = i18n;
    this.hud = hud;
    this.mapView = new LevelMapView(uiRoot, i18n, this.levelMapCfg);
    this.scene = new SceneRoot(container);
    this.scene.setFrameCallback((dt) => this.onFrame(dt));
    this.scene.start();
    this.buildToolbar();
    const unlock = () => {
      this.audio.resume();
      this.music.start();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
  }

  private onFrame(dt: number): void {
    // keep the Web Audio listener aligned with the camera for spatial sfx
    this.scene.camera.getWorldDirection(this.listenerForward);
    const cam = this.scene.camera.position;
    this.audio.updateListener(
      { x: cam.x, y: cam.y, z: cam.z },
      { x: this.listenerForward.x, y: this.listenerForward.y, z: this.listenerForward.z }
    );

    this.bossView?.update(dt);
    this.view?.update(dt);
    const board = this.board;
    if (!board) return;
    const now = performance.now() / 1000;
    if (board.updateCorrosion(now)) {
      this.view?.syncFromBoard();
      this.hud.update(board, this.entries[this.index]?.displayName ?? "");
    }
    this.timedAccum += dt;
    if (this.timedAccum >= 0.25 && !this.busy) {
      this.timedAccum = 0;
      const events = board.updateBossTimed(now);
      if (events.length) {
        this.bossView?.onEvents(events);
        void this.view?.playEvents(events, (e) => this.onBoardEvent(e)).then(() => {
          if (this.board) this.hud.update(this.board, this.entries[this.index]?.displayName ?? "");
        });
      }
    }
  }

  private buildToolbar(): void {
    const bar = document.createElement("div");
    bar.className = "hud-toolbar";
    const mapBtn = document.createElement("button");
    mapBtn.className = "btn ghost";
    mapBtn.textContent = this.i18n.t("map");
    mapBtn.addEventListener("click", () => this.openLevelSelect());
    const langBtn = document.createElement("button");
    langBtn.className = "btn ghost";
    langBtn.textContent = this.i18n.lang === "en" ? "中文" : "EN";
    langBtn.addEventListener("click", () => {
      this.i18n.toggle();
      langBtn.textContent = this.i18n.lang === "en" ? "中文" : "EN";
      if (this.board) this.hud.update(this.board, this.entries[this.index]?.displayName ?? "");
    });
    const soundBtn = document.createElement("button");
    soundBtn.className = "btn ghost active";
    soundBtn.textContent = "🔊";
    soundBtn.addEventListener("click", () => {
      this.audio.resume();
      const muted = this.audio.toggleMute();
      soundBtn.textContent = muted ? "🔇" : "🔊";
      soundBtn.classList.toggle("active", !muted);
    });
    const musicBtn = document.createElement("button");
    musicBtn.className = "btn ghost active";
    musicBtn.textContent = "🎵";
    musicBtn.addEventListener("click", () => {
      this.audio.resume();
      this.music.start();
      const muted = this.audio.toggleMusic();
      musicBtn.textContent = muted ? "🎵̶" : "🎵";
      musicBtn.classList.toggle("active", !muted);
    });
    bar.append(soundBtn, musicBtn, mapBtn, langBtn);
    this.container.appendChild(bar);
  }

  async boot(): Promise<void> {
    this.hud.setLoading(true);
    try {
      const manifest = await this.loader.loadManifest();
      this.entries = selectMatch3Levels(manifest);
      if (this.entries.length === 0) throw new Error("No enabled match3 levels in manifest");

      // boss flags for the map (also warms the level cache)
      this.bossMeta = await this.loader.prefetchBossMeta(this.entries);

      // theme (semantic only) — optional
      try {
        const themeJson = await this.loader.loadRaw("theme_asset_config.json");
        this.levelMapCfg = parseThemeConfig(themeJson).levelMap;
      } catch (err) {
        log.warn("theme_asset_config.json unavailable, using map defaults", err);
      }

      // seed unlock state
      const unlocked = new Set(this.save.unlocked);
      for (const e of this.entries) if (e.bInitiallyUnlocked) unlocked.add(e.levelId);
      this.save.unlocked = [...unlocked];
      persist(this.save);

      const requested = new URLSearchParams(location.search).get("level");
      const requestedIndex = requested ? this.entries.findIndex((e) => e.levelId === requested) : -1;
      if (requestedIndex >= 0) {
        await this.startLevel(requestedIndex);
      } else {
        this.openLevelSelect();
      }
    } catch (err) {
      log.error("boot failed", err);
      throw err;
    } finally {
      this.hud.setLoading(false);
    }
  }

  async startLevel(index: number): Promise<void> {
    const entry = this.entries[index];
    if (!entry) return;
    this.index = index;
    this.hud.setLoading(true);
    this.hud.hideOverlay();
    this.mapView.hide();
    this.celebrating = false;
    this.busy = true;

    try {
      // tear down previous
      this.controller?.dispose();
      this.controller = null;
      this.view?.dispose();
      this.view = null;
      this.bossView?.dispose();
      this.bossView = null;

      const level = await this.loader.loadLevel(entry.configFile);
      const bossConfig = level.Boss.bEnabled ? await this.loader.resolveBoss(level.Boss.raw) : null;
      this.scene.layoutBoard(level.Board.Rows, level.Board.Cols);
      const board = new BoardLogic(level, undefined, bossConfig);
      const view = new BoardView(this.scene, board);
      this.bossView =
        bossConfig && bossConfig.bEnabled
          ? new BossView(this.scene, bossConfig.bossId, level.Board.Rows, level.Board.Cols)
          : null;
      this.board = board;
      this.view = view;
      this.controller = new BoardController(this.scene, view, board, {
        isBusy: () => this.busy,
        onSwap: (a, b) => void this.handleSwap(a, b),
        onActivate: (c) => void this.handleActivate(c),
        onSelect: () => this.audio.play("select"),
      });
      this.hud.update(board, entry.displayName || entry.levelId);
      log.info(
        `level ${entry.levelId} seed=${board.randomSeed} size=${board.rows}x${board.cols} boss=${bossConfig?.bossId ?? "-"}`
      );
    } finally {
      this.busy = false;
      this.hud.setLoading(false);
    }
  }

  private onBoardEvent(e: BoardEvent): void {
    switch (e.type) {
      case "clear": {
        const at = e.indices.length ? this.cellPos(e.indices[0]) : this.origin();
        this.audio.playAt("clear", { combo: e.comboIndex, tileType: e.tileTypes[0] }, at);
        if (e.specialsSpawned.length) this.audio.playAt("specialCreate", {}, this.cellPos(e.specialsSpawned[0].index));
        // per-element shatter crackle (capped to avoid noise)
        const shatters = Math.min(4, e.indices.length);
        for (let i = 0; i < shatters; i++) {
          this.audio.playAt("shatter", { pitch: 0.9 + i * 0.09 }, this.cellPos(e.indices[i]));
        }
        this.spawnGoalFlights(e.clearedTiles);
        break;
      }
      case "blockerHit": {
        const broken = e.hits.find((h) => h.broken);
        if (broken) this.audio.playAt("blockerBreak", {}, this.cellPos(broken.index));
        break;
      }
      case "bossHp":
        if (e.delta < 0) this.audio.playAt("bossHit", {}, this.bossPos());
        break;
      case "bossSkill":
      case "bossPhase":
      case "bossConvert":
        this.audio.playAt("skill", {}, this.bossPos());
        break;
      default:
        break;
    }
  }

  private cellPos(index: number): { x: number; y: number; z: number } {
    if (!this.view || !this.board) return this.origin();
    const { row, col } = this.board.coord(index);
    const p = this.view.cellWorld(row, col);
    return { x: p.x, y: p.y + 0.3, z: p.z };
  }

  private bossPos(): { x: number; y: number; z: number } {
    const g = this.bossView?.group;
    if (!g) return this.origin();
    return { x: g.position.x, y: g.position.y + 1, z: g.position.z };
  }

  private origin(): { x: number; y: number; z: number } {
    return { x: 0, y: 0.5, z: 0 };
  }

  /** Fly cleared goal-type elements to their HUD goal chip, then shatter there. */
  private spawnGoalFlights(cleared: Array<{ index: number; tileType: number; special: number }>): void {
    if (!this.board || !this.view) return;
    const goalTypes = new Set(this.board.config.Goal.Collect.map((g) => g.TileType));
    if (goalTypes.size === 0) return;
    let spawned = 0;
    for (const ct of cleared) {
      if (ct.special !== 0 || ct.tileType <= 0) continue;
      if (!goalTypes.has(ct.tileType)) continue;
      if (spawned >= 8) break;
      const { row, col } = this.board.coord(ct.index);
      const start = this.view.worldToScreen(this.view.cellWorld(row, col));
      const end = this.hud.goalChipCenter(ct.tileType);
      if (!end) continue;
      this.flyGhost(ct.tileType, start, end);
      spawned++;
    }
  }

  private flyGhost(tileType: number, start: { x: number; y: number }, end: { x: number; y: number }): void {
    const img = document.createElement("img");
    img.className = "collect-ghost";
    img.src = elementIconDataURL(tileType);
    img.style.left = `${start.x}px`;
    img.style.top = `${start.y}px`;
    document.body.appendChild(img);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    let finished = false;
    const done = (): void => {
      if (finished) return;
      finished = true;
      img.remove();
      this.hud.popGoal(tileType);
    };
    requestAnimationFrame(() => {
      img.style.transform = `translate(${dx}px, ${dy}px) scale(0.45) rotate(180deg)`;
      img.style.opacity = "0.15";
    });
    img.addEventListener("transitionend", done, { once: true });
    window.setTimeout(done, 650);
  }

  private async handleSwap(a: { row: number; col: number }, b: { row: number; col: number }): Promise<void> {
    if (!this.board || !this.view) return;
    this.busy = true;
    try {
      const res = this.board.trySwap(a, b);
      if (res.accepted) {
        this.audio.playAt("swap", {}, this.cellPos(this.board.index(a.row, a.col)));
      } else {
        this.audio.play("swapInvalid");
      }
      // swap animation first; invalid swaps bounce back, then (only if accepted) resolve
      await this.view.animateSwap(a, b, res.accepted);
      if (res.accepted) {
        await this.view.playEvents(res.events, (e) => this.onBoardEvent(e));
        this.bossView?.onEvents(res.events);
      }
      this.hud.update(this.board, this.entries[this.index].displayName);
      this.checkFinish();
    } finally {
      this.busy = false;
    }
  }

  private async handleActivate(c: { row: number; col: number }): Promise<void> {
    if (!this.board || !this.view) return;
    this.busy = true;
    try {
      const res = this.board.activateSpecialAt(c);
      if (res.accepted) {
        this.audio.play("specialExplode");
        await this.view.playEvents(res.events, (e) => this.onBoardEvent(e));
        this.bossView?.onEvents(res.events);
      }
      this.hud.update(this.board, this.entries[this.index].displayName);
      this.checkFinish();
    } finally {
      this.busy = false;
    }
  }

  private checkFinish(): void {
    if (!this.board) return;
    if (!this.board.levelFinished) return;
    const entry = this.entries[this.index];
    const snap = this.board.snapshot();
    this.audio.play(snap.victory ? "victory" : "defeat");
    if (snap.victory) {
      this.save.stars[entry.levelId] = Math.max(this.save.stars[entry.levelId] ?? 0, snap.stars);
      this.save.best[entry.levelId] = Math.max(this.save.best[entry.levelId] ?? 0, snap.score);
      this.unlockNext(entry);
      persist(this.save);
    }
    const reason = snap.victory
      ? FinishReason[FinishReason.GoalReached]
      : FinishReason[snap.finishReason] ?? "Finished";
    const showSettle = (): void =>
      this.hud.showSettlement(
        { victory: snap.victory, score: snap.score, stars: snap.stars, reason },
        () => void this.startLevel(this.index),
        () => void this.startLevel(Math.min(this.entries.length - 1, this.index + 1)),
        () => this.openLevelSelect()
      );
    if (this.celebrating) {
      showSettle();
      return;
    }
    this.celebrating = true;
    this.hud.showCelebration(snap.victory, showSettle);
  }

  /** Debug/testing helper: performs one valid move and awaits its animation. */
  async debugAutoMove(): Promise<boolean> {
    if (!this.board) return false;
    const move = this.board.findOnePossibleSwap();
    if (!move) return false;
    await this.handleSwap(move[0], move[1]);
    return true;
  }

  get debugBoard(): BoardLogic | null {
    return this.board;
  }

  private unlockNext(entry: ManifestEntry): void {
    const unlocked = new Set(this.save.unlocked);
    for (const eff of entry.outcomes.firstWinEffects) {
      if (eff.type === "UnlockLevel" && eff.targetId) unlocked.add(eff.targetId);
    }
    const next = this.entries.find((e) => e.order === entry.order + 1);
    if (next) unlocked.add(next.levelId);
    this.save.unlocked = [...unlocked];
  }

  private openLevelSelect(): void {
    this.mapView.show(
      [...this.entries].sort((a, b) => a.order - b.order),
      { unlocked: new Set(this.save.unlocked), stars: this.save.stars },
      this.bossMeta,
      (e) => {
        const i = this.entries.indexOf(e);
        if (i >= 0) {
          this.mapView.hide();
          void this.startLevel(i);
        }
      },
      () => this.mapView.hide()
    );
  }
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveData;
      return { unlocked: parsed.unlocked ?? [], stars: parsed.stars ?? {}, best: parsed.best ?? {} };
    }
  } catch {
    /* ignore */
  }
  return { unlocked: [], stars: {}, best: {} };
}

function persist(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
