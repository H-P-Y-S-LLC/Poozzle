/**
 * Boss runtime: HP, weaknesses, hard shell, rebirth phases, skill scheduler + effects.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §4.
 *
 * Pure logic — no three/DOM. Interacts with the board through BossBoardAdapter.
 */
import { SpecialType } from "./Match3Types.js";
import type { BoardEvent } from "./BoardLogic.js";
import type { BossConfig, BossRebirthPhase, BossSkill } from "../config/types/BossConfig.js";
import { Prng } from "../core/Prng.js";

export interface BossEventBase {
  type: string;
}
export interface BossHpEvent extends BossEventBase {
  type: "bossHp";
  current: number;
  max: number;
  delta: number;
}
export interface BossSkillEvent extends BossEventBase {
  type: "bossSkill";
  skillId: string;
}
export interface BossPhaseEvent extends BossEventBase {
  type: "bossPhase";
  phase: number;
  maxHp: number;
  currentHp: number;
}
export interface BossConvertEvent extends BossEventBase {
  type: "bossConvert";
  skillId: string;
  indices: number[];
}
export interface BossTargetsEvent extends BossEventBase {
  type: "bossTargets";
  skillId: string;
  indices: number[];
  color: number;
}
export type BossEvent = BossHpEvent | BossSkillEvent | BossPhaseEvent | BossConvertEvent | BossTargetsEvent;

export interface BossBoardAdapter {
  readonly adapterRows: number;
  readonly adapterCols: number;
  adapterCoord(i: number): { row: number; col: number };
  adapterCell(i: number): {
    bUsable: boolean;
    BlockerType: number;
    bBlockerDestructible: boolean;
    BlockerHP: number;
    TileType: number;
    SpecialType: SpecialType;
    bSticky: boolean;
    bLarvae: boolean;
  };
  adapterAllIndices(): number[];
  adapterBlockerDefs(): Array<{
    TypeId: number;
    bDestructible: boolean;
    DefaultHP: number;
    bCorrodeToMaskOnTimeout: boolean;
  }>;
  adapterTileTypes(): number[];
  adapterRollRandomTileType(): number;
  adapterFreezeRandom(count: number, turns: number, onlySpecial: boolean): number[];
  adapterTickFrozen(): void;
  adapterFrozenUsableRatio(): number;
  adapterConvertToBlocker(indices: number[], type: number, hp: number): void;
  adapterAddLarvae(indices: number[]): void;
  adapterCorrodeToMask(indices: number[]): void;
  adapterClearAllSpecials(): number;
  adapterShuffleTiles(): void;
  adapterHasImmediateMatch(): boolean;
  adapterResolveFromShuffle(events: BoardEvent[]): void;
  adapterHasBoardDrivenWeakness(): boolean;
  shuffleArray<T>(arr: T[]): T[];
}

const HARD_SHELL_NAMES = new Set(["hard_shell", "shell_guard", "defense_up"]);
const WEAKNESS_SHIFT_NAMES = new Set(["weakness_shift", "weakness_transfer", "shift_weakness"]);
const SEAL_NAMES = new Set([
  "seal_special_random",
  "seal_special",
  "seal_special_3",
  "seal",
  "freeze_special_random",
  "freeze_special_3",
]);
const ON_HIT_NAMES = new Set([
  "mutate_special_on_hit",
  "poison_special_on_hit",
  "poison_player_system_on_hit",
  "lock_player_skills_on_hit",
]);
const FREEZE_NAMES = new Set(["freeze_random", "freeze_random_3", "freeze_random_5"]);
const CONVERT_BLOCKER_NAMES = new Set([
  "convert_random_blocker_3_4",
  "convert_random_breakable_blocker",
  "convert_random_to_breakable_blocker",
  "spawn_breakable_blocker_random",
]);
const CORRODE_NAMES = new Set(["corrode_random", "corrode", "corrupt_to_mask", "corrode_random_mask"]);
const LAND_NAMES = new Set(["land_convert", "land_apply_larvae"]);
const ROLLING_NAMES = new Set(["rolling_impact", "roll_impact", "clear_special_shuffle"]);

function eff(skill: BossSkill): string {
  return (skill.effectType || skill.skillId).toLowerCase();
}

export class BossRuntime {
  readonly config: BossConfig;
  readonly enabled: boolean;
  private adapter: BossBoardAdapter;
  private prng: Prng;

  maxHp = 100;
  currentHp = 100;
  lastDamagedMove = -1;
  lastProcessedMove = 0;
  rebirthProgress = 0;

  private phases: BossRebirthPhase[] = [];
  private damageByTileType = new Map<number, number>();
  private excludeUltimate = new Set<number>();
  private damageBySignalTag = new Map<string, number>();

  private hardShell = false;
  private hardShellPct = 50;
  private hardShellProtectMove = -1;

  private timedSkillId: string | null = null;
  private timedTriggerAt = 0;

  constructor(config: BossConfig, adapter: BossBoardAdapter, seed: number) {
    this.config = config;
    this.adapter = adapter;
    this.prng = new Prng(seed ^ 0x9e3779b9);
    this.enabled = config.bEnabled;
    this.reset();
  }

  reset(): void {
    this.maxHp = Math.max(1, this.config.maxHp > 0 ? this.config.maxHp : 100);
    this.currentHp = this.config.initialHp > 0 ? clamp(this.config.initialHp, 0, this.maxHp) : this.maxHp;
    this.lastDamagedMove = -1;
    this.lastProcessedMove = 0;
    this.rebirthProgress = 0;
    this.phases = this.config.rebirthPhases;
    this.hardShell = false;
    this.hardShellPct = 50;
    for (const s of this.config.skills) {
      if (HARD_SHELL_NAMES.has(eff(s))) {
        this.hardShell = true;
        this.hardShellPct = s.paramA > 0 ? clamp(s.paramA, 1, 100) : 50;
      }
    }
    this.fillWeaknessMaps(this.config.weaknesses, this.config.blockerWeaknessTriggers);
  }

  private fillWeaknessMaps(
    weaknesses: BossConfig["weaknesses"],
    triggers: BossConfig["blockerWeaknessTriggers"]
  ): void {
    this.damageByTileType.clear();
    this.excludeUltimate.clear();
    this.damageBySignalTag.clear();
    for (const w of weaknesses) {
      if (w.tileType > 0 && w.damagePerClear !== 0) {
        this.damageByTileType.set(w.tileType, (this.damageByTileType.get(w.tileType) ?? 0) + w.damagePerClear);
        if (w.bExcludeUltimateClears) this.excludeUltimate.add(w.tileType);
      }
    }
    for (const t of triggers) {
      if (t.signalTag && t.damagePerTrigger > 0) {
        this.damageBySignalTag.set(t.signalTag, (this.damageBySignalTag.get(t.signalTag) ?? 0) + t.damagePerTrigger);
      }
    }
  }

  getCurrentPhase(): number {
    return Math.max(1, this.rebirthProgress + 1);
  }

  isSkillActiveForPhase(skill: BossSkill): boolean {
    const phase = this.getCurrentPhase();
    const min = Math.max(1, skill.minActivePhase);
    if (phase < min) return false;
    if (skill.maxActivePhase > 0 && phase > skill.maxActivePhase) return false;
    return true;
  }

  getSealRatio(): number {
    return this.adapter.adapterFrozenUsableRatio();
  }

  /** Positive-damage weakness tile types (for HUD icons). */
  weaknessTileTypes(): Array<{ tileType: number; damage: number }> {
    const out: Array<{ tileType: number; damage: number }> = [];
    for (const [t, d] of this.damageByTileType) if (t > 0 && d > 0) out.push({ tileType: t, damage: d });
    return out;
  }

  signalTags(): string[] {
    return [...this.damageBySignalTag.keys()];
  }

  // ───────────────────────────── damage ─────────────────────────────

  applyDamageFromClears(tileTypes: number[], isUltimate: boolean, events: BoardEvent[]): void {
    if (!this.enabled || this.currentHp <= 0 || tileTypes.length === 0) return;

    const noWeaknessTables = this.damageByTileType.size === 0 && this.damageBySignalTag.size === 0;
    if (noWeaknessTables && this.adapter.adapterHasBoardDrivenWeakness()) return;

    let damage = 0;
    if (this.damageByTileType.size === 0) {
      for (const t of tileTypes) if (t > 0) damage += 1;
    } else {
      for (const t of tileTypes) {
        if (isUltimate && this.excludeUltimate.has(t)) continue;
        damage += this.damageByTileType.get(t) ?? 0;
      }
    }
    if (damage === 0) return;

    if (damage < 0) {
      const prev = this.currentHp;
      this.currentHp = Math.min(this.maxHp, this.currentHp + -damage);
      if (this.currentHp !== prev) events.push({ type: "bossHp", current: this.currentHp, max: this.maxHp, delta: this.currentHp - prev });
      return;
    }
    this.applyDirectDamage(damage, events);
  }

  applySignalDamage(signalTag: string, events: BoardEvent[]): void {
    if (!this.enabled || this.currentHp <= 0 || !signalTag) return;
    const damage = this.damageBySignalTag.get(signalTag) ?? 0;
    if (damage <= 0) return;
    this.applyDirectDamage(damage, events);
  }

  applyDirectDamage(damage: number, events: BoardEvent[]): void {
    if (!this.enabled || this.currentHp <= 0 || damage <= 0) return;
    let effective = damage;

    if (this.hardShell && this.hardShellProtectMove !== -1 && this.lastProcessedMove === this.hardShellProtectMove) {
      effective = Math.max(1, Math.round((effective * clamp(100 - this.hardShellPct, 0, 100)) / 100));
    }
    if (this.hardShell) this.hardShellProtectMove = this.lastProcessedMove + 1;

    const previous = this.currentHp;
    this.currentHp = Math.max(0, this.currentHp - effective);
    this.lastDamagedMove = this.lastProcessedMove;
    events.push({ type: "bossHp", current: this.currentHp, max: this.maxHp, delta: this.currentHp - previous });

    if (this.currentHp <= 0) this.tryRebirth(events);
  }

  private tryRebirth(events: BoardEvent[]): boolean {
    if (!this.enabled || this.currentHp > 0) return false;
    if (this.rebirthProgress < 0 || this.rebirthProgress >= this.phases.length) return false;
    const phase = this.phases[this.rebirthProgress];
    if (phase.spawnBlockerType <= 0 || phase.spawnCount <= 0) return false;

    const candidates = this.adapter
      .adapterAllIndices()
      .filter((i) => {
        const c = this.adapter.adapterCell(i);
        return c.bUsable && c.BlockerType === 0 && c.TileType > 0 && c.SpecialType === SpecialType.None;
      });
    const allowWithoutSpawn = this.phases.length > 1;
    if (candidates.length === 0 && !allowWithoutSpawn) return false;
    this.adapter.shuffleArray(candidates);
    const applyCount = Math.min(phase.spawnCount, candidates.length);
    const chosen = candidates.slice(0, applyCount);

    const def = this.adapter.adapterBlockerDefs().find((d) => d.TypeId === phase.spawnBlockerType);
    const hp = def?.bDestructible
      ? phase.spawnBlockerHP > 0
        ? Math.max(1, phase.spawnBlockerHP)
        : Math.max(1, def?.DefaultHP ?? 1)
      : 0;
    this.adapter.adapterConvertToBlocker(chosen, phase.spawnBlockerType, hp);

    this.rebirthProgress++;
    this.maxHp = Math.max(1, phase.maxHp > 0 ? phase.maxHp : this.config.maxHp);
    this.currentHp = phase.initialHp > 0 ? clamp(phase.initialHp, 0, this.maxHp) : this.maxHp;

    const useW = phase.weaknesses.length > 0 ? phase.weaknesses : this.config.weaknesses;
    const useS = phase.blockerWeaknessTriggers.length > 0 ? phase.blockerWeaknessTriggers : this.config.blockerWeaknessTriggers;
    this.fillWeaknessMaps(useW, useS);

    if (this.phases.length <= 1) {
      for (const s of this.config.skills) s.bEnabled = false;
    }

    events.push({ type: "bossPhase", phase: this.getCurrentPhase(), maxHp: this.maxHp, currentHp: this.currentHp });
    events.push({ type: "bossHp", current: this.currentHp, max: this.maxHp, delta: this.currentHp });
    if (chosen.length > 0) events.push({ type: "bossConvert", skillId: "rebirth_spawn", indices: chosen });
    return true;
  }

  // ───────────────────────────── turn ─────────────────────────────

  processTurn(moveIndex: number, events: BoardEvent[]): void {
    if (!this.enabled) return;
    let guard = 0;
    while (this.lastProcessedMove < moveIndex && guard++ < 500) {
      this.lastProcessedMove++;
      this.adapter.adapterTickFrozen();
      this.processPassives(this.lastProcessedMove, events);
      this.triggerSkillByMove(this.lastProcessedMove, events);
    }
  }

  private processPassives(moveIndex: number, events: BoardEvent[]): void {
    if (moveIndex <= 0) return;
    for (const skill of this.config.skills) {
      if (!skill.bEnabled || skill.intervalMoves <= 0 || !skill.skillId) continue;
      if (this.isTimed(skill) || !this.isSkillActiveForPhase(skill)) continue;
      if (!WEAKNESS_SHIFT_NAMES.has(eff(skill))) continue;
      if (moveIndex % skill.intervalMoves !== 0) continue;
      if (this.applyWeaknessShift()) events.push({ type: "bossSkill", skillId: skill.skillId });
    }
  }

  private triggerSkillByMove(moveIndex: number, events: BoardEvent[]): boolean {
    if (!this.enabled || this.currentHp <= 0) return false;
    let selected: BossSkill | null = null;
    for (const skill of this.config.skills) {
      if (!skill.bEnabled || skill.intervalMoves <= 0 || !skill.skillId) continue;
      if (this.isTimed(skill)) continue;
      if (!this.isSkillActiveForPhase(skill)) continue;
      if (this.isPassive(skill) || this.isSeal(skill) || this.isOnHit(skill)) continue;
      if (moveIndex % skill.intervalMoves !== 0) continue;
      if (LAND_NAMES.has(eff(skill)) && this.lastDamagedMove === moveIndex) continue;
      if (!selected || skill.priority > selected.priority) selected = skill;
    }
    return selected ? this.executeSkill(selected, events) : false;
  }

  isTimed(skill: BossSkill): boolean {
    return skill.intervalSecondsMin > 0 || skill.intervalSecondsMax > 0;
  }
  private isPassive(skill: BossSkill): boolean {
    const e = eff(skill);
    return HARD_SHELL_NAMES.has(e) || WEAKNESS_SHIFT_NAMES.has(e);
  }
  private isSeal(skill: BossSkill): boolean {
    return SEAL_NAMES.has(eff(skill));
  }
  private isOnHit(skill: BossSkill): boolean {
    return ON_HIT_NAMES.has(eff(skill));
  }

  // ───────────────────────────── timed ─────────────────────────────

  hasTimedSkills(): boolean {
    return this.config.skills.some(
      (s) => s.bEnabled && s.skillId && this.isTimed(s) && this.isSkillActiveForPhase(s) && !this.isPassive(s) && !this.isSeal(s) && !this.isOnHit(s)
    );
  }

  scheduleNextTimed(now: number): void {
    this.timedSkillId = null;
    this.timedTriggerAt = 0;
    if (!this.enabled) return;
    let bestDelay = -1;
    let bestId: string | null = null;
    for (const skill of this.config.skills) {
      if (!skill.bEnabled || !skill.skillId || !this.isTimed(skill)) continue;
      if (!this.isSkillActiveForPhase(skill) || this.isPassive(skill) || this.isSeal(skill) || this.isOnHit(skill)) continue;
      const minDelay = Math.max(0.1, Math.min(skill.intervalSecondsMin, skill.intervalSecondsMax));
      const maxDelay = Math.max(skill.intervalSecondsMin, skill.intervalSecondsMax);
      const delay = maxDelay > minDelay ? this.prng.floatRange(minDelay, maxDelay) : minDelay;
      if (bestDelay < 0 || delay < bestDelay) {
        bestDelay = delay;
        bestId = skill.skillId;
      }
    }
    if (bestId) {
      this.timedSkillId = bestId;
      this.timedTriggerAt = now + bestDelay;
    }
  }

  updateTimed(now: number, events: BoardEvent[]): void {
    if (!this.enabled || !this.timedSkillId) return;
    if (now < this.timedTriggerAt) return;
    const id = this.timedSkillId;
    this.timedSkillId = null;
    let selected: BossSkill | null = null;
    for (const skill of this.config.skills) {
      if (!skill.bEnabled || !skill.skillId || !this.isTimed(skill) || !this.isSkillActiveForPhase(skill)) continue;
      if (skill.skillId === id) {
        selected = skill;
        break;
      }
      if (!selected || skill.priority > selected.priority) selected = skill;
    }
    if (selected) this.executeSkill(selected, events);
    this.scheduleNextTimed(now);
  }

  // ───────────────────────────── effects ─────────────────────────────

  private executeSkill(skill: BossSkill, events: BoardEvent[]): boolean {
    const e = eff(skill);
    if (this.isOnHit(skill)) return false;
    events.push({ type: "bossSkill", skillId: skill.skillId });

    if (FREEZE_NAMES.has(e) || this.isSeal(skill)) {
      const count = skill.paramA > 0 ? skill.paramA : e.includes("random_5") ? 5 : 3;
      const turns = skill.paramB > 0 ? skill.paramB : this.isSeal(skill) ? 3 : 2;
      const idxs = this.adapter.adapterFreezeRandom(count, turns, this.isSeal(skill));
      if (idxs.length) events.push({ type: "bossTargets", skillId: skill.skillId, indices: idxs, color: 0x7fe3ff });
      return true;
    }
    if (CONVERT_BLOCKER_NAMES.has(e)) {
      this.convertRandomTilesToBlocker(skill, events);
      return true;
    }
    if (CORRODE_NAMES.has(e)) {
      this.corrodeRandom(skill, events);
      return true;
    }
    if (LAND_NAMES.has(e)) {
      if (skill.bApplyLarvaeOnLand) this.addRandomLarvae(skill, events);
      else this.landConvert(skill, events);
      return true;
    }
    if (ROLLING_NAMES.has(e)) {
      this.adapter.adapterClearAllSpecials();
      this.adapter.adapterShuffleTiles();
      if (!this.adapterHasPlayable()) {
        // leave to board failure evaluation
      } else if (this.adapter.adapterHasImmediateMatch()) {
        this.adapter.adapterResolveFromShuffle(events);
      }
      return true;
    }
    // Unknown effects are consumed (return true) per spec §4.6.2.
    return true;
  }

  private adapterHasPlayable(): boolean {
    return true;
  }

  private normalTileCandidates(): number[] {
    return this.adapter.adapterAllIndices().filter((i) => {
      const c = this.adapter.adapterCell(i);
      return c.bUsable && c.BlockerType === 0 && c.TileType > 0 && c.SpecialType === SpecialType.None;
    });
  }

  private convertRandomTilesToBlocker(skill: BossSkill, events: BoardEvent[]): void {
    let min = skill.paramA > 0 ? skill.paramA : 1;
    let max = skill.paramB > 0 ? skill.paramB : 5;
    if (max < min) [min, max] = [max, min];
    const defs = this.adapter.adapterBlockerDefs();
    let types = defs.filter((d) => (d.TypeId === 3 || d.TypeId === 4) && d.bDestructible).map((d) => d.TypeId);
    if (types.length === 0) types = defs.filter((d) => d.bDestructible).map((d) => d.TypeId);
    if (types.length === 0) return;

    const candidates = this.normalTileCandidates();
    if (candidates.length === 0) return;
    this.adapter.shuffleArray(candidates);
    const applyCount = Math.min(this.prng.intRange(min, max), candidates.length);
    const chosen = candidates.slice(0, applyCount);
    for (const idx of chosen) {
      const type = types[this.prng.intRange(0, types.length - 1)];
      const def = defs.find((d) => d.TypeId === type);
      this.adapter.adapterConvertToBlocker([idx], type, Math.max(1, def?.DefaultHP ?? 1));
    }
    if (chosen.length) {
      events.push({ type: "bossConvert", skillId: skill.skillId, indices: chosen });
      events.push({ type: "bossTargets", skillId: skill.skillId, indices: chosen, color: 0xff8c42 });
    }
  }

  private corrodeRandom(skill: BossSkill, events: BoardEvent[]): void {
    const count = skill.paramA > 0 ? skill.paramA : 1;
    const types = this.adapter.adapterBlockerDefs().filter((d) => d.bCorrodeToMaskOnTimeout).map((d) => d.TypeId);
    if (types.length === 0) return;
    const candidates = this.normalTileCandidates();
    if (candidates.length === 0) return;
    this.adapter.shuffleArray(candidates);
    const applyCount = Math.min(count, candidates.length);
    const chosen = candidates.slice(0, applyCount);
    for (const idx of chosen) {
      const type = types[this.prng.intRange(0, types.length - 1)];
      const def = this.adapter.adapterBlockerDefs().find((d) => d.TypeId === type);
      this.adapter.adapterConvertToBlocker([idx], type, Math.max(1, def?.DefaultHP ?? 1));
    }
    if (chosen.length) {
      events.push({ type: "bossConvert", skillId: skill.skillId, indices: chosen });
      events.push({ type: "bossTargets", skillId: skill.skillId, indices: chosen, color: 0x6fa84a });
    }
  }

  private landConvert(skill: BossSkill, events: BoardEvent[]): void {
    const type = skill.paramA > 0 ? skill.paramA : 15;
    const defs = this.adapter.adapterBlockerDefs();
    const def = defs.find((d) => d.TypeId === type);
    if (!def) return;
    const candidates = this.normalTileCandidates();
    if (candidates.length === 0) return;
    this.adapter.shuffleArray(candidates);
    const count = Math.min(skill.paramB > 0 ? skill.paramB : 1, candidates.length);
    const chosen = candidates.slice(0, count);
    this.adapter.adapterConvertToBlocker(chosen, type, Math.max(1, def.DefaultHP));
    if (chosen.length) {
      events.push({ type: "bossConvert", skillId: skill.skillId, indices: chosen });
      events.push({ type: "bossTargets", skillId: skill.skillId, indices: chosen, color: 0x9a7b4f });
    }
  }

  private addRandomLarvae(skill: BossSkill, events: BoardEvent[]): void {
    const candidates = this.normalTileCandidates();
    if (candidates.length === 0) return;
    this.adapter.shuffleArray(candidates);
    const count = Math.min(skill.paramB > 0 ? skill.paramB : 1, candidates.length);
    const chosen = candidates.slice(0, count);
    this.adapter.adapterAddLarvae(chosen);
    if (chosen.length) events.push({ type: "bossTargets", skillId: skill.skillId, indices: chosen, color: 0xd4c24a });
  }

  private applyWeaknessShift(): boolean {
    let damagePerClear = 1;
    let previous = 0;
    for (const [k, v] of this.damageByTileType) {
      if (k > 0 && v > 0) {
        previous = k;
        damagePerClear = v;
        break;
      }
    }
    if (previous === 0) {
      const w = this.config.weaknesses.find((x) => x.damagePerClear > 0);
      if (w) {
        previous = w.tileType;
        damagePerClear = w.damagePerClear;
      }
    }
    const candidates: number[] = [];
    const addUnique = (t: number) => {
      if (t > 0 && !candidates.includes(t)) candidates.push(t);
    };
    for (const t of this.adapter.adapterTileTypes()) addUnique(t);
    for (const i of this.adapter.adapterAllIndices()) {
      const c = this.adapter.adapterCell(i);
      if (c.bUsable && c.BlockerType === 0 && c.TileType > 0) addUnique(c.TileType);
    }
    if (candidates.length === 0) for (const w of this.config.weaknesses) addUnique(w.tileType);
    if (candidates.length === 0) return false;

    let idx = this.prng.intRange(0, candidates.length - 1);
    if (candidates.length > 1 && candidates[idx] === previous) idx = (idx + 1) % candidates.length;

    this.damageByTileType.clear();
    this.damageByTileType.set(candidates[idx], Math.max(1, damagePerClear));
    return true;
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
