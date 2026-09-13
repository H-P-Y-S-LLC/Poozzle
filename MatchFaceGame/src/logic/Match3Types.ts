/**
 * Core Match3 data structures, enums and defaults.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §3.1, Appendix A.
 *
 * Pure data — MUST NOT import three/DOM.
 */

export interface Coord {
  row: number;
  col: number;
}

export enum SpecialType {
  None = 0,
  LineHorizontal = 1,
  LineVertical = 2,
  Bomb3x3 = 3,
  ColorBomb = 4,
  /** Guide filter only, never stored on a cell. */
  LineAny = 5,
}

export enum BoardState {
  Idle = 0,
  Swapping = 1,
  Resolving = 2,
  Falling = 3,
  Refilling = 4,
}

export enum ClearTriggerType {
  NormalMatch = 0,
  SpecialExplosion = 1,
  HammerTool = 2,
  RocketTool = 3,
  UltimateTool = 4,
  FingerTool = 5,
}

export enum FinishReason {
  None = 0,
  GoalReached = 1,
  BossDefeated = 2,
  MovesExhausted = 3,
  GoalsUnreachable = 4,
  BlockerEscaped = 5,
  BoardFullySealed = 6,
  NoPossibleMove = 7,
  DeathLineCaught = 8,
}

/** Runtime cell (§3.1.2). */
export interface Cell {
  bUsable: boolean;
  BlockerType: number;
  bBlockerDestructible: boolean;
  BlockerHP: number;
  bDrainDisabled: boolean;
  BlockerTransformTarget: number;
  RewardVariantId: string;
  TileType: number;
  SpecialType: SpecialType;
  bSticky: boolean;
  bLarvae: boolean;
  bMovementLocked: boolean;
  bBubble: boolean;
  BubbleEdgeStayTurns: number;
  bPoisoned: boolean;
  PoisonedRemainingTurns: number;
  bSpecialPoisoned: boolean;
  bPipeCell: boolean;
  bPipeBlocked: boolean;
  bPipeHasFlow: boolean;
  PipeOpenMask: number;
  PipeProxyTileType: number;
  PipeHP: number;
}

export function createCell(partial: Partial<Cell> = {}): Cell {
  return {
    bUsable: false,
    BlockerType: 0,
    bBlockerDestructible: true,
    BlockerHP: 0,
    bDrainDisabled: false,
    BlockerTransformTarget: 0,
    RewardVariantId: "None",
    TileType: 0,
    SpecialType: SpecialType.None,
    bSticky: false,
    bLarvae: false,
    bMovementLocked: false,
    bBubble: false,
    BubbleEdgeStayTurns: 0,
    bPoisoned: false,
    PoisonedRemainingTurns: 0,
    bSpecialPoisoned: false,
    bPipeCell: false,
    bPipeBlocked: false,
    bPipeHasFlow: false,
    PipeOpenMask: 0,
    PipeProxyTileType: 0,
    PipeHP: 0,
    ...partial,
  };
}

export function isEmpty(c: Cell): boolean {
  return c.TileType === 0 && c.SpecialType === SpecialType.None && c.BlockerType === 0;
}

export function isBlocked(c: Cell): boolean {
  return c.BlockerType > 0;
}

export function isDestructibleBlocker(c: Cell): boolean {
  return isBlocked(c) && c.bBlockerDestructible;
}

/** char '0'..'9' -> 0..9, 'A'..'Z' -> 10..35, anything else -> 0 (§2.4.2). */
export function charToInt(ch: string): number {
  if (!ch) return 0;
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return c - 48; // 0-9
  if (c >= 65 && c <= 90) return c - 65 + 10; // A-Z
  if (c >= 97 && c <= 122) return c - 97 + 10; // a-z (tolerant)
  return 0;
}

export function indexOf(coord: Coord, cols: number): number {
  return coord.row * cols + coord.col;
}

export function coordOf(index: number, cols: number): Coord {
  return { row: Math.floor(index / cols), col: index % cols };
}

export function inBounds(coord: Coord, rows: number, cols: number): boolean {
  return coord.row >= 0 && coord.row < rows && coord.col >= 0 && coord.col < cols;
}

export function coordEquals(a: Coord, b: Coord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function coordKey(c: Coord): string {
  return `${c.row},${c.col}`;
}

/** Parse SpecialType from JSON string (case-insensitive) or number. */
export function parseSpecialType(value: unknown): SpecialType {
  if (typeof value === "number") return value as SpecialType;
  if (typeof value !== "string") return SpecialType.None;
  switch (value.trim().toLowerCase()) {
    case "linehorizontal":
    case "line_horizontal":
    case "horizontal":
      return SpecialType.LineHorizontal;
    case "linevertical":
    case "line_vertical":
    case "vertical":
      return SpecialType.LineVertical;
    case "bomb3x3":
    case "bomb":
      return SpecialType.Bomb3x3;
    case "colorbomb":
    case "color_bomb":
      return SpecialType.ColorBomb;
    case "lineany":
    case "line_any":
      return SpecialType.LineAny;
    default:
      return SpecialType.None;
  }
}

export function specialTypeName(t: SpecialType): string {
  switch (t) {
    case SpecialType.LineHorizontal:
      return "LineHorizontal";
    case SpecialType.LineVertical:
      return "LineVertical";
    case SpecialType.Bomb3x3:
      return "Bomb3x3";
    case SpecialType.ColorBomb:
      return "ColorBomb";
    case SpecialType.LineAny:
      return "LineAny";
    default:
      return "None";
  }
}

/** Defaults when config omits them (§3.1.4). */
export const DEFAULTS = {
  rules: {
    MinMatchCount: 3,
    bAllowDiagonalSwap: false,
    bInvalidSwapBounceBack: true,
    bEnsureAtLeastOneMove: true,
    bAvoidAutoCascadeAtStart: true,
    bUseTopSpawnAfterInternalSettle: false,
    bEnableSpecialSpecialSwapCombo: false,
    bDrainSuctionCountsForCollectGoal: true,
    bEnableGloveTool: true,
    bGloveAllowNormalTiles: true,
    bGloveAllowSpecialTiles: true,
    bGloveAllowBlockers: true,
    bGloveAllowStickyCell: false,
    bGloveAllowLarvaeCell: false,
    bGloveAllowPipeCell: false,
    bGloveAllowFrozenCell: false,
    bGloveAllowMovementLockedCell: false,
    GloveDisallowTileTypes: [] as number[],
    GloveDisallowBlockerTypeIds: [] as number[],
  },
  score: {
    BaseClearScore: 50,
    ExtraPerMoreThan3: 20,
    SpecialTriggerScore: 120,
    ComboMultiplierStep: 0.4,
    BlockerBreakScore: 80,
  },
  goal: {
    TargetScore: 3000,
    MaxMoves: 30,
  },
} as const;
