/**
 * Input bridge: screen -> board coords. Supports both:
 *  - drag/swipe: press a tile and drag toward a neighbour to swap
 *  - tap/tap: select a tile, then tap an adjacent tile to swap
 * Works with mouse and touch (Pointer Events).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.10, §3.3.
 */
import type { SceneRoot } from "../view/SceneRoot.js";
import type { BoardView } from "../view/BoardView.js";
import type { BoardLogic } from "../logic/BoardLogic.js";
import { SpecialType, type Coord } from "../logic/Match3Types.js";

export interface ControllerCallbacks {
  isBusy: () => boolean;
  onSwap: (a: Coord, b: Coord) => void;
  onActivate: (c: Coord) => void;
  onSelect?: (c: Coord) => void;
  /** Swap toward an immovable target: play a half-swap bounce (no move consumed). */
  onBlockedSwap?: (a: Coord, b: Coord) => void;
}

export class BoardController {
  private scene: SceneRoot;
  private view: BoardView;
  private board: BoardLogic;
  private cb: ControllerCallbacks;
  private selected: Coord | null = null;

  private activeId: number | null = null;
  private downCell: Coord | null = null;
  private downX = 0;
  private downY = 0;
  private movedFar = false;
  private dragTriggered = false;

  private onDown: (e: PointerEvent) => void;
  private onMove: (e: PointerEvent) => void;
  private onUp: (e: PointerEvent) => void;
  private onContext: (e: Event) => void;

  constructor(scene: SceneRoot, view: BoardView, board: BoardLogic, cb: ControllerCallbacks) {
    this.scene = scene;
    this.view = view;
    this.board = board;
    this.cb = cb;

    const el = scene.renderer.domElement;
    this.onDown = (e: PointerEvent) => this.pointerDown(e);
    this.onMove = (e: PointerEvent) => this.pointerMove(e);
    this.onUp = (e: PointerEvent) => this.pointerUp(e);
    this.onContext = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);
    el.addEventListener("contextmenu", this.onContext);
  }

  dispose(): void {
    const el = this.scene.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    el.removeEventListener("contextmenu", this.onContext);
  }

  // ───────────────────────────── pointer ─────────────────────────────

  private pointerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    this.resetGesture();
    if (this.cb.isBusy()) return;

    const cell = this.view.cellFromScreen(e.clientX, e.clientY);
    if (!cell) return;
    const idx = this.board.index(cell.row, cell.col);
    if (!this.board.cells[idx].bUsable) return;

    this.activeId = e.pointerId;
    this.downCell = cell;
    this.downX = e.clientX;
    this.downY = e.clientY;
    try {
      this.scene.renderer.domElement.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (this.activeId !== e.pointerId || !this.downCell || this.dragTriggered) return;
    const dx = e.clientX - this.downX;
    const dy = e.clientY - this.downY;
    const size = this.view.cellPixelSize();
    const threshold = Math.max(10, Math.min(size.x, size.y) * 0.32);
    if (Math.hypot(dx, dy) < threshold) return;
    this.movedFar = true;

    let dr = 0;
    let dc = 0;
    if (Math.abs(dx) >= Math.abs(dy)) dc = dx > 0 ? 1 : -1;
    else dr = dy > 0 ? 1 : -1;

    const a = this.downCell;
    const target: Coord = { row: a.row + dr, col: a.col + dc };
    if (target.row < 0 || target.row >= this.board.rows || target.col < 0 || target.col >= this.board.cols) return;

    this.dragTriggered = true;
    this.clearSelection();
    if (this.canSwap(a, target)) this.cb.onSwap(a, target);
    else this.cb.onBlockedSwap?.(a, target);
  }

  private pointerUp(e: PointerEvent): void {
    if (this.activeId !== e.pointerId) return;
    try {
      this.scene.renderer.domElement.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const cell = this.downCell;
    const wasDrag = this.movedFar || this.dragTriggered;
    this.resetGesture();
    if (wasDrag || !cell || this.cb.isBusy()) return;
    this.handleTap(cell);
  }

  private resetGesture(): void {
    this.activeId = null;
    this.downCell = null;
    this.movedFar = false;
    this.dragTriggered = false;
  }

  // ───────────────────────────── tap fallback ─────────────────────────────

  private handleTap(cell: Coord): void {
    const idx = this.board.index(cell.row, cell.col);
    const c = this.board.cells[idx];
    if (!c.bUsable) return;

    const clickable =
      c.SpecialType === SpecialType.Bomb3x3 ||
      c.SpecialType === SpecialType.LineHorizontal ||
      c.SpecialType === SpecialType.LineVertical;

    if (!this.selected) {
      if (clickable && this.board.isSwappable(idx)) {
        this.cb.onActivate(cell);
        return;
      }
      if (this.board.isSwappable(idx) && (c.TileType > 0 || c.SpecialType !== SpecialType.None)) {
        this.selected = cell;
        this.view.setSelected(idx);
        this.cb.onSelect?.(cell);
      }
      return;
    }

    const a = this.selected;
    if (a.row === cell.row && a.col === cell.col) {
      this.clearSelection();
      return;
    }
    const adjacent = Math.abs(a.row - cell.row) + Math.abs(a.col - cell.col) === 1;
    if (adjacent) {
      this.clearSelection();
      if (this.canSwap(a, cell)) this.cb.onSwap(a, cell);
      else this.cb.onBlockedSwap?.(a, cell);
      return;
    }
    if (this.board.isSwappable(idx) && (c.TileType > 0 || c.SpecialType !== SpecialType.None)) {
      this.selected = cell;
      this.view.setSelected(idx);
      this.cb.onSelect?.(cell);
    } else {
      this.clearSelection();
    }
  }

  // ───────────────────────────── helpers ─────────────────────────────

  private canSwap(a: Coord, b: Coord): boolean {
    if (a.row === b.row && a.col === b.col) return false;
    const adjacent = Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
    if (!adjacent) return false;
    const ia = this.board.index(a.row, a.col);
    const ib = this.board.index(b.row, b.col);
    if (!this.board.isSwappable(ia) || !this.board.isSwappable(ib)) return false;
    const ca = this.board.cells[ia];
    const cb = this.board.cells[ib];
    const hasA = ca.TileType > 0 || ca.SpecialType !== SpecialType.None;
    const hasB = cb.TileType > 0 || cb.SpecialType !== SpecialType.None;
    return hasA || hasB;
  }

  private clearSelection(): void {
    this.selected = null;
    this.view.setSelected(null);
  }
}
