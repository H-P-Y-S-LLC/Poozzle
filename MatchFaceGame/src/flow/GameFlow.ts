/**
 * Game flow: level enter / play / settle / progression.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §7.
 */
import type { ConfigLoader, LevelBossMeta } from "../config/ConfigLoader.js";
import { selectMatch3Levels, type ManifestEntry } from "../config/LevelManifest.js";
import { parseThemeConfig, type LevelMapConfig } from "../config/ThemeConfig.js";
import { BoardState, FinishReason, type Coord } from "../logic/Match3Types.js";
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
import { blockerIconDataURL } from "../proc/BlockerIconFactory.js";
import { tileColor } from "../proc/Palette.js";
import { bossCoinIconDataURL } from "../proc/BossCoinIconFactory.js";
import { itemIconDataURL } from "../proc/ItemIconFactory.js";
import { coinProbability, type BossCoinConfig, type BossCoinSkill } from "../config/BossCoinConfig.js";
import type { ItemCatalog, ItemDef } from "../config/ItemConfig.js";
import type {
  CurrencyCatalog,
  ItemLevelLimitsConfig,
  ProductCatalog,
  RewardBundle,
  RewardRulesConfig,
} from "../config/EconomyConfig.js";
import type { BoardEvent } from "../logic/BoardLogic.js";
import * as THREE from "three";
import type { I18n } from "../ui/i18n.js";
import { createLogger } from "../core/Logger.js";

const log = createLogger("GameFlow");
const SAVE_KEY = "matchface.save.v1";
/** Coin tosses allowed per level, any coin type. The 3rd is a guaranteed hit if the first two miss. */
const BOSS_COIN_TOSSES_PER_LEVEL = 3;
/** Seconds without an elimination before the board hints a valid swap. */
const IDLE_HINT_SECONDS = 30;
/** Starter inventory granted on first run (each item). */
const STARTER_ITEMS = 3;
/** Levels with an order up to this value are unlocked by default. */
const DEFAULT_UNLOCKED_MAX_ORDER = 19;
/** localStorage flag: the "add to home screen" hint has been dismissed for good. */
const INSTALL_HINT_KEY = "matchface.installHintDismissed";

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
  /** Boss ids whose skill coin has been earned (defeat a boss -> earn its coin). */
  bossCoins: string[];
  /** Item id -> owned count. */
  items: Record<string, number>;
  /** Currency id -> amount (coin / gem). */
  wallet: Record<string, number>;
  /** levelId -> itemId -> equipped count. */
  loadouts: Record<string, Record<string, number>>;
  /** Last level the player entered; used to auto-resume on next visit. */
  lastPlayed: string;
}

export class GameFlow {
  private container: HTMLElement;
  private loader: ConfigLoader;
  private i18n: I18n;
  private hud: HudView;
  private uiRoot: HTMLElement;
  private scene: SceneRoot;
  private homeEl: HTMLElement | null = null;
  private installPrompt: (() => void) | null = null;

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
  private lastClearedForUlt: { index: number; tileType: number } | null = null;
  private lastUltCount = 0;
  private lastUltElement = 0;
  private shopBtn: HTMLButtonElement | null = null;
  private mapBtn: HTMLButtonElement | null = null;
  private aiming = false;
  private idleResetAt = performance.now();
  private hinting = false;
  private audio = new AudioBus();
  private music = new MusicGenerator(this.audio);
  private bossMeta = new Map<string, LevelBossMeta>();
  private bossCoinConfig: BossCoinConfig | null = null;
  private currentBossId = "";
  private itemCatalog: ItemCatalog | null = null;
  private currencyCatalog: CurrencyCatalog | null = null;
  private rewardRules: RewardRulesConfig | null = null;
  private itemLimits: ItemLevelLimitsConfig | null = null;
  private products: ProductCatalog | null = null;
  private itemUses = new Map<string, number>();
  private equipped = new Map<string, number>();
  private activeItem: string | null = null;
  private gloveFirst: Coord | null = null;
  private listenerForward = new THREE.Vector3();

  constructor(container: HTMLElement, loader: ConfigLoader, i18n: I18n, hud: HudView, uiRoot: HTMLElement) {
    this.container = container;
    this.loader = loader;
    this.i18n = i18n;
    this.hud = hud;
    this.uiRoot = uiRoot;
    this.mapView = new LevelMapView(uiRoot, i18n, this.levelMapCfg);
    this.scene = new SceneRoot(container);
    this.scene.setFrameCallback((dt) => this.onFrame(dt));
    this.scene.start();
    this.buildToolbar();
    this.hud.useButton.addEventListener("click", () => this.onUltimateButton());
    this.hud.bossCoinTrayEl.addEventListener("click", (e) => this.onBossCoinTrayClick(e));
    this.hud.itemBarEl.addEventListener("click", (e) => this.onItemBarClick(e));
    const unlock = () => {
      this.audio.resume();
      this.music.start();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      const ev = e as Event & { prompt?: () => Promise<void> };
      this.installPrompt = () => void ev.prompt?.();
    });
    window.addEventListener("appinstalled", () => {
      localStorage.setItem(INSTALL_HINT_KEY, "1");
      this.homeEl?.querySelector(".home-install")?.remove();
    });
    window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", (ev) => {
      if (ev.matches) {
        localStorage.setItem(INSTALL_HINT_KEY, "1");
        this.homeEl?.querySelector(".home-install")?.remove();
      }
    });
    // every UI button gets a click sound (HUD, level map, sheets, toolbars)
    document.addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target as HTMLElement | null;
        const el = t?.closest<HTMLElement>("button, .btn, .map-node, .map-cell");
        if (!el) return;
        // these have their own dedicated sounds
        if (el.matches(".item-btn, .bosscoin-coin, .ultimate-use")) return;
        const name = el.classList.contains("map-node") || el.classList.contains("map-cell")
          ? "uiLevel"
          : el.classList.contains("primary")
            ? "uiPrimary"
            : el.closest(".hud-toolbar")
              ? "uiNav"
              : "uiTap";
        this.audio.play(name);
      },
      true
    );
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
    this.hud.updateUltimate(board.ultimateState());
    this.updateIdleHint(board);
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

  /** Debounce: after 30s with no elimination, nudge a valid swap as a hint (wall-clock). */
  private updateIdleHint(board: BoardLogic): void {
    if (board.levelFinished || this.celebrating || this.mapView.visible) {
      this.resetIdleHint();
      return;
    }
    if ((performance.now() - this.idleResetAt) / 1000 < IDLE_HINT_SECONDS) return;
    if (this.busy || this.hinting || this.aiming || board.state !== BoardState.Idle) return;
    void this.playIdleHint(board);
  }

  private resetIdleHint(): void {
    this.idleResetAt = performance.now();
  }

  private async playIdleHint(board: BoardLogic): Promise<void> {
    const view = this.view;
    if (!view || this.hinting) return;
    const move = board.findOnePossibleSwap();
    if (!move) {
      this.resetIdleHint();
      return;
    }
    this.hinting = true;
    try {
      await view.hintSwap(move[0], move[1]);
    } finally {
      this.hinting = false;
      this.resetIdleHint();
    }
  }

  private buildToolbar(): void {
    const bar = document.createElement("div");
    bar.className = "hud-toolbar";
    const mapBtn = document.createElement("button");
    mapBtn.className = "btn ghost";
    mapBtn.textContent = this.i18n.t("map");
    mapBtn.addEventListener("click", () => this.openLevelSelect());
    this.mapBtn = mapBtn;
    const shopBtn = document.createElement("button");
    shopBtn.className = "btn ghost";
    shopBtn.textContent = this.i18n.t("shop");
    shopBtn.addEventListener("click", () => this.openShop());
    this.shopBtn = shopBtn;
    const langBtn = document.createElement("button");
    langBtn.className = "btn ghost";
    langBtn.textContent = this.i18n.lang === "en" ? "中文" : "EN";
    langBtn.addEventListener("click", () => {
      this.i18n.toggle();
      langBtn.textContent = this.i18n.lang === "en" ? "中文" : "EN";
      shopBtn.textContent = this.i18n.t("shop");
      mapBtn.textContent = this.i18n.t("map");
      this.refreshBossCoin();
      this.refreshItems();
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
    bar.append(soundBtn, musicBtn, shopBtn, mapBtn, langBtn);
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

      // boss coin skills — optional
      try {
        this.bossCoinConfig = await this.loader.loadBossCoins();
      } catch (err) {
        log.warn("boss_coin_skills.json unavailable, boss coins disabled", err);
      }

      // item catalog — optional; grant starter stock on first run
      try {
        this.itemCatalog = await this.loader.loadItems();
        if (Object.keys(this.save.items).length === 0) {
          for (const it of this.itemCatalog.items) this.save.items[it.id] = STARTER_ITEMS;
          persist(this.save);
        }
      } catch (err) {
        log.warn("catalog/items.json unavailable, items disabled", err);
      }

      // economy: currencies, rewards, loadout limits, shop, life
      try {
        this.currencyCatalog = await this.loader.loadCurrencies();
        if (Object.keys(this.save.wallet).length === 0) {
          for (const c of this.currencyCatalog.currencies) this.save.wallet[c.id] = c.initial;
          persist(this.save);
        }
      } catch (err) {
        log.warn("catalog/currencies.json unavailable", err);
      }
      try {
        this.rewardRules = await this.loader.loadRewardRules();
      } catch (err) {
        log.warn("reward/reward_rules.json unavailable", err);
      }
      try {
        this.itemLimits = await this.loader.loadItemLevelLimits();
      } catch (err) {
        log.warn("catalog/item_level_limits.json unavailable", err);
      }
      try {
        this.products = await this.loader.loadProducts();
      } catch (err) {
        log.warn("catalog/products.json unavailable", err);
      }
      this.refreshWallet();

      // seed unlock state
      const unlocked = new Set(this.save.unlocked);
      for (const e of this.entries) if (e.bInitiallyUnlocked) unlocked.add(e.levelId);
      for (const e of this.entries) {
        if (e.order >= 1 && e.order <= DEFAULT_UNLOCKED_MAX_ORDER) unlocked.add(e.levelId);
      }
      this.save.unlocked = [...unlocked];
      persist(this.save);

      const requested = new URLSearchParams(location.search).get("level");
      const requestedIndex = requested ? this.entries.findIndex((e) => e.levelId === requested) : -1;
      if (requestedIndex >= 0) {
        await this.startLevel(requestedIndex);
      } else {
        // home screen first; the level map opens after the player taps PLAY
        this.showHome();
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
    this.save.lastPlayed = entry.levelId;
    persist(this.save);
    this.hud.setLoading(true);
    this.hud.hideOverlay();
    this.mapView.hide();
    if (this.shopBtn) this.shopBtn.classList.add("hidden"); // shop entry is map-only
    if (this.mapBtn) this.mapBtn.classList.remove("hidden"); // map button is in-game only
    this.endAim();
    this.lastUltCount = 0;
    this.lastUltElement = 0;
    this.lastClearedForUlt = null;
    this.hud.setUltimateAnimating(false);
    this.celebrating = false;
    this.resetIdleHint();
    this.hinting = false;
    this.itemUses.clear();
    this.equipped = this.buildEquipped(entry.levelId);
    this.cancelItem();
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
      const isBoss = !!(bossConfig && bossConfig.bEnabled);
      const portrait = window.innerHeight > window.innerWidth;
      this.music.setMode(isBoss ? "boss" : "level");
      const board = new BoardLogic(level, undefined, bossConfig);
      const usable = board.cells.map((c) => c.bUsable);
      this.scene.layoutBoard(level.Board.Rows, level.Board.Cols, 1, usable);
      this.scene.setBossStrip(isBoss ? (portrait ? 2.6 : 2.2) : 0);
      const view = new BoardView(this.scene, board);
      this.bossView = isBoss ? new BossView(this.scene, bossConfig!.bossId, level.Board.Rows, portrait ? 4.3 : 2.8, portrait ? 0.34 : 0.52) : null;
      this.board = board;
      this.view = view;
      this.controller = new BoardController(this.scene, view, board, {
        isBusy: () => this.busy || this.hinting,
        onSwap: (a, b) => void this.handleSwap(a, b),
        onActivate: (c) => void this.handleActivate(c),
        onSelect: () => this.audio.play("select"),
        onBlockedSwap: (a, b) => void this.handleBlockedSwap(a, b),
        onUltimate: (c) => void this.handleUltimate(c),
      });
      this.hud.resetGoals();
      this.hud.update(board, entry.displayName || entry.levelId);
      this.hud.setBossLevel(isBoss);
      this.setupBossCoin(board, isBoss ? bossConfig!.bossId : "");
      this.refreshItems();
      log.info(
        `level ${entry.levelId} seed=${board.randomSeed} size=${board.rows}x${board.cols} boss=${bossConfig?.bossId ?? "-"}`
      );
    } finally {
      this.busy = false;
      this.refreshItems(); // enable the equipped item buttons now that loading is done
      this.hud.setLoading(false);
    }
  }

  private onBoardEvent(e: BoardEvent): void {
    switch (e.type) {
      case "clear": {
        this.resetIdleHint(); // any elimination restarts the idle-hint timer
        const at = e.indices.length ? this.cellPos(e.indices[0]) : this.origin();
        this.audio.playAt("clear", { combo: e.comboIndex, tileType: e.tileTypes[0] }, at);
        if (e.specialsSpawned.length) this.audio.playAt("specialCreate", {}, this.cellPos(e.specialsSpawned[0].index));
        // per-element shatter crackle (capped to avoid noise)
        const shatters = Math.min(4, e.indices.length);
        for (let i = 0; i < shatters; i++) {
          this.audio.playAt("shatter", { pitch: 0.9 + i * 0.09 }, this.cellPos(e.indices[i]));
        }
        this.spawnGoalFlights(e.clearedTiles);
        this.spawnWeaknessFlights(e.clearedTiles);
        const firstTile = e.clearedTiles.find((t) => t.tileType > 0);
        this.lastClearedForUlt = firstTile ? { index: firstTile.index, tileType: firstTile.tileType } : null;
        break;
      }
      case "ultimate": {
        const st = this.board?.ultimateState();
        if (st && st.enabled && st.element > 0 && this.view) {
          const changed = st.element !== this.lastUltElement || st.count > this.lastUltCount;
          if (changed && this.lastClearedForUlt && this.board) {
            const { row, col } = this.board.coord(this.lastClearedForUlt.index);
            const start = this.view.worldToScreen(this.view.cellWorld(row, col));
            const end = this.hud.ultimateSlotCenter(st.count - 1);
            const slotIndex = st.count - 1;
            const element = st.element;
            if (end) {
              this.hud.setUltimateAnimating(true);
              this.flyGhost(elementIconDataURL(element), start, end, () => {
                this.hud.fillUltimateSlot(slotIndex, element);
                this.hud.popUltimateSlot(slotIndex);
                this.hud.setUltimateAnimating(false);
              });
            }
          }
          this.lastUltCount = st.count;
          this.lastUltElement = st.element;
        }
        break;
      }
      case "blockerHit": {
        const broken = e.hits.find((h) => h.broken);
        if (broken) this.audio.playAt("blockerBreak", {}, this.cellPos(broken.index));
        this.spawnBlockerFlights(e.hits);
        break;
      }
      case "bossHp":
        break;
      case "bossSkill":
      case "bossPhase":
      case "bossConvert":
        this.audio.playAt("skill", {}, this.bossPos());
        break;
      case "bossTargets": {
        this.audio.playAt("skill", {}, this.bossPos());
        this.spawnBossProjectiles(e.indices, e.color);
        break;
      }
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
    for (const ct of cleared) {
      if (ct.special !== 0 || ct.tileType <= 0) continue;
      if (!goalTypes.has(ct.tileType)) continue;
      const { row, col } = this.board.coord(ct.index);
      const start = this.view.worldToScreen(this.view.cellWorld(row, col));
      const end = this.hud.goalChipCenter(ct.tileType);
      if (!end) continue;
      const type = ct.tileType;
      this.flyGhost(elementIconDataURL(type), start, end, () => {
        this.audio.play("goalAbsorb", { pitch: 0.95 + Math.random() * 0.12 });
        this.hud.popGoal(type); // pop, then the remaining count drops
        this.hud.bumpGoal(type, 1);
      });
    }
  }

  /** Fly broken blockers to their blocker goal chip, then pop it. */
  private spawnBlockerFlights(hits: Array<{ index: number; blockerType: number; broken: boolean }>): void {
    if (!this.board || !this.view) return;
    const progress = this.board.blockerProgress();
    if (progress.length === 0) return;
    for (const hit of hits) {
      if (!hit.broken) continue;
      const end = this.hud.blockerChipCenter(hit.blockerType);
      if (!end) continue;
      const { row, col } = this.board.coord(hit.index);
      const start = this.view.worldToScreen(this.view.cellWorld(row, col));
      const type = hit.blockerType;
      this.flyGhost(blockerIconDataURL(type), start, end, () => {
        this.audio.play("goalAbsorb", { pitch: 0.8 + Math.random() * 0.1 });
        this.hud.popBlockerGoal(type);
        this.hud.bumpBlockerGoal(type, 1);
      });
    }
  }

  /** Fly cleared weakness elements to the boss, then trigger its hit reaction. */
  private spawnWeaknessFlights(cleared: Array<{ index: number; tileType: number; special: number }>): void {
    const board = this.board;
    const view = this.view;
    const bossView = this.bossView;
    const boss = board?.boss;
    if (!board || !view || !bossView || !boss) return;
    const weak = new Set(boss.weaknessTileTypes().map((w) => w.tileType));
    if (weak.size === 0) return;
    const gp = bossView.group.position;
    const end = view.worldToScreen(new THREE.Vector3(gp.x, gp.y + 0.5, gp.z));
    let spawned = 0;
    for (const ct of cleared) {
      if (ct.special !== 0 || ct.tileType <= 0) continue;
      if (!weak.has(ct.tileType)) continue;
      if (spawned >= 6) break;
      const { row, col } = board.coord(ct.index);
      const start = view.worldToScreen(view.cellWorld(row, col));
      this.flyGhost(elementIconDataURL(ct.tileType), start, end, () => {
        bossView.hit(1);
        this.audio.play("bossHit", { pitch: 1 + Math.random() * 0.1 });
      });
      spawned++;
    }
  }

  /** Boss skill particles streaming from the boss to each affected cell. */
  private spawnBossProjectiles(indices: number[], color = 0x9fbcff): void {
    const bv = this.bossView;
    const view = this.view;
    if (!bv || !view || indices.length === 0) return;
    const gp = bv.group.position;
    const from = { x: gp.x, y: gp.y + 0.4, z: gp.z };
    for (const idx of indices.slice(0, 12)) view.bossProjectile(from, idx, color);
  }

  /** Fly one collected element to its target: drop clearly out of its cell first, then arc over. */
  private flyGhost(src: string, start: { x: number; y: number }, end: { x: number; y: number }, onArrive: () => void): void {
    const img = document.createElement("img");
    img.className = "collect-ghost";
    img.src = src;
    img.style.left = `${start.x}px`;
    img.style.top = `${start.y}px`;
    document.body.appendChild(img);

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy);
    const cell = this.view?.cellPixelSize();
    const dropY = Math.max(34, (cell?.y ?? 44) * 0.9);
    const drop = { x: start.x + dx * 0.04 + (Math.random() - 0.5) * 18, y: start.y + dropY };
    const c1 = { x: drop.x + dx * 0.1 + (Math.random() - 0.5) * 50, y: drop.y + 22 };
    const c2 = { x: end.x - dx * 0.08 + (Math.random() - 0.5) * 50, y: end.y - Math.min(150, 40 + dist * 0.24) };
    const dropMs = 150;
    const flyMs = 450 + Math.random() * 200;
    const total = dropMs + flyMs;
    const startAt = performance.now();
    let finished = false;
    const done = (): void => {
      if (finished) return;
      finished = true;
      img.remove();
      onArrive();
    };

    const tick = (): void => {
      const elapsed = performance.now() - startAt;
      let x: number;
      let y: number;
      let scale: number;
      let opacity: number;
      if (elapsed < dropMs) {
        const k = elapsed / dropMs;
        const e = k * k; // accelerating fall: visibly drop out of the cell
        x = start.x + (drop.x - start.x) * e;
        y = start.y + (drop.y - start.y) * e;
        scale = 1 + 0.12 * k;
        opacity = 1;
      } else {
        const k = Math.min(1, (elapsed - dropMs) / flyMs);
        const e = k * k * (3 - 2 * k); // smoothstep
        x = cubicBezier(drop.x, c1.x, c2.x, end.x, e);
        y = cubicBezier(drop.y, c1.y, c2.y, end.y, e);
        scale = 1.12 - 0.77 * e;
        opacity = 1 - 0.82 * e;
      }
      img.style.left = `${x}px`;
      img.style.top = `${y}px`;
      img.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${((elapsed) / total) * 300}deg)`;
      img.style.opacity = String(opacity);
      if (elapsed < total) requestAnimationFrame(tick);
      else done();
    };
    requestAnimationFrame(tick);
    window.setTimeout(done, total + 240);
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
        if (res.combo) {
          this.audio.play("comboBlast");
          this.view.comboBlast();
          document.body.classList.add("combo-flash");
          window.setTimeout(() => document.body.classList.remove("combo-flash"), 280);
        }
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

  /** Drag/tap toward a blocker or any immovable target: half-swap, then bounce. */
  private async handleBlockedSwap(a: { row: number; col: number }, b: { row: number; col: number }): Promise<void> {
    if (!this.view) return;
    this.busy = true;
    try {
      this.audio.play("swapInvalid");
      await this.view.animateSwap(a, b, false);
    } finally {
      this.busy = false;
    }
  }

  private onUltimateButton(): void {
    if (!this.board || this.busy || !this.controller) return;
    if (!this.board.ultimateState().ready) return;
    if (this.aiming) {
      this.endAim();
    } else {
      this.aiming = true;
      this.hud.setAiming(true);
      this.controller.setAiming(true);
      this.audio.play("select");
    }
  }

  private endAim(): void {
    this.aiming = false;
    this.hud.setAiming(false);
    this.controller?.setAiming(false);
  }

  /** Release the ultimate on the aimed cell (tile type or blocker type). */
  private async handleUltimate(c: { row: number; col: number }): Promise<void> {
    if (!this.board || !this.view) {
      this.endAim();
      return;
    }
    this.busy = true;
    try {
      const element = this.board.ultimateState().element;
      const res = this.board.activateUltimate(c);
      if (res.accepted) {
        this.audio.play("specialExplode");
        this.view.ultimateBurst(c, element > 0 ? tileColor(element).main : "#FFD60A");
        await this.view.playEvents(res.events, (e) => this.onBoardEvent(e));
        this.bossView?.onEvents(res.events);
      }
      this.hud.update(this.board, this.entries[this.index].displayName);
      this.checkFinish();
    } finally {
      this.busy = false;
      this.endAim();
    }
  }

  private checkFinish(): void {
    if (!this.board) return;
    if (!this.board.levelFinished) return;
    const entry = this.entries[this.index];
    const snap = this.board.snapshot();
    this.audio.play(snap.victory ? "victory" : "defeat");
    if (snap.victory) {
      const firstTime = this.save.stars[entry.levelId] === undefined;
      this.save.stars[entry.levelId] = Math.max(this.save.stars[entry.levelId] ?? 0, snap.stars);
      this.save.best[entry.levelId] = Math.max(this.save.best[entry.levelId] ?? 0, snap.score);
      this.awardBossCoin();
      this.applyRewards(entry.levelId, true, firstTime, snap.stars);
      this.unlockNext(entry);
      // progress points at the newly unlocked next level, so resuming continues forward
      const next = this.nextEntry(entry);
      if (next) this.save.lastPlayed = next.levelId;
      persist(this.save);
    } else {
      this.applyRewards(entry.levelId, false, false, snap.stars);
      persist(this.save);
    }
    const reason = snap.victory
      ? FinishReason[FinishReason.GoalReached]
      : FinishReason[snap.finishReason] ?? "Finished";
    const showSettle = (): void =>
      this.hud.showSettlement(
        { victory: snap.victory, score: snap.score, stars: snap.stars, reason },
        () => void this.startLevel(this.index),
        () => {
          // next level is only reachable after clearing the current one
          if (!snap.victory) return;
          void this.startLevel(Math.min(this.entries.length - 1, this.index + 1));
        },
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

  /** Defeating a boss earns its skill coin (once). */
  private awardBossCoin(): void {
    if (!this.currentBossId || !this.bossCoinConfig) return;
    const skill = this.bossCoinConfig.coins.find(
      (c) => c.bossId.toLowerCase() === this.currentBossId.toLowerCase()
    );
    if (!skill || this.save.bossCoins.includes(skill.bossId)) return;
    this.save.bossCoins.push(skill.bossId);
    log.info(`earned boss coin: ${skill.bossId}`);
  }

  /** Owned coins shown in the tray (any boss's coin, usable in any level). */
  private ownedBossCoins(): BossCoinSkill[] {
    if (!this.bossCoinConfig) return [];
    return this.bossCoinConfig.coins.filter((c) => this.save.bossCoins.includes(c.bossId));
  }

  /** Prepare the per-level coin toss budget and refresh the tray. */
  private setupBossCoin(board: BoardLogic, bossId: string): void {
    this.currentBossId = bossId;
    if (this.ownedBossCoins().length > 0) board.initBossCoin(BOSS_COIN_TOSSES_PER_LEVEL);
    this.refreshBossCoin();
  }

  private refreshBossCoin(): void {
    const board = this.board;
    const cfg = this.bossCoinConfig;
    const owned = this.ownedBossCoins();
    if (!board || !cfg || owned.length === 0) {
      this.hud.updateBossCoinTray({ enabled: false, remaining: 0, total: 0, coins: [] });
      return;
    }
    const st = board.bossCoinState();
    const zh = this.i18n.lang === "zh";
    this.hud.updateBossCoinTray({
      enabled: true,
      remaining: st.remaining,
      total: st.maxUses,
      coins: owned.map((c) => ({
        bossId: c.bossId,
        name: (zh ? c.displayNameZh : c.displayName) || c.displayName || c.bossId,
        desc: (zh ? c.skillDescriptionZh : c.skillDescription) || c.effectType,
        icon: bossCoinIconDataURL(c.bossId),
      })),
    });
  }

  private onBossCoinTrayClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(".bosscoin-coin");
    const bossId = btn?.dataset.boss;
    if (!bossId) return;
    const skill = this.bossCoinConfig?.coins.find((c) => c.bossId === bossId) ?? null;
    if (skill) void this.onBossCoinClick(skill);
  }

  /** Toss the chosen coin: roll, animate, then apply the skill effect. */
  private async onBossCoinClick(skill: BossCoinSkill): Promise<void> {
    const board = this.board;
    const cfg = this.bossCoinConfig;
    if (!board || !cfg || this.busy || this.celebrating) return;
    if (!this.save.bossCoins.includes(skill.bossId)) return;
    if (!board.canUseBossCoin() || board.bossCoinState().remaining <= 0) return;

    this.busy = true;
    try {
      const roll = board.rollBossCoin(coinProbability(cfg, skill));
      if (!roll.accepted) return;
      this.audio.play("coinToss");
      await this.hud.playCoinToss(roll.success, cfg.animation, bossCoinIconDataURL(skill.bossId));
      this.audio.play(roll.success ? "coinWin" : "swapInvalid");
      const res = board.applyBossCoinResult(skill, roll.success);
      if (this.view && res.events.length) {
        await this.view.playEvents(res.events, (e) => this.onBoardEvent(e));
      }
      this.bossView?.onEvents(res.events);
      this.hud.update(board, this.entries[this.index].displayName);
      this.refreshBossCoin();
      this.checkFinish();
    } finally {
      this.busy = false;
    }
  }

  // ─────────────────────────────── items ───────────────────────────────

  private itemDefs(): ItemDef[] {
    const cat = this.itemCatalog;
    if (!cat) return [];
    const board = this.board;
    const gloveEnabled = board ? board.config.Rules.bEnableGloveTool : true;
    return cat.items.filter(
      (i) => (i.usableInModes.length === 0 || i.usableInModes.includes("match3")) && (i.id !== "glove" || gloveEnabled)
    );
  }

  /** Build the equipped set for a level from the saved loadout (or auto-fill). */
  private buildEquipped(levelId: string): Map<string, number> {
    const out = new Map<string, number>();
    if (!this.itemCatalog) return out;
    const limits = this.itemLimits?.levelLimits.get(levelId);
    const totalCap = limits?.totalLoadoutCap ?? 0;
    if (totalCap <= 0) return out;
    const capOf = (id: string) => limits?.perItemEquipCaps.find((c) => c.itemId === id)?.cap ?? 0;
    const owned = (id: string) => this.save.items[id] ?? 0;
    const saved = this.save.loadouts[levelId];
    let sum = 0;
    for (const it of this.itemCatalog.items) {
      const want = saved ? saved[it.id] ?? 0 : capOf(it.id);
      const v = Math.max(0, Math.min(want, capOf(it.id), owned(it.id), totalCap - sum));
      if (v > 0) {
        out.set(it.id, v);
        sum += v;
      }
    }
    return out;
  }

  private refreshItems(): void {
    const defs = this.itemDefs().filter((d) => (this.equipped.get(d.id) ?? 0) > 0);
    if (defs.length === 0 || !this.board) {
      this.hud.updateItems([]);
      return;
    }
    this.hud.updateItems(
      defs.map((d) => {
        const remaining = Math.max(0, (this.equipped.get(d.id) ?? 0) - (this.itemUses.get(d.id) ?? 0));
        const enabled = remaining > 0 && !this.busy && !this.celebrating && !this.hinting;
        return {
          id: d.id,
          count: remaining,
          enabled: enabled || this.activeItem === d.id,
          icon: itemIconDataURL(d.id, 40, !enabled && this.activeItem !== d.id),
          title: `${d.name} · ${this.i18n.t("itemRemaining")} ${remaining}`,
        };
      })
    );
  }

  private onItemBarClick(e: MouseEvent): void {
    const btn = (e.target as HTMLElement | null)?.closest<HTMLElement>(".item-btn");
    const id = btn?.dataset.item;
    if (id) this.onItemClick(id);
  }

  private onItemClick(id: string): void {
    const board = this.board;
    if (!board || this.busy || this.celebrating || board.levelFinished) return;
    if (this.activeItem === id) {
      this.cancelItem();
      return;
    }
    const def = this.itemDefs().find((d) => d.id === id);
    if (!def) return;
    const remaining = Math.max(0, (this.equipped.get(id) ?? 0) - (this.itemUses.get(id) ?? 0));
    if (remaining <= 0) return;

    this.cancelItem();
    this.activeItem = id;
    this.gloveFirst = null;
    this.hud.setItemAiming(id);
    this.audio.play("select");

    if (id === "shuffle") {
      this.cancelItem();
      void this.executeItem("shuffle");
    } else if (id === "finger") {
      this.controller?.setPathMode(true, (path) => this.onItemPath(path));
    } else {
      this.controller?.setAiming(true, (c) => this.onItemTarget(c));
    }
    this.refreshItems();
  }

  private cancelItem(): void {
    this.activeItem = null;
    this.gloveFirst = null;
    this.hud.setItemAiming(null);
    this.controller?.setAiming(false);
    this.controller?.setPathMode(false);
  }

  private onItemTarget(c: Coord): void {
    const id = this.activeItem;
    if (!id) return;
    if (id === "glove") {
      if (!this.gloveFirst) {
        this.gloveFirst = c;
        this.controller?.setAiming(true, (n) => this.onItemTarget(n));
        return;
      }
      const a = this.gloveFirst;
      this.cancelItem();
      void this.executeItem("glove", { a, b: c });
      return;
    }
    this.cancelItem();
    void this.executeItem(id, { coord: c });
  }

  private onItemPath(path: Coord[]): void {
    const id = this.activeItem;
    if (!id) return;
    this.cancelItem();
    void this.executeItem("finger", { path });
  }

  private async executeItem(id: string, opts: { coord?: Coord; a?: Coord; b?: Coord; path?: Coord[] } = {}): Promise<void> {
    const board = this.board;
    if (!board) return;
    let res: ReturnType<BoardLogic["useHammer"]> | null = null;
    if (id === "hammer" && opts.coord) res = board.useHammer(opts.coord);
    else if (id === "rocket" && opts.coord) res = board.useRocket(opts.coord);
    else if (id === "shuffle") res = board.useShuffle();
    else if (id === "glove" && opts.a && opts.b) res = board.useGlove(opts.a, opts.b);
    else if (id === "finger" && opts.path) {
      const indices = opts.path.map((p) => board.index(p.row, p.col));
      res = board.useFinger(indices);
    }
    if (!res || !res.accepted) {
      this.refreshItems();
      return;
    }

    this.busy = true;
    try {
      this.consumeItem(id);
      this.audio.play(id === "rocket" ? "specialExplode" : id === "hammer" ? "blockerBreak" : "skill");
      if (this.view && res.events.length) {
        await this.view.playEvents(res.events, (e) => this.onBoardEvent(e));
      }
      this.bossView?.onEvents(res.events);
      this.hud.update(board, this.entries[this.index].displayName);
      this.resetIdleHint();
      this.checkFinish();
    } finally {
      this.busy = false;
      this.refreshItems();
    }
  }

  private consumeItem(id: string): void {
    const count = this.save.items[id] ?? 0;
    if (count > 0) this.save.items[id] = count - 1;
    this.itemUses.set(id, (this.itemUses.get(id) ?? 0) + 1);
    persist(this.save);
  }

  private nextEntry(entry: ManifestEntry): ManifestEntry | undefined {
    const sorted = [...this.entries].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((e) => e.levelId === entry.levelId);
    return idx >= 0 ? sorted[idx + 1] : undefined;
  }

  private unlockNext(entry: ManifestEntry): void {
    const unlocked = new Set(this.save.unlocked);
    for (const eff of entry.outcomes.firstWinEffects) {
      if (eff.type === "UnlockLevel" && eff.targetId && this.entries.some((e) => e.levelId === eff.targetId)) {
        unlocked.add(eff.targetId);
      }
    }
    // orders are not necessarily sequential, so unlock the next level in sequence
    const next = this.nextEntry(entry);
    if (next) unlocked.add(next.levelId);
    this.save.unlocked = [...unlocked];
  }

  /** Landing screen shown before the level map; PLAY enters the map. */
  private showHome(): void {
    if (this.homeEl) return;
    this.music.setMode("map");
    this.shopBtn?.classList.add("hidden");
    this.mapBtn?.classList.add("hidden");

    const root = document.createElement("div");
    root.className = "home-overlay";

    const card = document.createElement("div");
    card.className = "home-card";

    const icon = document.createElement("img");
    icon.className = "home-icon";
    icon.src = "./icon-192.png";
    icon.alt = "MatchFace";
    icon.addEventListener("error", () => (icon.style.display = "none"));

    const title = document.createElement("h1");
    title.className = "home-title";
    title.textContent = "MatchFace";

    const tagline = document.createElement("p");
    tagline.className = "home-tagline";
    tagline.textContent = this.i18n.t("homeTagline");

    const play = document.createElement("button");
    play.className = "btn primary home-play";
    play.textContent = this.i18n.t("play");
    play.addEventListener("click", () => this.enterGame());

    card.append(icon, title, tagline, play);
    const hint = this.buildInstallHint();
    if (hint) card.appendChild(hint);

    root.appendChild(card);
    this.uiRoot.appendChild(root);
    this.homeEl = root;
  }

  /** True when launched from an installed home-screen app (so the hint is pointless). */
  private isStandalone(): boolean {
    if (typeof window.matchMedia === "function") {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    }
    return (navigator as unknown as { standalone?: boolean }).standalone === true;
  }

  /** Mobile-only "add to home screen" hint; null on desktop / standalone / dismissed. */
  private addToHomeInfo(): { ios: boolean; android: boolean } | null {
    if (this.isStandalone() || localStorage.getItem(INSTALL_HINT_KEY) === "1") return null;
    const ua = navigator.userAgent || "";
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const android = /Android/i.test(ua);
    if (!ios && !android) return null;
    return { ios, android };
  }

  /** Dismissible "add to home screen" hint (remembered via localStorage). */
  private buildInstallHint(): HTMLElement | null {
    const a2hs = this.addToHomeInfo();
    if (!a2hs) return null;

    const hint = document.createElement("div");
    hint.className = "home-install";

    const strong = document.createElement("b");
    strong.textContent = this.i18n.t("installTitle");

    const text = document.createElement("p");
    text.textContent = this.i18n.t("installHint");

    const steps = document.createElement("p");
    steps.className = "home-install-steps";
    steps.textContent = a2hs.ios ? this.i18n.t("installIos") : this.i18n.t("installAndroid");

    const actions = document.createElement("div");
    actions.className = "home-install-actions";

    if (a2hs.android && this.installPrompt) {
      const add = document.createElement("button");
      add.className = "btn primary";
      add.textContent = this.i18n.t("addToHome");
      add.addEventListener("click", () => {
        this.installPrompt?.();
        hint.remove();
      });
      actions.appendChild(add);
    }

    const never = document.createElement("button");
    never.className = "btn ghost";
    never.textContent = this.i18n.t("dontShowAgain");
    never.addEventListener("click", () => {
      localStorage.setItem(INSTALL_HINT_KEY, "1");
      hint.remove();
    });
    actions.appendChild(never);

    const close = document.createElement("button");
    close.className = "home-install-close";
    close.setAttribute("aria-label", this.i18n.t("close"));
    close.textContent = "×";
    close.addEventListener("click", () => hint.remove());

    hint.append(close, strong, text, steps, actions);
    return hint;
  }

  private enterGame(): void {
    if (this.homeEl) {
      this.homeEl.remove();
      this.homeEl = null;
    }
    this.openLevelSelect();
  }

  private openLevelSelect(): void {
    this.hud.hidePanels();
    this.music.setMode("map");
    if (this.shopBtn) this.shopBtn.classList.remove("hidden"); // shop entry on the map page
    if (this.mapBtn) this.mapBtn.classList.add("hidden"); // redundant on the map itself
    this.mapView.show(
      [...this.entries].sort((a, b) => a.order - b.order),
      { unlocked: new Set(this.save.unlocked), stars: this.save.stars },
      this.bossMeta,
      (e) => {
        const i = this.entries.indexOf(e);
        if (i >= 0) this.openLoadout(e);
      },
      () => this.goHome()
    );
  }

  /** Return to the landing screen from the level map. */
  private goHome(): void {
    this.mapView.hide();
    this.hud.hidePanels();
    this.showHome();
  }

  // ───────────────────────────── loadout / shop / rewards ─────────────────────────────

  private refreshWallet(): void {
    this.hud.updateWallet({
      coin: this.save.wallet["coin"] ?? 0,
      gem: this.save.wallet["gem"] ?? 0,
    });
  }

  /** Pre-level loadout picker; honors catalog/item_level_limits.json caps. */
  private openLoadout(entry: ManifestEntry): void {
    const i = this.entries.indexOf(entry);
    if (i < 0) return;
    const limits = this.itemLimits?.levelLimits.get(entry.levelId);
    const totalCap = limits?.totalLoadoutCap ?? 0;
    const defs = this.itemDefs();
    const items = defs
      .map((d) => ({
        id: d.id,
        name: d.name,
        icon: itemIconDataURL(d.id, 40),
        cap: limits?.perItemEquipCaps.find((c) => c.itemId === d.id)?.cap ?? 0,
        owned: this.save.items[d.id] ?? 0,
      }))
      .filter((d) => d.cap > 0);
    const initial = this.save.loadouts[entry.levelId] ?? {};
    this.hud.showLoadout(
      { title: this.i18n.t("loadout"), levelLabel: entry.displayName || entry.levelId, totalCap, items, initial },
      (selection) => {
        this.save.loadouts[entry.levelId] = selection;
        persist(this.save);
        this.hud.hidePanels();
        void this.startLevel(i);
      },
      () => this.hud.hidePanels()
    );
  }

  private openShop(): void {
    if (!this.products) {
      this.hud.hidePanels();
      return;
    }
    const itemName = (id: string) => this.itemCatalog?.items.find((d) => d.id === id)?.name ?? id;
    const list = this.products.products
      .filter((p) => p.type.toLowerCase() !== "lifepack" && p.grant.lifeAmount <= 0)
      .map((p) => {
        const label = `${itemName(p.grant.itemId)} ×${p.grant.itemCount}`;
        return {
          id: p.id,
          label,
          desc: this.i18n.t("itemUseHint"),
          priceLabel: `${p.currencyId === "gem" ? "◆" : "◎"} ${p.amount}`,
          icon: itemIconDataURL(p.grant.itemId, 40),
          affordable: (this.save.wallet[p.currencyId] ?? 0) >= p.amount,
        };
      });
    this.hud.showShop(
      {
        title: this.i18n.t("shop"),
        wallet: { coin: this.save.wallet["coin"] ?? 0, gem: this.save.wallet["gem"] ?? 0 },
        products: list,
      },
      (id) => this.buyProduct(id),
      () => this.hud.hidePanels()
    );
  }

  private buyProduct(id: string): void {
    const p = this.products?.products.find((x) => x.id === id);
    if (!p) return;
    const have = this.save.wallet[p.currencyId] ?? 0;
    if (have < p.amount) return;
    this.save.wallet[p.currencyId] = have - p.amount;
    if (p.grant.itemId && p.grant.itemCount > 0) {
      const stack = this.itemCatalog?.items.find((d) => d.id === p.grant.itemId)?.stackMax ?? 999;
      this.save.items[p.grant.itemId] = Math.min(stack, (this.save.items[p.grant.itemId] ?? 0) + p.grant.itemCount);
    }
    this.audio.play("skill");
    persist(this.save);
    this.refreshWallet();
    this.openShop();
  }

  private applyRewards(levelId: string, victory: boolean, firstTime: boolean, stars: number): void {
    const rules = this.rewardRules;
    if (!rules) return;
    const lr = rules.levelRules.get(levelId);
    const mode = rules.modeRules.find((m) => m.modeId === "match3");
    if (victory) {
      const bundle = firstTime
        ? lr?.firstWin ?? lr?.repeatWin ?? mode?.firstWin ?? mode?.win
        : lr?.repeatWin ?? lr?.firstWin ?? mode?.win;
      if (bundle) this.applyBundle(bundle);
      if (stars >= 5 && lr?.fiveStarBonus) this.applyBundle(lr.fiveStarBonus);
    } else {
      const bundle = lr?.lose ?? mode?.lose;
      if (bundle) this.applyBundle(bundle);
    }
    this.refreshWallet();
  }

  private applyBundle(bundle: RewardBundle): void {
    for (const c of bundle.currencies) {
      if (!c.currencyId || c.amount === 0) continue;
      const def = this.currencyCatalog?.currencies.find((x) => x.id === c.currencyId);
      const max = def?.max && def.max > 0 ? def.max : Number.MAX_SAFE_INTEGER;
      this.save.wallet[c.currencyId] = Math.max(0, Math.min(max, (this.save.wallet[c.currencyId] ?? 0) + c.amount));
    }
    for (const it of bundle.items) {
      if (!it.itemId || it.count <= 0) continue;
      const stack = this.itemCatalog?.items.find((d) => d.id === it.itemId)?.stackMax ?? 999;
      this.save.items[it.itemId] = Math.min(stack, (this.save.items[it.itemId] ?? 0) + it.count);
    }
  }
}

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveData;
      return {
        unlocked: parsed.unlocked ?? [],
        stars: parsed.stars ?? {},
        best: parsed.best ?? {},
        bossCoins: parsed.bossCoins ?? [],
        items: parsed.items ?? {},
        wallet: parsed.wallet ?? {},
        loadouts: parsed.loadouts ?? {},
        lastPlayed: parsed.lastPlayed ?? "",
      };
    }
  } catch {
    /* ignore */
  }
  return { unlocked: [], stars: {}, best: {}, bossCoins: [], items: {}, wallet: {}, loadouts: {}, lastPlayed: "" };
}

function persist(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}
