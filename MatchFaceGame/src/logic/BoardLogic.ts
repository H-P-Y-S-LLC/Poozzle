/**
 * Match3 board logic core. Pure rules — no three.js / DOM (Node-testable).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §3.
 *
 * The cascade runs synchronously and records a list of `BoardEvent`s. The view
 * layer replays these events as animations. (The UE async animation-wait protocol
 * is represented by the event stream rather than mid-resolution callbacks.)
 */
import {
  BoardState,
  ClearTriggerType,
  FinishReason,
  SpecialType,
  parseSpecialType,
  charToInt,
  coordOf,
  createCell,
  indexOf,
  type Cell,
  type Coord,
} from "./Match3Types.js";
import { Prng, randomSeed32 } from "../core/Prng.js";
import type { BlockerTypeDef, LevelConfig } from "../config/types/LevelConfig.js";
import type { BossConfig } from "../config/types/BossConfig.js";
import { BossRuntime, type BossEvent } from "./BossRuntime.js";
import type { BossCoinSkill } from "../config/BossCoinConfig.js";

/** Blockers stay fixed; set true to re-enable per-turn movable/spread (§3.9). */
const ENABLE_TURN_BLOCKER_DYNAMICS = false;

export interface ClearBatchEvent {
  type: "clear";
  batchId: number;
  indices: number[];
  tileTypes: number[];
  /** index-aligned info for each cleared cell (before it was emptied). */
  clearedTiles: Array<{ index: number; tileType: number; special: SpecialType }>;
  specialsSpawned: Array<{ index: number; special: SpecialType }>;
  comboIndex: number;
  triggerType: ClearTriggerType;
  scoreDelta: number;
  scoreAfter: number;
}

export interface FallEvent {
  type: "fall";
  moves: Array<{ from: number; to: number; tileType: number; special: SpecialType }>;
}

export interface SpawnEvent {
  type: "spawn";
  spawns: Array<{ index: number; tileType: number }>;
}

export interface BlockerHitEvent {
  type: "blockerHit";
  hits: Array<{ index: number; blockerType: number; hpAfter: number; broken: boolean }>;
}

export interface ScoreEvent {
  type: "score";
  delta: number;
  total: number;
}

export interface StableEvent {
  type: "stable";
  combo: number;
}

export interface ShuffleEvent {
  type: "shuffle";
  tiles: Array<{ index: number; fromTileType: number; toTileType: number }>;
}

export interface GoalsEvent {
  type: "goals";
  goals: Array<{ tileType: number; current: number; required: number }>;
}

/** Board mutated outside clear/fall (movable/spread blockers, etc.). */
export interface RefreshEvent {
  type: "refresh";
}

/** Ultimate skill charge state changed. */
export interface UltimateEvent {
  type: "ultimate";
  enabled: boolean;
  ready: boolean;
  element: number;
  count: number;
  required: number;
}

export type BoardEvent =
  | ClearBatchEvent
  | FallEvent
  | SpawnEvent
  | BlockerHitEvent
  | ScoreEvent
  | StableEvent
  | ShuffleEvent
  | GoalsEvent
  | RefreshEvent
  | UltimateEvent
  | BossEvent;

export interface SwapResult {
  accepted: boolean;
  combo: boolean;
  events: BoardEvent[];
  victory: boolean;
  finished: boolean;
  finishReason: FinishReason;
}

export interface BossCoinResult {
  accepted: boolean;
  success: boolean;
  applied: boolean;
  events: BoardEvent[];
  victory: boolean;
  finished: boolean;
  finishReason: FinishReason;
}

export interface CollectProgress {
  tileType: number;
  current: number;
  required: number;
}

export class BoardLogic {
  readonly config: LevelConfig;
  readonly rows: number;
  readonly cols: number;
  cells: Cell[] = [];
  state: BoardState = BoardState.Idle;

  prng: Prng;
  randomSeed: number;

  currentScore = 0;
  usedMoves = 0;
  cascadeCombo = 0;
  /** Extra moves granted mid-run (BossCoin ConvertFliesToMoves). */
  bonusMoves = 0;

  collectedByTileType = new Map<number, number>();
  brokenBlockerCount = 0;
  brokenBlockerTypeCounts = new Map<number, number>();

  levelFinished = false;
  victory = false;
  lastFinishReason: FinishReason = FinishReason.None;

  boss: BossRuntime | null = null;

  private frozenTurns = new Map<number, number>();
  private corrosionDeadline = new Map<number, number>();
  private blockersByType = new Map<number, BlockerTypeDef>();
  private events: BoardEvent[] = [];
  private batchId = 0;
  private fixedTiles = new Set<number>();
  private comboTargetType = 0;
  private comboSuppress = new Set<number>();
  private lastBlockerMove = 0;

  // ── ultimate skill ──
  private ultimateEnabled = true;
  private ultimateReadyFlag = false;
  private ultimateElement = 0;
  private ultimateChargeType = 0;
  private ultimateCount = 0;
  private ultimateCountedThisTurn = false;
  static readonly ULTIMATE_REQUIRED = 3;

  // ── boss coin (defeat a boss -> own its skill coin) ──
  private bossCoinMaxUses = 0;
  private bossCoinUses = 0;
  private bossCoinMisses = 0;
  private bossCoinEmptied: number[] = [];

  constructor(config: LevelConfig, seed?: number, bossConfig?: BossConfig | null) {
    this.config = config;
    this.rows = config.Board.Rows;
    this.cols = config.Board.Cols;
    for (const def of config.Board.BlockerTypeDefs) this.blockersByType.set(def.TypeId, def);

    const boardSeed = config.Board.RandomSeed;
    this.randomSeed = seed ?? (boardSeed !== 0 ? boardSeed : randomSeed32());
    this.prng = new Prng(this.randomSeed);

    this.init();

    const ult = config.bEnableUltimateSkillOverride;
    this.ultimateEnabled = ult.present ? ult.value : true;
    if (this.ultimateEnabled && config.InitialUltimateReadyTileType > 0) {
      this.ultimateReadyFlag = true;
      this.ultimateElement = config.InitialUltimateReadyTileType;
      this.ultimateChargeType = this.ultimateElement;
      this.ultimateCount = BoardLogic.ULTIMATE_REQUIRED;
    }

    if (bossConfig && bossConfig.bEnabled) {
      this.boss = new BossRuntime(bossConfig, this, this.randomSeed);
    }
  }

  // ─────────────────────────────── init ───────────────────────────────

  private init(): void {
    const { Board } = this.config;
    this.cells = new Array(this.rows * this.cols);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = createCell();

    const at = (rows: string[], r: number, c: number): string =>
      rows.length > r && rows[r].length > c ? rows[r][c] : "0";

    const hasBlockedTypes = Board.BlockedTypes.length > 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        const cell = this.cells[idx];
        const usable = Board.Mask.length > 0 ? at(Board.Mask, r, c) === "1" : true;
        cell.bUsable = usable;

        if (hasBlockedTypes) {
          const typeId = charToInt(at(Board.BlockedTypes, r, c));
          if (typeId > 0) {
            const def = this.blockersByType.get(typeId);
            cell.BlockerType = typeId;
            cell.bBlockerDestructible = def ? def.bDestructible : true;
            const hp = charToInt(at(Board.BlockedHP, r, c));
            cell.BlockerHP = hp > 0 ? hp : def ? def.DefaultHP : 1;
            cell.BlockerTransformTarget = charToInt(at(Board.BlockedTransformTarget, r, c));
          }
        } else if (Board.Blocked.length > 0 && at(Board.Blocked, r, c) === "1") {
          cell.BlockerType = 1;
          cell.bBlockerDestructible = true;
          cell.BlockerHP = 1;
        }

        if (at(Board.StickyMask, r, c) === "1") cell.bSticky = true;
        if (at(Board.LarvaeMask, r, c) === "1") cell.bLarvae = true;
        if (at(Board.BubbleMask, r, c) === "1") cell.bBubble = true;

        if (Board.InitialTiles.length >= this.rows * this.cols) {
          const t = Board.InitialTiles[idx] ?? 0;
          // a blocker occupies its own cell — never place a tile under it
          if (t > 0 && cell.BlockerType === 0) {
            cell.TileType = t;
          }
        }
      }
    }

    // initial specials
    for (const s of Board.InitialSpecials) {
      if (s.Row < 0 || s.Col < 0) continue;
      const idx = s.Row * this.cols + s.Col;
      if (!this.cells[idx].bUsable || this.cells[idx].BlockerType > 0) continue;
      this.cells[idx].SpecialType = s.SpecialType;
      this.cells[idx].TileType = 0;
      this.fixedTiles.add(idx);
    }

    this.fillBoard();
    this.ensureStartRules();
    this.syncCollectMap();
  }

  /** Constructive fill that avoids creating 3-in-a-row (row-major). */
  private fillBoard(): void {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const idx = r * this.cols + c;
        const cell = this.cells[idx];
        if (!cell.bUsable || cell.BlockerType > 0 || cell.bMovementLocked) continue;
        if (cell.TileType > 0 || cell.SpecialType !== SpecialType.None) continue;
        cell.TileType = this.pickNonMatchingTile(r, c);
      }
    }
  }

  private pickNonMatchingTile(r: number, c: number): number {
    const forbidden = new Set<number>();
    if (c >= 2) {
      const a = this.cells[r * this.cols + c - 1];
      const b = this.cells[r * this.cols + c - 2];
      if (a.TileType > 0 && a.TileType === b.TileType && a.SpecialType === SpecialType.None) forbidden.add(a.TileType);
    }
    if (r >= 2) {
      const a = this.cells[(r - 1) * this.cols + c];
      const b = this.cells[(r - 2) * this.cols + c];
      if (a.TileType > 0 && a.TileType === b.TileType && a.SpecialType === SpecialType.None) forbidden.add(a.TileType);
    }
    const pool = this.config.TilePool;
    const nonRegen = new Set(pool.NonRegeneratingTileTypes);
    const allowed = pool.TileTypes.filter((t) => t > 0 && !nonRegen.has(t) && !forbidden.has(t));
    if (allowed.length === 0) return this.rollRandomTileType();
    return allowed[this.prng.intRange(0, allowed.length - 1)];
  }

  /** §3.2.2: no immediate matches, at least one move, collect targets visible. */
  private ensureStartRules(force = false): void {
    const avoidStart = force || this.config.Rules.bAvoidAutoCascadeAtStart;
    const needMove = force || this.config.Rules.bEnsureAtLeastOneMove;
    if (!avoidStart && !needMove && this.config.Goal.Collect.length === 0) return;
    for (let attempt = 0; attempt < 100; attempt++) {
      let ok = true;
      if (avoidStart && this.computeMatches().matched.size > 0) ok = false;
      if (ok && needMove && !this.hasAnyPossibleMove()) ok = false;
      if (ok && !this.collectTargetsVisible()) ok = false;
      if (ok) return;
      this.rerollRandomTiles();
    }
  }

  /** Clears all non-fixed normal tiles and refills (used by start-rule convergence). */
  private rerollRandomTiles(): void {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.bUsable || c.BlockerType > 0 || c.bMovementLocked) continue;
      if (this.fixedTiles.has(i) || c.SpecialType !== SpecialType.None) continue;
      c.TileType = 0;
      c.bSticky = false;
      c.bLarvae = false;
      c.bBubble = false;
    }
    this.fillBoard();
  }

  private collectTargetsVisible(): boolean {
    if (this.config.Goal.Collect.length === 0) return true;
    const present = new Set<number>();
    for (const c of this.cells) {
      if (c.bUsable && c.BlockerType === 0 && c.TileType > 0) present.add(c.TileType);
    }
    return this.config.Goal.Collect.every((g) => present.has(g.TileType));
  }

  private syncCollectMap(): void {
    for (const g of this.config.Goal.Collect) {
      if (!this.collectedByTileType.has(g.TileType)) this.collectedByTileType.set(g.TileType, 0);
    }
  }

  // ─────────────────────────────── helpers ───────────────────────────────

  coord(idx: number): Coord {
    return coordOf(idx, this.cols);
  }

  index(row: number, col: number): number {
    return indexOf({ row, col }, this.cols);
  }

  private blockerDef(cell: Cell): BlockerTypeDef | undefined {
    return this.blockersByType.get(cell.BlockerType);
  }

  /** Rubber-duck style blockers keep an underlying tile; normal ones do not. */
  isSwapOnMatchOnly(typeId: number): boolean {
    return this.blockersByType.get(typeId)?.bSwapOnMatchOnly === true;
  }

  isFrozen(idx: number): boolean {
    return (this.frozenTurns.get(idx) ?? 0) > 0;
  }

  /** Apply freeze; turns are max-merged (not additive), per §4.7.1. */
  freezeCell(idx: number, turns: number): void {
    this.frozenTurns.set(idx, Math.max(this.frozenTurns.get(idx) ?? 0, turns));
  }

  private tickFrozen(): void {
    if (this.frozenTurns.size === 0) return;
    for (const [idx, turns] of [...this.frozenTurns]) {
      const next = turns - 1;
      if (next <= 0) this.frozenTurns.delete(idx);
      else this.frozenTurns.set(idx, next);
    }
  }

  frozenUsableRatio(): number {
    let total = 0;
    let frozen = 0;
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.bUsable || c.BlockerType > 0) continue;
      total++;
      if (this.isFrozen(i)) frozen++;
    }
    return total <= 0 ? 0 : frozen / total;
  }

  isMatchable(idx: number): boolean {
    const c = this.cells[idx];
    if (!c.bUsable || c.BlockerType > 0) return false;
    if (c.SpecialType !== SpecialType.None) return false;
    if (this.isFrozen(idx) || c.bBubble || c.bPoisoned) return false;
    return c.TileType > 0;
  }

  private canParticipateInGravity(idx: number): boolean {
    const c = this.cells[idx];
    if (!c.bUsable) return false;
    if (c.bSticky || c.bMovementLocked || c.bBubble) return false;
    if (c.BlockerType > 0) {
      const def = this.blockerDef(c);
      return def?.bSwapOnMatchOnly === true; // rubber duck falls
    }
    return true;
  }

  private isSolidForGravity(idx: number): boolean {
    return !this.canParticipateInGravity(idx);
  }

  rollRandomTileType(): number {
    const pool = this.config.TilePool;
    const nonRegen = new Set(pool.NonRegeneratingTileTypes);
    let total = 0;
    for (let i = 0; i < pool.TileTypes.length; i++) {
      const t = pool.TileTypes[i];
      if (t <= 0 || nonRegen.has(t)) continue;
      total += Math.max(0, pool.Weights[i] ?? 0) || 0;
    }
    if (total <= 0) {
      const first = pool.TileTypes.find((t) => t > 0 && !nonRegen.has(t));
      return first ?? 1;
    }
    let pick = this.prng.floatRange(0, total);
    for (let i = 0; i < pool.TileTypes.length; i++) {
      const t = pool.TileTypes[i];
      if (t <= 0 || nonRegen.has(t)) continue;
      pick -= Math.max(0, pool.Weights[i] ?? 0);
      if (pick <= 0) return t;
    }
    return pool.TileTypes.find((t) => t > 0) ?? 1;
  }

  private isInert(tileType: number): boolean {
    return this.config.TilePool.InertTileTypes.includes(tileType);
  }

  // ─────────────────────────────── matching ───────────────────────────────

  /** §3.3.3 pure horizontal/vertical scan + §3.3.4 special spawns. */
  computeMatches(): {
    matched: Set<number>;
    spawns: Map<number, SpecialType>;
    hSet: Set<number>;
    vSet: Set<number>;
  } {
    const { MinMatchCount } = this.config.Rules;
    const matched = new Set<number>();
    const hSet = new Set<number>();
    const vSet = new Set<number>();
    const hRuns: number[][] = [];
    const vRuns: number[][] = [];

    for (let r = 0; r < this.rows; r++) {
      let c = 0;
      while (c < this.cols) {
        const idx = r * this.cols + c;
        const t = this.isMatchable(idx) ? this.cells[idx].TileType : 0;
        if (t > 0) {
          const run = [c];
          let cc = c + 1;
          while (cc < this.cols) {
            const j = r * this.cols + cc;
            if (!this.isMatchable(j) || this.cells[j].TileType !== t) break;
            run.push(cc);
            cc++;
          }
          if (run.length >= MinMatchCount) {
            for (const col of run) {
              matched.add(r * this.cols + col);
              hSet.add(r * this.cols + col);
            }
            hRuns.push(run.map((col) => r * this.cols + col));
          }
          c = cc;
        } else {
          c++;
        }
      }
    }

    for (let c = 0; c < this.cols; c++) {
      let r = 0;
      while (r < this.rows) {
        const idx = r * this.cols + c;
        const t = this.isMatchable(idx) ? this.cells[idx].TileType : 0;
        if (t > 0) {
          const run = [r];
          let rr = r + 1;
          while (rr < this.rows) {
            const j = rr * this.cols + c;
            if (!this.isMatchable(j) || this.cells[j].TileType !== t) break;
            run.push(rr);
            rr++;
          }
          if (run.length >= MinMatchCount) {
            for (const row of run) {
              matched.add(row * this.cols + c);
              vSet.add(row * this.cols + c);
            }
            vRuns.push(run.map((row) => row * this.cols + c));
          }
          r = rr;
        } else {
          r++;
        }
      }
    }

    const spawns = new Map<number, SpecialType>();
    for (const run of hRuns) {
      if (run.length >= 5) spawns.set(run[Math.floor(run.length / 2)], SpecialType.ColorBomb);
      else if (run.length === 4) spawns.set(run[1], SpecialType.LineHorizontal);
    }
    for (const run of vRuns) {
      if (run.length >= 5) spawns.set(run[Math.floor(run.length / 2)], SpecialType.ColorBomb);
      else if (run.length === 4) spawns.set(run[1], SpecialType.LineVertical);
    }
    // intersections override with Bomb3x3
    for (const idx of matched) {
      if (hSet.has(idx) && vSet.has(idx)) spawns.set(idx, SpecialType.Bomb3x3);
    }

    return { matched, spawns, hSet, vSet };
  }

  // ─────────────────────────────── specials ───────────────────────────────

  private effectCells(idx: number, special: SpecialType, targetTileType?: number): number[] {
    const { row, col } = this.coord(idx);
    const out: number[] = [];
    const push = (r: number, c: number) => {
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return;
      out.push(r * this.cols + c);
    };
    switch (special) {
      case SpecialType.LineHorizontal:
        for (let c = 0; c < this.cols; c++) push(row, c);
        break;
      case SpecialType.LineVertical:
        for (let r = 0; r < this.rows; r++) push(r, col);
        break;
      case SpecialType.Bomb3x3:
        for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) push(r, c);
        break;
      case SpecialType.ColorBomb: {
        const target =
          targetTileType ?? (this.comboTargetType > 0 ? this.comboTargetType : this.firstColorIn(new Set([idx])));
        if (target > 0) {
          for (let i = 0; i < this.cells.length; i++) {
            const c = this.cells[i];
            if (c.bUsable && c.BlockerType === 0 && c.TileType === target) out.push(i);
          }
        }
        break;
      }
      default:
        break;
    }
    return out;
  }

  private firstColorIn(indices: Set<number>): number {
    for (const i of indices) {
      const c = this.cells[i];
      if (c.TileType > 0 && c.SpecialType === SpecialType.None) return c.TileType;
    }
    return 0;
  }

  private expandSpecialChain(seed: Set<number>, targetTileType?: number): Set<number> {
    const clear = new Set(seed);
    const queue: number[] = [...seed].filter(
      (i) => this.cells[i].SpecialType !== SpecialType.None && !this.isFrozen(i)
    );
    const processed = new Set<number>();
    while (queue.length) {
      const idx = queue.shift()!;
      if (processed.has(idx) || this.isFrozen(idx) || this.comboSuppress.has(idx)) continue;
      processed.add(idx);
      const st = this.cells[idx].SpecialType;
      if (st === SpecialType.None) continue;
      for (const e of this.effectCells(idx, st, targetTileType)) {
        if (!clear.has(e)) clear.add(e);
        if (this.cells[e].SpecialType !== SpecialType.None && !processed.has(e)) queue.push(e);
      }
    }
    return clear;
  }

  // ─────────────────────────────── swap ───────────────────────────────

  private areAdjacent(a: Coord, b: Coord): boolean {
    const dr = Math.abs(a.row - b.row);
    const dc = Math.abs(a.col - b.col);
    if (this.config.Rules.bAllowDiagonalSwap) return dr <= 1 && dc <= 1 && !(dr === 0 && dc === 0);
    return dr + dc === 1;
  }

  isSwappable(idx: number): boolean {
    const c = this.cells[idx];
    if (!c.bUsable || c.bSticky || c.bMovementLocked || c.bBubble) return false;
    if (this.isFrozen(idx)) return false;
    if (c.BlockerType > 0) {
      return this.blockerDef(c)?.bSwapOnMatchOnly === true;
    }
    return true;
  }

  /** §3.3.1/3.3.2. */
  trySwap(a: Coord, b: Coord): SwapResult {
    this.events = [];
    this.comboTargetType = 0;
    this.comboSuppress.clear();
    this.ultimateCountedThisTurn = false;
    const empty = (accepted: boolean): SwapResult => ({
      accepted,
      combo: false,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    });

    if (this.levelFinished || this.state !== BoardState.Idle) return empty(false);
    if (!this.areAdjacent(a, b)) return empty(false);
    const ia = this.index(a.row, a.col);
    const ib = this.index(b.row, b.col);
    if (!this.isSwappable(ia) || !this.isSwappable(ib)) return empty(false);

    const ca = this.cells[ia];
    const cb = this.cells[ib];
    if (ca.TileType === 0 && ca.SpecialType === SpecialType.None && cb.TileType === 0 && cb.SpecialType === SpecialType.None) {
      return empty(false);
    }

    this.state = BoardState.Swapping;
    this.swapCells(ia, ib);

    // special usage on swap: ColorBomb patterns / configured matrix / built-in (§3.4.3)
    const saNow = this.cells[ia].SpecialType;
    const sbNow = this.cells[ib].SpecialType;
    if (saNow !== SpecialType.None || sbNow !== SpecialType.None) {
      const combo = this.resolveCombo(ia, ib, saNow, sbNow);
      if (combo && combo.clear.size > 0) {
        this.comboTargetType = combo.targetTileType;
        this.comboSuppress = new Set(combo.suppress);
        this.resolveCascade(combo.clear, ClearTriggerType.SpecialExplosion, true);
        this.comboTargetType = 0;
        this.comboSuppress.clear();
        this.evaluateFinishState();
        return { ...empty(true), combo: true, victory: this.victory, finished: this.levelFinished, finishReason: this.lastFinishReason };
      }
    }

    const { matched } = this.computeMatches();
    if (matched.size === 0) {
      this.swapCells(ia, ib); // bounce back
      this.state = BoardState.Idle;
      return empty(false);
    }

    this.usedMoves++;
    this.resolveCascade(null, ClearTriggerType.NormalMatch, false);
    this.state = BoardState.Idle;
    this.evaluateFinishState();
    return { ...empty(true), victory: this.victory, finished: this.levelFinished, finishReason: this.lastFinishReason };
  }

  /** Tap a special to detonate it (§3.4.4). ColorBomb is swap-only. */
  activateSpecialAt(coord: Coord): SwapResult {
    this.events = [];
    this.comboTargetType = 0;
    this.comboSuppress.clear();
    this.ultimateCountedThisTurn = false;
    const idx = this.index(coord.row, coord.col);
    const c = this.cells[idx];
    const st = c.SpecialType;
    const clickable = st === SpecialType.Bomb3x3 || st === SpecialType.LineHorizontal || st === SpecialType.LineVertical;
    if (!clickable || this.state !== BoardState.Idle || !this.isSwappable(idx)) {
      return { accepted: false, combo: false, events: this.events, victory: this.victory, finished: this.levelFinished, finishReason: this.lastFinishReason };
    }
    this.usedMoves++;
    const seed = new Set<number>([idx]);
    this.resolveCascade(seed, ClearTriggerType.SpecialExplosion, true);
    this.state = BoardState.Idle;
    this.evaluateFinishState();
    return {
      accepted: true,
      combo: false,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    };
  }

  private swapCells(ia: number, ib: number): void {
    const tmp = this.cells[ia];
    this.cells[ia] = this.cells[ib];
    this.cells[ib] = tmp;
  }

  /**
   * Special-block usage on swap (§3.4.3): ColorBomb patterns -> configured
   * SpecialCombos matrix -> built-in fallback. Returns null when the pair has
   * no combo (then it falls through to normal match detection).
   */
  private resolveCombo(
    ia: number,
    ib: number,
    sa: SpecialType,
    sb: SpecialType
  ): { clear: Set<number>; suppress: number[]; targetTileType: number } | null {
    const clear = new Set<number>([ia, ib]);
    const suppress: number[] = [];
    let targetTileType = 0;

    const a = this.coord(ia);
    const b = this.coord(ib);
    const colorIdx = sa === SpecialType.ColorBomb ? ia : sb === SpecialType.ColorBomb ? ib : -1;
    const otherIdx = colorIdx === ia ? ib : ia;
    const otherSpecial = colorIdx === ia ? sb : sa;

    // ── Step 1: ColorBomb pattern combos ──────────────────────────────
    if (
      colorIdx >= 0 &&
      (otherSpecial === SpecialType.LineHorizontal ||
        otherSpecial === SpecialType.LineVertical ||
        otherSpecial === SpecialType.Bomb3x3)
    ) {
      const cc = this.coord(colorIdx);
      if (otherSpecial === SpecialType.LineHorizontal) {
        const anchor = Math.min(a.row, b.row);
        for (let r = 0; r < this.rows; r++) if (Math.abs(r - anchor) % 2 === 0) this.clearRow(clear, r);
      } else if (otherSpecial === SpecialType.LineVertical) {
        const anchor = Math.min(a.col, b.col);
        for (let c = 0; c < this.cols; c++) if (Math.abs(c - anchor) % 2 === 0) this.clearCol(clear, c);
      } else {
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            if ((Math.abs(r - cc.row) + Math.abs(c - cc.col)) % 2 === 0) clear.add(r * this.cols + c);
          }
        }
        suppress.push(ia, ib);
      }
      return { clear, suppress, targetTileType };
    }

    // ── Step 2: configured SpecialCombos matrix ───────────────────────
    const rule = this.matchConfigCombo(sa, sb);
    if (rule) {
      if (rule.bClearWholeBoard) this.clearAllUsable(clear);
      if (rule.bClearAllOfOtherType && colorIdx >= 0) {
        const other = this.cells[otherIdx];
        if (other.TileType > 0) {
          targetTileType = other.TileType;
          this.clearColor(clear, other.TileType);
        }
      }
      if (rule.BombRadius > 0) {
        this.clearRect(
          clear,
          Math.max(0, Math.min(a.row, b.row) - rule.BombRadius),
          Math.min(this.rows - 1, Math.max(a.row, b.row) + rule.BombRadius),
          Math.max(0, Math.min(a.col, b.col) - rule.BombRadius),
          Math.min(this.cols - 1, Math.max(a.col, b.col) + rule.BombRadius)
        );
      }
      if (rule.bClearSwapRow) {
        if (rule.SwapRowBandHalfWidth <= 0) {
          this.clearRow(clear, a.row);
          this.clearRow(clear, b.row);
        } else {
          const center = Math.round((a.row + b.row) / 2);
          for (let r = center - rule.SwapRowBandHalfWidth; r <= center + rule.SwapRowBandHalfWidth; r++) {
            if (r >= 0 && r < this.rows) this.clearRow(clear, r);
          }
        }
      }
      if (rule.bClearSwapCol) {
        if (rule.SwapColBandHalfWidth <= 0) {
          this.clearCol(clear, a.col);
          this.clearCol(clear, b.col);
        } else {
          const center = Math.round((a.col + b.col) / 2);
          for (let c = center - rule.SwapColBandHalfWidth; c <= center + rule.SwapColBandHalfWidth; c++) {
            if (c >= 0 && c < this.cols) this.clearCol(clear, c);
          }
        }
      }
      return { clear, suppress, targetTileType };
    }

    // ── Step 3: built-in fallback matrix ──────────────────────────────
    const bothColor = sa === SpecialType.ColorBomb && sb === SpecialType.ColorBomb;
    const anySpecial = sa !== SpecialType.None && sb !== SpecialType.None;

    if (bothColor) {
      this.clearAllUsable(clear);
      return { clear, suppress, targetTileType };
    }
    if (colorIdx >= 0) {
      const other = this.cells[otherIdx];
      if (other.SpecialType === SpecialType.None && other.TileType > 0) {
        targetTileType = other.TileType;
        this.clearColor(clear, other.TileType);
      } else {
        // ColorBomb + special: clear both swap rows and both swap cols (§3.3.3)
        this.clearRow(clear, a.row);
        this.clearRow(clear, b.row);
        this.clearCol(clear, a.col);
        this.clearCol(clear, b.col);
      }
      return { clear, suppress, targetTileType };
    }
    if (anySpecial) {
      // any special + any special: 5x5-ish rect around the swap + both rows + both cols
      this.clearRect(
        clear,
        Math.max(0, Math.min(a.row, b.row) - 1),
        Math.min(this.rows - 1, Math.max(a.row, b.row) + 1),
        Math.max(0, Math.min(a.col, b.col) - 1),
        Math.min(this.cols - 1, Math.max(a.col, b.col) + 1)
      );
      this.clearRow(clear, a.row);
      this.clearRow(clear, b.row);
      this.clearCol(clear, a.col);
      this.clearCol(clear, b.col);
      return { clear, suppress, targetTileType };
    }
    return null;
  }

  private isLineSpecial(t: SpecialType): boolean {
    return t === SpecialType.LineHorizontal || t === SpecialType.LineVertical;
  }

  /** First configured SpecialCombos rule matching (A,B) unordered; any line × line shares a rule. */
  private matchConfigCombo(sa: SpecialType, sb: SpecialType) {
    for (const rule of this.config.SpecialCombos) {
      if ((rule.A === sa && rule.B === sb) || (rule.A === sb && rule.B === sa)) return rule;
      if (this.isLineSpecial(rule.A) && this.isLineSpecial(rule.B) && this.isLineSpecial(sa) && this.isLineSpecial(sb)) {
        return rule;
      }
    }
    return null;
  }

  private clearAllUsable(clear: Set<number>): void {
    for (let i = 0; i < this.cells.length; i++) if (this.cells[i].bUsable) clear.add(i);
  }
  private clearColor(clear: Set<number>, tileType: number): void {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (c.bUsable && c.BlockerType === 0 && c.TileType === tileType) clear.add(i);
    }
  }
  private clearRow(clear: Set<number>, row: number): void {
    for (let c = 0; c < this.cols; c++) clear.add(row * this.cols + c);
  }
  private clearCol(clear: Set<number>, col: number): void {
    for (let r = 0; r < this.rows; r++) clear.add(r * this.cols + col);
  }
  private clearRect(clear: Set<number>, r0: number, r1: number, c0: number, c1: number): void {
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) clear.add(r * this.cols + c);
  }

  // ─────────────────────────────── cascade ───────────────────────────────

  private resolveCascade(
    initialClear: Set<number> | null,
    initialTrigger: ClearTriggerType,
    initialIsSpecial: boolean
  ): void {
    let pending: { clear: Set<number>; trigger: ClearTriggerType; isSpecial: boolean } | null = initialClear
      ? { clear: initialClear, trigger: initialTrigger, isSpecial: initialIsSpecial }
      : null;
    let guard = 0;

    while (guard++ < 200) {
      this.state = BoardState.Resolving;

      let matched: Set<number>;
      let spawns: Map<number, SpecialType>;
      let trigger: ClearTriggerType;
      let specialTriggered: boolean;

      if (pending) {
        matched = pending.clear;
        spawns = new Map();
        trigger = pending.trigger;
        specialTriggered = pending.isSpecial;
        pending = null;
      } else {
        const r = this.computeMatches();
        matched = r.matched;
        spawns = r.spawns;
        trigger = ClearTriggerType.NormalMatch;
        specialTriggered = false;
      }

      if (matched.size === 0) break;

      this.cascadeCombo++;
      const comboIndex = this.cascadeCombo;

      // spawn specials on 4/5 runs — those cells are not cleared
      const spawnIndices = new Set<number>();
      for (const idx of spawns.keys()) {
        if (!this.cells[idx].bMovementLocked) spawnIndices.add(idx);
      }

      // expand special chain from the matched set
      let clear = this.expandSpecialChain(matched);
      for (const s of spawnIndices) clear.delete(s);

      // blockers adjacent damage
      const blockerHits = this.damageBlockers(clear, trigger);
      if (blockerHits.length) this.events.push({ type: "blockerHit", hits: blockerHits });

      // clear cells + collect
      const clearedIndices: number[] = [];
      const tileTypes: number[] = [];
      const clearedTiles: Array<{ index: number; tileType: number; special: SpecialType }> = [];
      let specialCount = 0;
      for (const idx of clear) {
        const c = this.cells[idx];
        if (!c.bUsable) continue;
        if (c.SpecialType !== SpecialType.None) specialCount++;
        clearedTiles.push({ index: idx, tileType: c.TileType, special: c.SpecialType });
        if (c.TileType > 0) {
          tileTypes.push(c.TileType);
          this.applyCollect(c.TileType, 1, specialTriggered);
        }
        // larvae -> blocker
        if (c.bLarvae) {
          const pool = this.config.Board.LarvaeBlockerTypePool;
          const t = pool.length > 0 ? pool[this.prng.intRange(0, pool.length - 1)] : 0;
          if (t > 0) {
            c.BlockerType = t;
            const def = this.blockersByType.get(t);
            c.bBlockerDestructible = def ? def.bDestructible : true;
            c.BlockerHP = def ? def.DefaultHP : 1;
          }
        }
        c.TileType = 0;
        c.SpecialType = SpecialType.None;
        c.bSticky = false;
        c.bLarvae = false;
        c.bBubble = false;
        c.bSpecialPoisoned = false;
        c.bPoisoned = false;
        c.PoisonedRemainingTurns = 0;
        clearedIndices.push(idx);
      }

      // apply special spawns
      const specialsSpawned: Array<{ index: number; special: SpecialType }> = [];
      for (const [idx, special] of spawns) {
        if (!spawnIndices.has(idx)) continue;
        const c = this.cells[idx];
        c.TileType = 0;
        c.SpecialType = special;
        c.bSticky = false;
        c.bLarvae = false;
        c.bBubble = false;
        c.bSpecialPoisoned = false;
        specialsSpawned.push({ index: idx, special });
      }

      const scoreDelta = this.scoreForClears(tileTypes.length, specialCount, comboIndex);
      this.currentScore += scoreDelta;
      if (this.boss) {
        this.boss.applyDamageFromClears(tileTypes, trigger === ClearTriggerType.UltimateTool, this.events);
      }
      this.events.push({
        type: "clear",
        batchId: ++this.batchId,
        indices: clearedIndices,
        tileTypes,
        clearedTiles,
        specialsSpawned,
        comboIndex,
        triggerType: trigger,
        scoreDelta,
        scoreAfter: this.currentScore,
      });
      this.events.push({ type: "score", delta: scoreDelta, total: this.currentScore });
      this.emitGoals();
      // only the first clear of a turn charges the ultimate (cascades do not)
      if (!this.ultimateCountedThisTurn) {
        this.ultimateCountedThisTurn = true;
        this.updateUltimateCharge(tileTypes);
      }

      // gravity + refill
      this.state = BoardState.Falling;
      const { moves, spawns: spawnRecords } = this.applyGravityAndRefill();
      if (moves.length) this.events.push({ type: "fall", moves });
      if (spawnRecords.length) this.events.push({ type: "spawn", spawns: spawnRecords });
      if (moves.length === 0 && spawnRecords.length === 0) break;
    }

    this.events.push({ type: "stable", combo: this.cascadeCombo });
    this.cascadeCombo = 0;
    this.state = BoardState.Idle;
  }

  private scoreForClears(clearedCount: number, specialCount: number, comboIndex: number): number {
    const s = this.config.Score;
    const base = clearedCount * s.BaseClearScore;
    const extra = Math.max(0, clearedCount - this.config.Rules.MinMatchCount) * s.ExtraPerMoreThan3;
    const specialBonus = specialCount * s.SpecialTriggerScore;
    const comboMul = 1 + (comboIndex - 1) * s.ComboMultiplierStep;
    return Math.round((base + extra + specialBonus) * comboMul);
  }

  private applyCollect(tileType: number, delta: number, specialTriggered: boolean): void {
    if (tileType <= 0 || this.isInert(tileType)) return;
    for (const g of this.config.Goal.Collect) {
      if (g.TileType !== tileType) continue;
      if (!g.bCountSpecialClear && specialTriggered) continue;
      this.collectedByTileType.set(tileType, (this.collectedByTileType.get(tileType) ?? 0) + delta);
    }
  }

  private emitGoals(): void {
    this.events.push({ type: "goals", goals: this.collectProgress() });
  }

  collectProgress(): CollectProgress[] {
    return this.config.Goal.Collect.map((g) => ({
      tileType: g.TileType,
      current: Math.min(this.collectedByTileType.get(g.TileType) ?? 0, g.Count),
      required: g.Count,
    }));
  }

  /** Blocker-break goal progress (typeId 0 = total blocker count). */
  blockerProgress(): Array<{ typeId: number; current: number; required: number }> {
    const goal = this.config.Goal;
    if (goal.BlockerBreakByType.length > 0) {
      return goal.BlockerBreakByType.map((g) => ({
        typeId: g.TypeId,
        current: Math.min(this.brokenBlockerTypeCounts.get(g.TypeId) ?? 0, g.Count),
        required: g.Count,
      }));
    }
    if (goal.TargetBlockerBreakCount > 0) {
      return [{ typeId: 0, current: Math.min(this.brokenBlockerCount, goal.TargetBlockerBreakCount), required: goal.TargetBlockerBreakCount }];
    }
    return [];
  }

  // ───────────────────────────── ultimate skill ─────────────────────────────

  /** Current ultimate charge state for the HUD. */
  ultimateState(): { enabled: boolean; ready: boolean; element: number; count: number; required: number } {
    return {
      enabled: this.ultimateEnabled,
      ready: this.ultimateReadyFlag,
      element: this.ultimateElement || this.ultimateChargeType,
      count: this.ultimateReadyFlag ? BoardLogic.ULTIMATE_REQUIRED : this.ultimateCount,
      required: BoardLogic.ULTIMATE_REQUIRED,
    };
  }

  /**
   * Charge: clearing the same tile type on 3 consecutive clear batches fills
   * the ultimate. Switching type restarts the count; once ready it neither
   * resets nor accumulates until released.
   */
  private updateUltimateCharge(tileTypes: number[]): void {
    if (!this.ultimateEnabled || this.ultimateReadyFlag) return;
    const dominant = this.dominantTileType(tileTypes);
    if (dominant <= 0) return;
    if (dominant === this.ultimateChargeType) this.ultimateCount++;
    else {
      this.ultimateChargeType = dominant;
      this.ultimateCount = 1;
    }
    if (this.ultimateCount >= BoardLogic.ULTIMATE_REQUIRED) this.ultimateReadyFlag = true;
    this.pushUltimateEvent();
  }

  private dominantTileType(tileTypes: number[]): number {
    const map = new Map<number, number>();
    for (const t of tileTypes) if (t > 0) map.set(t, (map.get(t) ?? 0) + 1);
    let best = 0;
    let bestN = 0;
    for (const [t, n] of map) {
      if (n > bestN) {
        bestN = n;
        best = t;
      }
    }
    return best;
  }

  private pushUltimateEvent(): void {
    this.events.push({
      type: "ultimate",
      enabled: this.ultimateEnabled,
      ready: this.ultimateReadyFlag,
      element: this.ultimateElement || this.ultimateChargeType,
      count: this.ultimateReadyFlag ? BoardLogic.ULTIMATE_REQUIRED : this.ultimateCount,
      required: BoardLogic.ULTIMATE_REQUIRED,
    });
  }

  /**
   * Release the ultimate on a target: clears every element of that tile type,
   * or every blocker of that blocker type (999 direct damage). Does not consume
   * a move. Only usable when ready.
   */
  activateUltimate(coord: Coord): SwapResult {
    this.events = [];
    this.ultimateCountedThisTurn = true; // ultimate's own clear never charges
    const reject = (): SwapResult => ({
      accepted: false,
      combo: false,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    });
    if (!this.ultimateEnabled || !this.ultimateReadyFlag || this.levelFinished || this.state !== BoardState.Idle) {
      return reject();
    }
    const idx = this.index(coord.row, coord.col);
    const c = this.cells[idx];
    if (!c.bUsable) return reject();

    let used = false;
    if (c.BlockerType > 0) {
      const type = c.BlockerType;
      const hits: BlockerHitEvent["hits"] = [];
      const emptied: number[] = [];
      for (let i = 0; i < this.cells.length; i++) {
        const b = this.cells[i];
        if (b.BlockerType !== type || !b.bBlockerDestructible) continue;
        b.BlockerHP = 1; // force break regardless of HP / immunity
        hits.push(this.hitBlocker(i));
        if (b.BlockerType === 0 && b.TileType === 0) emptied.push(i);
      }
      if (hits.length) {
        this.events.push({ type: "blockerHit", hits });
        used = true;
        // broken blockers leave holes -> settle the board immediately
        if (emptied.length > 0) this.resolveCascade(new Set(emptied), ClearTriggerType.UltimateTool, true);
      }
    } else if (c.TileType > 0) {
      const type = c.TileType;
      const clear = new Set<number>();
      for (let i = 0; i < this.cells.length; i++) {
        const b = this.cells[i];
        if (b.bUsable && b.BlockerType === 0 && b.TileType === type) clear.add(i);
      }
      if (clear.size) {
        this.resolveCascade(clear, ClearTriggerType.UltimateTool, true);
        used = true;
      }
    }
    if (!used) return reject();

    this.ultimateReadyFlag = false;
    this.ultimateElement = 0;
    this.ultimateChargeType = 0;
    this.ultimateCount = 0;
    this.pushUltimateEvent();
    this.state = BoardState.Idle;
    this.evaluateFinishState();
    return {
      accepted: true,
      combo: false,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    };
  }

  // ────────────────────────────── boss coin ──────────────────────────────

  /** Reset per-run BossCoin state (§4.11.1). */
  initBossCoin(maxUses: number): void {
    this.bossCoinMaxUses = Math.max(0, maxUses);
    this.bossCoinUses = this.bossCoinMaxUses;
    this.bossCoinMisses = 0;
  }

  bossCoinState(): { maxUses: number; remaining: number; misses: number } {
    return { maxUses: this.bossCoinMaxUses, remaining: this.bossCoinUses, misses: this.bossCoinMisses };
  }

  canUseBossCoin(): boolean {
    return !this.levelFinished && this.state === BoardState.Idle;
  }

  /**
   * Decide a toss outcome up-front (§4.11.2) so the card/coin animation can
   * reveal the right face before the effect is applied. Consumes a use and
   * advances the pity counter. Pity: two misses force the next toss to hit.
   */
  rollBossCoin(probability: number): { accepted: boolean; success: boolean } {
    if (!this.canUseBossCoin() || this.bossCoinUses <= 0) return { accepted: false, success: false };
    const p = Math.max(0, Math.min(1, probability));
    const forceSuccess = this.bossCoinMisses >= 2;
    const success = forceSuccess || Math.random() < p;
    if (success) this.bossCoinMisses = 0;
    else this.bossCoinMisses++;
    this.bossCoinUses--;
    return { accepted: true, success };
  }

  /** Apply a rolled toss outcome. Effects run only on success; the fallback runs only when a successful skill cannot apply. */
  applyBossCoinResult(skill: BossCoinSkill, success: boolean): BossCoinResult {
    this.events = [];
    const done = (applied: boolean): BossCoinResult => ({
      accepted: true,
      success,
      applied,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    });
    if (!success) return done(false);

    this.ultimateCountedThisTurn = true; // coin clears never charge the ultimate
    this.bossCoinEmptied = [];
    let applied = this.applyBossCoinEffect(skill);
    if (!applied) applied = this.applyBossCoinFallback(skill);
    // clearing blockers/tiles leaves holes -> run gravity + refill immediately
    if (this.bossCoinEmptied.length > 0) {
      this.resolveCascade(new Set(this.bossCoinEmptied), ClearTriggerType.UltimateTool, true);
      this.bossCoinEmptied = [];
    }
    this.state = BoardState.Idle;
    this.evaluateFinishState();
    return done(applied);
  }

  /**
   * Toss a BossCoin skill in one call (§4.11.2/§4.11.3): roll + apply.
   * `probability` is the resolved hit chance.
   */
  useBossCoin(skill: BossCoinSkill, probability: number): BossCoinResult {
    const roll = this.rollBossCoin(probability);
    if (!roll.accepted) {
      return {
        accepted: false,
        success: false,
        applied: false,
        events: this.events,
        victory: this.victory,
        finished: this.levelFinished,
        finishReason: this.lastFinishReason,
      };
    }
    return this.applyBossCoinResult(skill, roll.success);
  }

  private applyBossCoinEffect(skill: BossCoinSkill): boolean {
    const e = (skill.effectType || "RandomDestroyBlockers").toLowerCase();
    switch (e) {
      case "clearspecificblockertypes":
        return this.clearBossCoinBlockers(skill.blockerTypeIds, 0, true) > 0;
      case "randomdestroyblockers": {
        const count = skill.primaryCount > 0 ? skill.primaryCount : 3;
        return this.clearBossCoinBlockers(null, count, false) > 0;
      }
      case "doublebossnextdamage":
      case "doublebnextbossdamage":
      case "doublenextbossdamage": {
        const mult = skill.primaryScalar > 1 ? skill.primaryScalar : 2;
        return this.boss ? this.boss.setDamageBoost(mult, skill.bAllowRepeatWhileBuffActive) : false;
      }
      case "convertfliestomoves": {
        const perFly = skill.primaryScalar > 0 ? skill.primaryScalar : 1;
        const flyType = skill.flyTileType > 0 ? skill.flyTileType : this.resolveBossCoinFlyTileType();
        const clear = new Set<number>();
        for (let i = 0; i < this.cells.length; i++) {
          const c = this.cells[i];
          if (c.bUsable && c.BlockerType === 0 && c.TileType === flyType) clear.add(i);
        }
        let candidates = clear.size;
        if (candidates > 0) this.resolveCascade(clear, ClearTriggerType.UltimateTool, true);
        else candidates = this.clearBossCoinBlockers(skill.blockerTypeIds, 0, true);
        if (candidates === 0) return false;
        const extraMoves = Math.max(1, Math.round(candidates * perFly));
        this.bonusMoves += extraMoves;
        return true;
      }
      case "convertblockerstotiles":
        return this.bossCoinConvertBlockersToTiles(skill);
      case "clearwaterpitandlarvae": {
        const a = this.clearBossCoinBlockers(skill.blockerTypeIds, 0, true);
        const b = this.clearBossCoinLarvae();
        return a + b > 0;
      }
      case "clearsticky":
        return this.clearBossCoinSticky() > 0;
      case "clearcockroachandspawnspecials":
        return this.bossCoinSpawnSpecialsAndClear(skill);
      default:
        return false;
    }
  }

  private applyBossCoinFallback(skill: BossCoinSkill): boolean {
    const fb = skill.fallback;
    if (fb.randomDestroyBlockerCount > 0) {
      if (this.clearBossCoinBlockers(null, fb.randomDestroyBlockerCount, false) > 0) return true;
    }
    if (fb.rewardType.toLowerCase() === "score" && fb.rewardAmount > 0) {
      this.currentScore += fb.rewardAmount;
      this.events.push({ type: "score", delta: fb.rewardAmount, total: this.currentScore });
      return true;
    }
    return false;
  }

  private resolveBossCoinFlyTileType(): number {
    for (const def of this.blockersByType.values()) {
      if (def.bIsMouthBlocker && def.MouthFlyTileType > 0) return def.MouthFlyTileType;
    }
    return this.config.TilePool.TileTypes.find((t) => t > 0) ?? 1;
  }

  /**
   * Clear up to `limit` BossCoin-targetable blockers (0 = all). `forceInstant`
   * ignores direct-hit immunity and breaks regardless of HP.
   */
  private clearBossCoinBlockers(typeFilter: number[] | null, limit: number, forceInstant: boolean): number {
    const targets: number[] = [];
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.bUsable || c.BlockerType <= 0 || c.BlockerHP <= 0) continue;
      if (c.BlockerType === 22) continue; // moss mushroom is never a coin target
      if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(c.BlockerType)) continue;
      if (!c.bBlockerDestructible) continue;
      const def = this.blockerDef(c);
      if (def?.bImmuneToDirectHitDamage && !forceInstant) continue;
      targets.push(i);
    }
    this.shuffleInPlace(targets);
    const take = limit > 0 ? Math.min(limit, targets.length) : targets.length;
    const hits: BlockerHitEvent["hits"] = [];
    for (let k = 0; k < take; k++) {
      const idx = targets[k];
      if (forceInstant) this.cells[idx].BlockerHP = 1;
      hits.push(this.hitBlocker(idx));
      if (this.cells[idx].BlockerType === 0 && this.cells[idx].TileType === 0) this.bossCoinEmptied.push(idx);
    }
    if (hits.length) this.events.push({ type: "blockerHit", hits });
    return hits.length;
  }

  private clearBossCoinLarvae(): number {
    let n = 0;
    for (const c of this.cells) {
      if (c.bLarvae) {
        c.bLarvae = false;
        n++;
      }
    }
    if (n) this.events.push({ type: "refresh" });
    return n;
  }

  private clearBossCoinSticky(): number {
    let n = 0;
    for (const c of this.cells) {
      if (c.bSticky) {
        c.bSticky = false;
        n++;
      }
    }
    if (n) this.events.push({ type: "refresh" });
    return n;
  }

  private clearBossCoinBubbles(): number {
    let n = 0;
    for (const c of this.cells) {
      if (c.bBubble) {
        c.bBubble = false;
        n++;
      }
    }
    if (n) this.events.push({ type: "refresh" });
    return n;
  }

  /** ConvertBlockersToTiles: pick the blockers-heaviest rows and turn them into tiles. */
  private bossCoinConvertBlockersToTiles(skill: BossCoinSkill): boolean {
    const targetRows = skill.primaryCount > 0 ? skill.primaryCount : 2;
    const filter = skill.blockerTypeIds;
    const rowCounts: Array<{ row: number; count: number }> = [];
    for (let r = 0; r < this.rows; r++) {
      let n = 0;
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r * this.cols + c];
        if (!cell.bUsable || cell.BlockerType <= 0 || cell.BlockerHP <= 0) continue;
        if (filter.length > 0 && !filter.includes(cell.BlockerType)) continue;
        n++;
      }
      if (n > 0) rowCounts.push({ row: r, count: n });
    }
    rowCounts.sort((a, b) => b.count - a.count);
    const chosenRows = rowCounts.slice(0, targetRows);
    const hits: BlockerHitEvent["hits"] = [];
    for (const { row } of chosenRows) {
      for (let c = this.cols - 1; c >= 0; c--) {
        const idx = row * this.cols + c;
        const cell = this.cells[idx];
        if (!cell.bUsable || cell.BlockerType <= 0 || cell.BlockerHP <= 0) continue;
        if (filter.length > 0 && !filter.includes(cell.BlockerType)) continue;
        if (cell.BlockerType === 22) continue;
        cell.BlockerHP = 1;
        hits.push(this.hitBlocker(idx));
        if (cell.BlockerType === 0 && cell.TileType === 0) cell.TileType = this.rollRandomTileType();
      }
    }
    let changed = hits.length > 0;
    if (hits.length) this.events.push({ type: "blockerHit", hits });
    if (skill.bClearAllBubbles && this.clearBossCoinBubbles() > 0) changed = true;
    if (changed) this.events.push({ type: "refresh" });
    return changed;
  }

  /** ClearCockroachAndSpawnSpecials: spawn specials first, then clear blockers. */
  private bossCoinSpawnSpecialsAndClear(skill: BossCoinSkill): boolean {
    const pool = skill.spawnSpecialPool
      .map((s) => parseSpecialType(s))
      .filter((s) => s !== SpecialType.None);
    let spawned = 0;
    if (pool.length > 0) {
      const count = skill.secondaryCount > 0 ? skill.secondaryCount : 2;
      const candidates: number[] = [];
      for (let i = 0; i < this.cells.length; i++) {
        const c = this.cells[i];
        if (c.bUsable && c.BlockerType === 0 && c.TileType > 0 && c.SpecialType === SpecialType.None) candidates.push(i);
      }
      this.shuffleInPlace(candidates);
      const take = Math.min(count, candidates.length);
      for (let k = 0; k < take; k++) {
        const c = this.cells[candidates[k]];
        c.TileType = 0;
        c.SpecialType = pool[this.prng.intRange(0, pool.length - 1)];
        c.bSticky = false;
        c.bLarvae = false;
        spawned++;
      }
      if (spawned) this.events.push({ type: "refresh" });
    }
    const clearLimit = skill.primaryCount > 0 ? skill.primaryCount : 0;
    const cleared = this.clearBossCoinBlockers(skill.blockerTypeIds, clearLimit, true);
    return spawned + cleared > 0;
  }

  private shuffleInPlace<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.prng.intRange(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ─────────────────────────────── items ───────────────────────────────

  /**
   * Tool items (§5.9/§5.10). They never consume a move. Handlers are pure board
   * mutations returning the animation event stream; inventory/limit bookkeeping
   * lives in the flow layer.
   */
  useHammer(coord: Coord): SwapResult {
    return this.runItem((events) => {
      const idx = this.index(coord.row, coord.col);
      const c = this.cells[idx];
      if (!c.bUsable) return false;
      if (c.BlockerType > 0) {
        if (!c.bBlockerDestructible) return false;
        c.BlockerHP = 1; // force-break regardless of HP/immunity
        events.push({ type: "blockerHit", hits: [this.hitBlocker(idx)] });
        this.resolveCascade(new Set([idx]), ClearTriggerType.HammerTool, true);
        return true;
      }
      if (c.TileType > 0 || c.SpecialType !== SpecialType.None) {
        this.resolveCascade(new Set([idx]), ClearTriggerType.HammerTool, true);
        return true;
      }
      return false;
    });
  }

  useRocket(coord: Coord): SwapResult {
    return this.runItem((events) => {
      const clear = new Set<number>();
      const hits: BlockerHitEvent["hits"] = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = coord.row + dr;
          const col = coord.col + dc;
          if (r < 0 || r >= this.rows || col < 0 || col >= this.cols) continue;
          const idx = r * this.cols + col;
          const c = this.cells[idx];
          if (!c.bUsable) continue;
          if (c.BlockerType > 0 && c.bBlockerDestructible && c.BlockerHP > 0) {
            c.BlockerHP = 1; // force-break in the blast
            hits.push(this.hitBlocker(idx));
          }
          clear.add(idx);
        }
      }
      if (hits.length) events.push({ type: "blockerHit", hits });
      if (clear.size === 0) return hits.length > 0;
      this.resolveCascade(clear, ClearTriggerType.RocketTool, true);
      return true;
    });
  }

  /** Shuffle tool: re-shuffle all tiles until the board has a move and no free match. */
  useShuffle(): SwapResult {
    return this.runItem((events) => {
      let ev = this.shuffleAllTiles();
      let guard = 0;
      while (!(this.hasAnyPossibleMove() && this.computeMatches().matched.size === 0) && guard++ < 40) {
        ev = this.shuffleAllTiles();
      }
      events.push(ev);
      return true;
    });
  }

  /** Glove tool: swap any two cells (subject to Glove* rules). Cascades if a match forms. */
  useGlove(a: Coord, b: Coord): SwapResult {
    return this.runItem(() => {
      const ia = this.index(a.row, a.col);
      const ib = this.index(b.row, b.col);
      if (ia === ib) return false;
      if (!this.canGloveSwap(ia) || !this.canGloveSwap(ib)) return false;
      const ca = this.cells[ia];
      const cb = this.cells[ib];
      this.swapCellPayload(ca, cb);
      if (this.computeMatches().matched.size > 0) {
        this.resolveCascade(null, ClearTriggerType.NormalMatch, false);
      } else {
        this.events.push({ type: "refresh" });
      }
      return true;
    });
  }

  /** Finger tool: clear the tiles/blockers along the dragged path. */
  useFinger(indices: number[]): SwapResult {
    return this.runItem(() => {
      const clear = new Set<number>();
      for (const idx of indices) {
        const c = this.cells[idx];
        if (!c || !c.bUsable) continue;
        if (c.BlockerType > 0) continue; // finger clears elements, not blockers
        if (c.TileType > 0 || c.SpecialType !== SpecialType.None) clear.add(idx);
      }
      if (clear.size === 0) return false;
      this.resolveCascade(clear, ClearTriggerType.FingerTool, true);
      return true;
    });
  }

  private runItem(apply: (events: BoardEvent[]) => boolean): SwapResult {
    this.events = [];
    const reject = (): SwapResult => ({
      accepted: false,
      combo: false,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    });
    if (this.levelFinished || this.state !== BoardState.Idle) return reject();
    this.ultimateCountedThisTurn = true; // tools never charge the ultimate
    const ok = apply(this.events);
    if (!ok) return reject();
    this.state = BoardState.Idle;
    this.evaluateFinishState();
    return {
      accepted: true,
      combo: false,
      events: this.events,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
    };
  }

  /** Glove swappability under Rules.Glove* (§2.4.4). */
  canGloveSwap(idx: number): boolean {
    const c = this.cells[idx];
    if (!c || !c.bUsable) return false;
    const r = this.config.Rules;
    if (c.bSticky && !r.bGloveAllowStickyCell) return false;
    if (c.bLarvae && !r.bGloveAllowLarvaeCell) return false;
    if (c.bBubble && !r.bGloveAllowPipeCell) return false;
    if (this.isFrozen(idx) && !r.bGloveAllowFrozenCell) return false;
    if (c.bMovementLocked && !r.bGloveAllowMovementLockedCell) return false;
    if (r.GloveDisallowTileTypes.includes(c.TileType)) return false;
    if (c.BlockerType > 0 && (!r.bGloveAllowBlockers || r.GloveDisallowBlockerTypeIds.includes(c.BlockerType))) {
      return false;
    }
    if (c.BlockerType === 0 && c.SpecialType !== SpecialType.None && !r.bGloveAllowSpecialTiles) return false;
    if (c.BlockerType === 0 && c.SpecialType === SpecialType.None && c.TileType > 0 && !r.bGloveAllowNormalTiles) {
      return false;
    }
    return true;
  }

  private swapCellPayload(a: Cell, b: Cell): void {
    const fields: Array<keyof Cell> = [
      "TileType",
      "SpecialType",
      "BlockerType",
      "bBlockerDestructible",
      "BlockerHP",
      "BlockerTransformTarget",
      "RewardVariantId",
      "bSticky",
      "bLarvae",
      "bBubble",
      "bPoisoned",
      "bSpecialPoisoned",
    ];
    for (const f of fields) {
      const tmp = a[f];
      (a as unknown as Record<string, unknown>)[f] = b[f];
      (b as unknown as Record<string, unknown>)[f] = tmp;
    }
  }

  // ─────────────────────────────── blockers ───────────────────────────────

  /**
   * Damage blockers: first by direct hit (a blocker sitting inside the special
   * effect area, e.g. a line/bomb path), then by adjacent clear.
   */
  private damageBlockers(clear: Set<number>, trigger: ClearTriggerType): BlockerHitEvent["hits"] {
    const hits: BlockerHitEvent["hits"] = [];
    const damaged = new Set<number>();

    // direct hits: blockers occupying a cleared cell
    for (const idx of clear) {
      const c = this.cells[idx];
      if (!c.bUsable || c.BlockerType <= 0 || !c.bBlockerDestructible || c.BlockerHP <= 0) continue;
      if (damaged.has(idx)) continue;
      const def = this.blockerDef(c);
      const bypassImmunity =
        trigger === ClearTriggerType.SpecialExplosion && def?.bAdjacentDamageAllowSpecialExplosion === true;
      if (def?.bImmuneToDirectHitDamage && !bypassImmunity) continue;
      damaged.add(idx);
      hits.push(this.hitBlocker(idx));
    }

    // adjacent (collateral) damage from cleared tiles.
    // Special-block sweeps (line/bomb/color) are "direct clear": they only
    // damage blockers in the cells they pass through, never the neighbours.
    if (trigger === ClearTriggerType.SpecialExplosion) {
      return hits.filter(Boolean) as BlockerHitEvent["hits"];
    }

    for (const idx of clear) {
      const c = this.cells[idx];
      if (!c.bUsable || c.BlockerType > 0 || c.bBubble) continue;
      if (this.isInert(c.TileType)) continue;
      const { row, col } = this.coord(idx);
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const r = row + dr;
        const cc = col + dc;
        if (r < 0 || r >= this.rows || cc < 0 || cc >= this.cols) continue;
        const j = r * this.cols + cc;
        const b = this.cells[j];
        if (!b.bUsable || b.BlockerType <= 0 || !b.bBlockerDestructible || b.BlockerHP <= 0) continue;
        if (damaged.has(j)) continue;
        const def = this.blockerDef(b);
        const canAdjacent = def ? def.bDamageByAdjacentClear : b.BlockerType === 7;
        if (!canAdjacent) continue;
        damaged.add(j);
        hits.push(this.hitBlocker(j));
      }
    }
    return hits.filter(Boolean) as BlockerHitEvent["hits"];
  }

  private hitBlocker(idx: number): BlockerHitEvent["hits"][number] {
    const c = this.cells[idx];
    c.BlockerHP -= 1;
    const type = c.BlockerType;
    let broken = false;
    if (c.BlockerHP <= 0) {
      const def = this.blockerDef(c);
      const breakScore = def && def.BreakScore >= 0 ? def.BreakScore : this.config.Score.BlockerBreakScore;
      this.currentScore += breakScore;
      this.brokenBlockerCount++;
      this.brokenBlockerTypeCounts.set(type, (this.brokenBlockerTypeCounts.get(type) ?? 0) + 1);
      broken = true;
      if (def?.bSignalOnBreak && def.BreakSignalTag && def.BreakSignalTag !== "None") {
        this.boss?.applySignalDamage(def.BreakSignalTag, this.events);
      }
      // transform or clear
      if (def?.bTransformOnFinalStageBreak && def.FinalStageTransformBlockerType > 0) {
        const target = c.BlockerTransformTarget > 0 ? c.BlockerTransformTarget : def.FinalStageTransformBlockerType;
        const tdef = this.blockersByType.get(target);
        c.BlockerType = target;
        c.bBlockerDestructible = tdef ? tdef.bDestructible : true;
        c.BlockerHP = tdef ? tdef.DefaultHP : 1;
        broken = false;
      } else {
        c.BlockerType = 0;
        c.bBlockerDestructible = true;
        c.BlockerHP = 0;
        c.BlockerTransformTarget = 0;
      }
    }
    return { index: idx, blockerType: type, hpAfter: c.BlockerHP, broken };
  }

  // ─────────────────────────────── gravity ───────────────────────────────

  /**
   * Gravity: pieces fall vertically first; when vertical is blocked they may
   * slide diagonally (down-left / down-right). Blockers never move and refill
   * only fills the empties left at the top of each segment.
   */
  applyGravityAndRefill(): {
    moves: FallEvent["moves"];
    spawns: SpawnEvent["spawns"];
  } {
    const moves: FallEvent["moves"] = [];
    let guard = 0;
    while (guard++ < 200) {
      if (this.gravityVertical(moves)) continue; // vertical has priority
      if (this.gravityDiagonal(moves)) continue; // then diagonal
      break;
    }

    const spawns: SpawnEvent["spawns"] = [];
    for (let col = 0; col < this.cols; col++) {
      for (let row = 0; row < this.rows; row++) {
        const idx = row * this.cols + col;
        if (this.isSolidForGravity(idx)) continue;
        const c = this.cells[idx];
        if (c.BlockerType > 0) continue; // never fill a blocker cell
        if (c.TileType === 0 && c.SpecialType === SpecialType.None) {
          const t = this.rollRandomTileType();
          c.TileType = t;
          spawns.push({ index: idx, tileType: t });
        }
      }
    }
    return { moves, spawns };
  }

  /** One vertical compaction step; returns true when something moved. */
  private gravityVertical(moves: FallEvent["moves"]): boolean {
    let changed = false;
    for (let col = 0; col < this.cols; col++) {
      let row = this.rows - 1;
      while (row >= 0) {
        const idx = row * this.cols + col;
        if (this.isSolidForGravity(idx)) {
          row--;
          continue;
        }
        let top = row;
        while (top - 1 >= 0 && !this.isSolidForGravity((top - 1) * this.cols + col)) top--;

        const entries: Array<{ tileType: number; special: SpecialType; from: number }> = [];
        for (let r = top; r <= row; r++) {
          const i = r * this.cols + col;
          const c = this.cells[i];
          if (c.TileType > 0 || c.SpecialType !== SpecialType.None) {
            entries.push({ tileType: c.TileType, special: c.SpecialType, from: i });
          }
          c.TileType = 0;
          c.SpecialType = SpecialType.None;
        }
        let write = row;
        for (let e = entries.length - 1; e >= 0; e--) {
          const entry = entries[e];
          const to = write * this.cols + col;
          const c = this.cells[to];
          c.TileType = entry.tileType;
          c.SpecialType = entry.special;
          if (entry.from !== to) {
            moves.push({ from: entry.from, to, tileType: entry.tileType, special: entry.special });
            changed = true;
          }
          write--;
        }
        row = top - 1;
      }
    }
    return changed;
  }

  /** One diagonal step for pieces whose cell below is blocked; returns true if moved. */
  private gravityDiagonal(moves: FallEvent["moves"]): boolean {
    let moved = false;
    for (let row = this.rows - 2; row >= 0; row--) {
      for (let col = 0; col < this.cols; col++) {
        const idx = row * this.cols + col;
        const c = this.cells[idx];
        if (this.isSolidForGravity(idx)) continue;
        if (c.TileType === 0 && c.SpecialType === SpecialType.None) continue;

        const below = (row + 1) * this.cols + col;
        const canFallDown = !this.isSolidForGravity(below) && this.isEmptyCell(below);
        if (canFallDown) continue; // vertical handles it first

        const dirs = this.prng.next() < 0.5 ? [-1, 1] : [1, -1];
        for (const dc of dirs) {
          const nc = col + dc;
          if (nc < 0 || nc >= this.cols) continue;
          const j = (row + 1) * this.cols + nc;
          if (this.isSolidForGravity(j) || !this.isEmptyCell(j)) continue;
          const t = this.cells[j];
          t.TileType = c.TileType;
          t.SpecialType = c.SpecialType;
          moves.push({ from: idx, to: j, tileType: c.TileType, special: c.SpecialType });
          c.TileType = 0;
          c.SpecialType = SpecialType.None;
          moved = true;
          break;
        }
      }
    }
    return moved;
  }

  private isEmptyCell(idx: number): boolean {
    const c = this.cells[idx];
    return c.bUsable && c.BlockerType === 0 && c.TileType === 0 && c.SpecialType === SpecialType.None;
  }

  /**
   * Per-turn blocker dynamics (§3.9): spread first, then movable blockers.
   * Returns true if the board changed (caller emits a refresh).
   */
  private applyTurnBlockers(): { changed: boolean; escaped: boolean } {
    // Design rule: blockers are static — they never fall or move on their own.
    if (!ENABLE_TURN_BLOCKER_DYNAMICS) return { changed: false, escaped: false };
    if (this.usedMoves <= this.lastBlockerMove) return { changed: false, escaped: false };
    this.lastBlockerMove = this.usedMoves;
    let changed = false;
    let escaped = false;

    // spreading blockers
    for (const def of this.blockersByType.values()) {
      if (!def.bSpreadEachTurn) continue;
      const sources = this.cells.filter((c) => c.BlockerType === def.TypeId && c.BlockerHP > 0);
      if (sources.length === 0) continue;
      let spread = Math.max(0, def.SpreadCountPerTurn);
      for (const src of sources) {
        if (spread <= 0) break;
        const idx = this.cells.indexOf(src);
        const { row, col } = this.coord(idx);
        const neighbors = this.shuffledNeighbors(row, col);
        for (const j of neighbors) {
          if (spread <= 0) break;
          const t = this.cells[j];
          if (!t.bUsable || t.BlockerType > 0 || t.bMovementLocked) continue;
          if (def.bSpreadAsSticky) {
            t.bSticky = true;
          } else {
            t.BlockerType = def.TypeId;
            t.bBlockerDestructible = def.bDestructible;
            t.BlockerHP = Math.max(1, def.DefaultHP);
            t.TileType = 0;
            t.SpecialType = SpecialType.None;
          }
          spread--;
          changed = true;
        }
      }
    }

    // movable blockers: step 1 cell toward the nearest edge (or random)
    for (const def of this.blockersByType.values()) {
      if (!def.bMovable) continue;
      const sources = this.cells.map((c, i) => ({ c, i })).filter((x) => x.c.BlockerType === def.TypeId && !x.c.bMovementLocked);
      for (const { c, i } of sources) {
        const { row, col } = this.coord(i);
        let dr = 0;
        let dc = 0;
        if (def.bMoveRandomEachTurn) {
          const dirs = [
            [0, -1],
            [0, 1],
            [-1, 0],
            [1, 0],
          ] as const;
          const d = dirs[this.prng.intRange(0, 3)];
          dr = d[0];
          dc = d[1];
        } else if (col < (this.cols - 1) / 2) dc = -1;
        else if (col > (this.cols - 1) / 2) dc = 1;
        else if (row < (this.rows - 1) / 2) dr = -1;
        else dr = 1;

        const tr = row + dr;
        const tc = col + dc;
        if (tr < 0 || tr >= this.rows || tc < 0 || tc >= this.cols) {
          if (def.bFailOnEscape !== false) escaped = true;
          continue;
        }
        const j = tr * this.cols + tc;
        const t = this.cells[j];
        if (!t.bUsable || t.BlockerType > 0 || t.bMovementLocked) {
          // blocked; if pinned at edge count as escape attempt
          const atEdge = tr < 0 || tr >= this.rows || tc < 0 || tc >= this.cols;
          if (atEdge && def.bFailOnEscape !== false) escaped = true;
          continue;
        }
        t.BlockerType = def.TypeId;
        t.bBlockerDestructible = def.bDestructible;
        t.BlockerHP = c.BlockerHP;
        t.BlockerTransformTarget = c.BlockerTransformTarget;
        t.TileType = 0;
        t.SpecialType = SpecialType.None;
        c.BlockerType = 0;
        c.BlockerHP = 0;
        changed = true;
      }
    }
    return { changed, escaped };
  }

  private shuffledNeighbors(row: number, col: number): number[] {
    const out: number[] = [];
    for (const [dr, dc] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ] as const) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) continue;
      out.push(r * this.cols + c);
    }
    return this.prng.shuffle(out);
  }

  // ─────────────────────────────── deadlock ───────────────────────────────

  hasAnyPossibleMove(): boolean {
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.bUsable || c.BlockerType > 0 || c.bBubble || c.bSticky || c.bMovementLocked) continue;
      if (this.isFrozen(i)) continue;
      if (
        c.SpecialType === SpecialType.Bomb3x3 ||
        c.SpecialType === SpecialType.LineHorizontal ||
        c.SpecialType === SpecialType.LineVertical
      ) {
        return true;
      }
    }
    return this.findOnePossibleSwap() !== null;
  }

  findOnePossibleSwap(): [Coord, Coord] | null {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const a: Coord = { row: r, col: c };
        if (!this.isDeadlockCandidate(a)) continue;
        for (const [dr, dc] of [
          [0, 1],
          [1, 0],
        ] as const) {
          const b: Coord = { row: r + dr, col: c + dc };
          if (b.row >= this.rows || b.col >= this.cols) continue;
          if (!this.isDeadlockCandidate(b)) continue;
          const ia = this.index(a.row, a.col);
          const ib = this.index(b.row, b.col);
          // ColorBomb always counts
          if (
            this.cells[ia].SpecialType === SpecialType.ColorBomb ||
            this.cells[ib].SpecialType === SpecialType.ColorBomb
          ) {
            return [a, b];
          }
          this.swapCells(ia, ib);
          const has = this.computeMatches().matched.size > 0;
          this.swapCells(ia, ib);
          if (has) return [a, b];
        }
      }
    }
    return null;
  }

  private isDeadlockCandidate(coord: Coord): boolean {
    const i = this.index(coord.row, coord.col);
    const c = this.cells[i];
    return (
      c.bUsable &&
      c.BlockerType === 0 &&
      !c.bBubble &&
      !c.bSticky &&
      !c.bMovementLocked &&
      !this.isFrozen(i) &&
      c.SpecialType === SpecialType.None &&
      c.TileType > 0
    );
  }

  /** §3.11.3 — Fisher–Yates re-shuffle, then re-check start rules. */
  shuffleAllTiles(): ShuffleEvent {
    const pool: Array<{ idx: number; tileType: number }> = [];
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (
        c.bUsable &&
        c.BlockerType === 0 &&
        !c.bBubble &&
        !c.bSticky &&
        !c.bMovementLocked &&
        c.SpecialType === SpecialType.None &&
        c.TileType > 0
      ) {
        pool.push({ idx: i, tileType: c.TileType });
      }
    }
    const before = pool.map((p) => p.tileType);
    const shuffled = this.prng.shuffle([...before]);
    const tiles: ShuffleEvent["tiles"] = [];
    pool.forEach((p, i) => {
      this.cells[p.idx].TileType = shuffled[i];
      tiles.push({ index: p.idx, fromTileType: before[i], toTileType: shuffled[i] });
    });
    for (let attempt = 0; attempt < 50; attempt++) {
      if (this.hasAnyPossibleMove() && this.computeMatches().matched.size === 0) break;
      this.ensureStartRules(true);
    }
    return { type: "shuffle", tiles };
  }

  // ─────────────────────────────── finish ───────────────────────────────

  private goalsSatisfied(): boolean {
    for (const g of this.config.Goal.Collect) {
      if ((this.collectedByTileType.get(g.TileType) ?? 0) < g.Count) return false;
    }
    if (this.config.Goal.BlockerBreakByType.length > 0) {
      for (const g of this.config.Goal.BlockerBreakByType) {
        if ((this.brokenBlockerTypeCounts.get(g.TypeId) ?? 0) < g.Count) return false;
      }
    } else if (this.config.Goal.TargetBlockerBreakCount > 0) {
      if (this.brokenBlockerCount < this.config.Goal.TargetBlockerBreakCount) return false;
    }
    return true;
  }

  evaluateVictory(): boolean {
    if (this.boss) return this.boss.currentHp <= 0;
    return this.goalsSatisfied();
  }

  get moveBudget(): number {
    return Math.max(0, this.config.Goal.MaxMoves + this.bonusMoves);
  }

  get remainingMoves(): number {
    return Math.max(0, this.moveBudget - this.usedMoves);
  }

  evaluateFailureReason(): FinishReason {
    if (this.usedMoves >= this.moveBudget && !this.victory) return FinishReason.MovesExhausted;
    if (this.boss) {
      const seal = this.boss.config.sealFailThreshold;
      if (seal > 0 && this.boss.getSealRatio() >= seal) return FinishReason.BoardFullySealed;
    }
    return FinishReason.None;
  }

  private evaluateFinishState(): void {
    if (this.levelFinished) return;
    if (this.boss) this.boss.processTurn(this.usedMoves, this.events);
    const blockers = this.applyTurnBlockers();
    if (blockers.changed) this.events.push({ type: "refresh" });
    if (blockers.escaped) {
      this.levelFinished = true;
      this.lastFinishReason = FinishReason.BlockerEscaped;
      return;
    }
    if (this.evaluateVictory()) {
      this.victory = true;
      this.levelFinished = true;
      this.lastFinishReason = FinishReason.GoalReached;
      return;
    }
    const reason = this.evaluateFailureReason();
    if (reason !== FinishReason.None) {
      this.levelFinished = true;
      this.lastFinishReason = reason;
      return;
    }
    // Deadlock: no swap can form a match -> reshuffle; if still unsolvable, defeat.
    if (this.config.Rules.bEnsureAtLeastOneMove && !this.hasAnyPossibleMove()) {
      if (!this.ensureSolvableAfterDeadlock()) {
        this.levelFinished = true;
        this.lastFinishReason = FinishReason.NoPossibleMove;
      }
    }
  }

  /**
   * Reshuffle until the board has a valid move and no immediate match.
   * Returns false if no solvable arrangement is found (defeat).
   */
  /**
   * Reshuffle until the board has a valid move and no immediate match.
   * Returns false if no solvable arrangement is found (=> defeat).
   */
  ensureSolvableAfterDeadlock(): boolean {
    for (let attempt = 0; attempt < 50; attempt++) {
      const ev = this.shuffleAllTiles();
      this.events.push(ev);
      if (this.hasAnyPossibleMove() && this.computeMatches().matched.size === 0) return true;
    }
    return false;
  }

  /** §3.12 — returns stars 0..5 (0 when not victory). */
  computeStars(): number {
    if (!this.victory) return 0;
    const st = this.config.StarRating;
    const baseline = this.config.Goal.TargetScore > 0 ? this.config.Goal.TargetScore : st.ThreeStarScore;
    const scoreNorm = clamp(this.currentScore / baseline, 0, Math.max(0.01, st.ScoreNormCap));
    const moveNorm = this.config.Goal.MaxMoves > 0 ? clamp(this.remainingMoves / this.config.Goal.MaxMoves, 0, 1) : 0;
    const totalRequired = this.config.Goal.Collect.reduce((a, g) => a + Math.max(0, g.Count), 0);
    const totalOver = this.config.Goal.Collect.reduce(
      (a, g) => a + Math.max(0, (this.collectedByTileType.get(g.TileType) ?? 0) - g.Count),
      0
    );
    const overNorm =
      totalRequired > 0 ? clamp(totalOver / totalRequired, 0, Math.max(0.01, st.OverCollectNormCap)) : 0;
    const weightSum = st.ScoreWeight + st.MoveWeight;
    const base = weightSum > 1e-4 ? (st.ScoreWeight * scoreNorm + st.MoveWeight * moveNorm) / weightSum : 0;
    const starValue = base + Math.max(0, st.OverCollectWeight) * overNorm;

    let stars = 1;
    const min4 = st.MinScoreFor4Star > 0 ? st.MinScoreFor4Star : st.MinScoreFor3Star;
    const min5 = st.MinScoreFor5Star > 0 ? st.MinScoreFor5Star : min4;
    if (starValue >= st.TwoStarThreshold && this.currentScore >= st.MinScoreFor2Star) stars = 2;
    if (starValue >= st.ThreeStarThreshold && this.currentScore >= st.MinScoreFor3Star) stars = 3;
    if (starValue >= st.FourStarThreshold && this.currentScore >= min4) stars = 4;
    if (starValue >= st.FiveStarThreshold && this.currentScore >= min5) stars = 5;
    return stars;
  }

  // ───────────────────────── BossBoardAdapter ─────────────────────────

  get adapterRows(): number {
    return this.rows;
  }
  get adapterCols(): number {
    return this.cols;
  }
  adapterCoord(i: number): { row: number; col: number } {
    return this.coord(i);
  }
  adapterCell(i: number): Cell {
    return this.cells[i];
  }
  adapterAllIndices(): number[] {
    return this.cells.map((_, i) => i);
  }
  adapterBlockerDefs(): BlockerTypeDef[] {
    return [...this.blockersByType.values()];
  }
  adapterTileTypes(): number[] {
    return this.config.TilePool.TileTypes;
  }
  adapterRollRandomTileType(): number {
    return this.rollRandomTileType();
  }
  shuffleArray<T>(arr: T[]): T[] {
    return this.prng.shuffle(arr);
  }
  adapterHasBoardDrivenWeakness(): boolean {
    for (const def of this.blockersByType.values()) {
      if (def.bWeaknessBlocker && def.WeaknessBossDamagePerHit > 0) return true;
    }
    return false;
  }

  adapterFreezeRandom(count: number, turns: number, onlySpecial: boolean): number[] {
    const cand: number[] = [];
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      if (!c.bUsable || c.BlockerType > 0) continue;
      if (c.TileType === 0 && c.SpecialType === SpecialType.None) continue;
      if (this.isFrozen(i)) continue;
      if (onlySpecial && c.SpecialType === SpecialType.None) continue;
      cand.push(i);
    }
    this.prng.shuffle(cand);
    const applied = cand.slice(0, Math.min(count, cand.length));
    for (const idx of applied) this.freezeCell(idx, turns);
    return applied;
  }

  adapterTickFrozen(): void {
    this.tickFrozen();
  }

  adapterFrozenUsableRatio(): number {
    return this.frozenUsableRatio();
  }

  adapterConvertToBlocker(indices: number[], type: number, hp: number): void {
    const def = this.blockersByType.get(type);
    for (const idx of indices) {
      const c = this.cells[idx];
      c.BlockerType = type;
      c.bBlockerDestructible = def ? def.bDestructible : true;
      c.BlockerHP = c.bBlockerDestructible ? Math.max(1, hp) : 0;
      c.TileType = 0;
      c.SpecialType = SpecialType.None;
      c.bSticky = false;
      c.bLarvae = false;
      c.bBubble = false;
      if (def?.bCorrodeToMaskOnTimeout) {
        this.corrosionDeadline.set(idx, Date.now() / 1000 + Math.max(0.1, def.CorrodeDelaySeconds));
      } else {
        this.corrosionDeadline.delete(idx);
      }
    }
  }

  adapterAddLarvae(indices: number[]): void {
    for (const idx of indices) this.cells[idx].bLarvae = true;
  }

  adapterCorrodeToMask(indices: number[]): void {
    for (const idx of indices) {
      const c = this.cells[idx];
      c.bUsable = false;
      c.BlockerType = 0;
      c.BlockerHP = 0;
      c.TileType = 0;
      c.SpecialType = SpecialType.None;
      c.bSticky = false;
      c.bLarvae = false;
      this.frozenTurns.delete(idx);
    }
  }

  adapterClearAllSpecials(): number {
    let n = 0;
    for (const c of this.cells) {
      if (c.bUsable && c.BlockerType === 0 && c.SpecialType !== SpecialType.None) {
        c.SpecialType = SpecialType.None;
        n++;
      }
    }
    return n;
  }

  adapterShuffleTiles(): void {
    this.shuffleAllTiles();
  }

  adapterHasImmediateMatch(): boolean {
    return this.computeMatches().matched.size > 0;
  }

  adapterResolveFromShuffle(_events: BoardEvent[]): void {
    this.resolveCascade(null, ClearTriggerType.SpecialExplosion, true);
  }

  /** Drive timed boss skills from the render loop. Returns events to animate. */
  updateBossTimed(nowSeconds: number): BoardEvent[] {
    if (!this.boss) return [];
    this.events = [];
    this.boss.updateTimed(nowSeconds, this.events);
    return this.events;
  }

  /** Process corrode-to-mask deadlines (time based). Returns number of cells changed. */
  updateCorrosion(nowSeconds: number): boolean {
    if (this.corrosionDeadline.size === 0) return false;
    let changed = false;
    for (const [idx, deadline] of [...this.corrosionDeadline]) {
      if (nowSeconds < deadline) continue;
      const c = this.cells[idx];
      this.corrosionDeadline.delete(idx);
      if (!c.bUsable || c.BlockerType <= 0) continue;
      const def = this.blockersByType.get(c.BlockerType);
      if (!def?.bCorrodeToMaskOnTimeout) continue;
      this.adapterCorrodeToMask([idx]);
      changed = true;
    }
    return changed;
  }

  snapshot(): {
    score: number;
    usedMoves: number;
    remainingMoves: number;
    victory: boolean;
    finished: boolean;
    finishReason: FinishReason;
    stars: number;
    seed: number;
  } {
    return {
      score: this.currentScore,
      usedMoves: this.usedMoves,
      remainingMoves: this.remainingMoves,
      victory: this.victory,
      finished: this.levelFinished,
      finishReason: this.lastFinishReason,
      stars: this.computeStars(),
      seed: this.randomSeed,
    };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
