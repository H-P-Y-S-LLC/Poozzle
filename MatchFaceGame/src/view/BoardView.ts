/**
 * Board view: builds procedural tile/blocker meshes and replays logic events.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.4, §5.4.7.
 */
import * as THREE from "three";
import type { SceneRoot } from "./SceneRoot.js";
import type { BoardLogic, BoardEvent, ClearBatchEvent, FallEvent, SpawnEvent } from "../logic/BoardLogic.js";
import { SpecialType } from "../logic/Match3Types.js";
import { makeFaceObject } from "../proc/TileFaceFactory.js";
import { makeSpecialObject } from "../proc/SpecialFactory.js";
import { makeBlockerObject } from "../proc/BlockerFactory.js";
import { fitObject } from "../proc/fit.js";
import { VfxPlayer } from "../proc/VfxPlayer.js";
import { stateMaterial } from "../proc/MaterialFactory.js";
import { SPECIAL_COLORS, tileColor } from "../proc/Palette.js";
import { Easing } from "../core/Tween.js";

const CELL = 1;

export class BoardView {
  private scene: SceneRoot;
  private board: BoardLogic;
  private root = new THREE.Group();
  private tiles: Array<THREE.Object3D | null> = [];
  private blockers = new Map<number, THREE.Object3D>();
  private overlays = new Map<number, THREE.Mesh>();
  private selected: number | null = null;
  private wiggleT = 0;
  private vfx: VfxPlayer;

  constructor(scene: SceneRoot, board: BoardLogic) {
    this.scene = scene;
    this.board = board;
    scene.boardRoot.add(this.root);
    this.vfx = new VfxPlayer(scene.boardRoot, scene.camera);
    this.syncFromBoard();
  }

  /** Per-frame idle/selection animation. */
  update(dt: number): void {
    for (const obj of this.tiles) {
      if (obj && obj.userData.spin) obj.rotation.y += dt * 0.8;
    }
    this.vfx.update(dt);
    if (this.selected === null) return;
    const mesh = this.tiles[this.selected];
    if (!mesh) return;
    this.wiggleT += dt;
    const { row, col } = this.board.coord(this.selected);
    const base = this.cellWorld(row, col);
    // horizontal (screen left/right = world X) sway only; no vertical motion
    mesh.position.x = base.x + Math.sin(this.wiggleT * 20) * 0.09;
    mesh.position.y = base.y;
    mesh.position.z = base.z;
  }

  /** Animate a swap between two cells. Invalid swaps bounce back. */
  animateSwap(a: { row: number; col: number }, b: { row: number; col: number }, accepted: boolean): Promise<void> {
    const ia = this.board.index(a.row, a.col);
    const ib = this.board.index(b.row, b.col);
    const ma = this.tiles[ia];
    const mb = this.tiles[ib];
    if (!ma || !mb) return Promise.resolve();
    const pa = ma.position.clone();
    const pb = mb.position.clone();
    if (accepted) {
      // keep index -> mesh mapping consistent with the logic state
      this.tiles[ia] = mb;
      this.tiles[ib] = ma;
    }
    return this.animate(0.16, (k) => {
      const ease = Easing.easeInOutQuad(k);
      ma.position.lerpVectors(pa, pb, ease);
      mb.position.lerpVectors(pb, pa, ease);
    }).then(() => {
      if (accepted) {
        ma.position.copy(pb);
        mb.position.copy(pa);
        return Promise.resolve();
      }
      // bounce back
      return this.animate(0.16, (k) => {
        const ease = Easing.easeInOutQuad(k);
        ma.position.lerpVectors(pb, pa, ease);
        mb.position.lerpVectors(pa, pb, ease);
      }).then(() => {
        ma.position.copy(pa);
        mb.position.copy(pb);
      });
    });
  }

  cellWorld(row: number, col: number): THREE.Vector3 {
    const { rows, cols } = this.board;
    return new THREE.Vector3((col - (cols - 1) / 2) * CELL, 0, (row - (rows - 1) / 2) * CELL);
  }

  cellFromScreen(clientX: number, clientY: number): { row: number; col: number } | null {
    const p = this.scene.screenToBoard(clientX, clientY);
    if (!p) return null;
    const { rows, cols } = this.board;
    const col = Math.round(p.x / CELL + (cols - 1) / 2);
    const row = Math.round(p.z / CELL + (rows - 1) / 2);
    if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
    return { row, col };
  }

  /** Rebuild all meshes from the current logic state. */
  syncFromBoard(): void {
    for (const m of this.tiles) if (m) this.root.remove(m);
    this.tiles = new Array(this.board.rows * this.board.cols).fill(null);
    for (const m of this.blockers.values()) this.root.remove(m);
    this.blockers.clear();
    for (const m of this.overlays.values()) this.root.remove(m);
    this.overlays.clear();

    for (let i = 0; i < this.board.cells.length; i++) {
      const c = this.board.cells[i];
      if (!c.bUsable) continue;
      const { row, col } = this.board.coord(i);
      if (c.BlockerType > 0) this.spawnBlockerMesh(i, row, col, c.BlockerType);
      const showTile = c.BlockerType === 0 || this.board.isSwapOnMatchOnly(c.BlockerType);
      if (showTile && (c.TileType > 0 || c.SpecialType !== SpecialType.None)) {
        this.setTileMesh(i, c.TileType, c.SpecialType, true);
      }
      this.refreshOverlay(i);
    }
    // re-apply selection wiggle to the (possibly rebuilt) selected mesh
    if (this.selected !== null) this.wiggleT = 0;
  }

  private makeTileMesh(tileType: number, special: SpecialType): THREE.Object3D {
    const inner = special !== SpecialType.None ? makeSpecialObject(special) : makeFaceObject(tileType);
    const outer = new THREE.Group();
    outer.add(inner);
    fitObject(inner, special !== SpecialType.None ? 0.9 : 0.82, false);
    outer.userData.tileType = special !== SpecialType.None ? 0 : tileType;
    outer.userData.special = special;
    outer.userData.spin = inner.userData.spin === true;
    return outer;
  }

  private setTileMesh(index: number, tileType: number, special: SpecialType, instant: boolean): void {
    const { row, col } = this.board.coord(index);
    const pos = this.cellWorld(row, col);
    const mesh = this.makeTileMesh(tileType, special);
    this.root.add(mesh);
    mesh.position.copy(pos);
    mesh.scale.setScalar(instant ? 1 : 0.001);
    this.tiles[index] = mesh;
  }

  private spawnBlockerMesh(index: number, row: number, col: number, typeId: number): void {
    const inner = makeBlockerObject(typeId);
    const obj = new THREE.Group();
    obj.add(inner);
    fitObject(inner, 0.9, true);
    obj.position.copy(this.cellWorld(row, col));
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    this.root.add(obj);
    this.blockers.set(index, obj);
  }

  private refreshOverlay(index: number): void {
    const c = this.board.cells[index];
    const existing = this.overlays.get(index);
    const need =
      c.bSticky ? "sticky" : c.bBubble ? "bubble" : c.bPoisoned ? "poison" : this.board.isFrozen(index) ? "frozen" : null;
    if (!need) {
      if (existing) {
        this.root.remove(existing);
        this.overlays.delete(index);
      }
      return;
    }
    if (existing) return;
    const { row, col } = this.board.coord(index);
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), stateMaterial(need));
    shell.position.copy(this.cellWorld(row, col));
    this.root.add(shell);
    this.overlays.set(index, shell);
  }

  // ───────────────────────────── selection ─────────────────────────────

  setSelected(index: number | null): void {
    if (this.selected !== null && this.selected !== index) {
      const prev = this.tiles[this.selected];
      if (prev) {
        const { row, col } = this.board.coord(this.selected);
        const base = this.cellWorld(row, col);
        prev.position.x = base.x;
        prev.position.y = base.y;
        prev.position.z = base.z;
      }
    }
    this.selected = index;
    this.wiggleT = 0;
  }

  // ───────────────────────────── replay ─────────────────────────────

  get rootGroup(): THREE.Group {
    return this.root;
  }

  dispose(): void {
    this.scene.boardRoot.remove(this.root);
    this.vfx.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry?.dispose?.();
    });
    this.tiles = [];
    this.blockers.clear();
    this.overlays.clear();
  }

  /** Replay an event list as animation. */
  async playEvents(events: BoardEvent[], onEvent?: (e: BoardEvent) => void): Promise<void> {
    for (const ev of events) {
      onEvent?.(ev);
      switch (ev.type) {
        case "clear":
          await this.animClear(ev);
          break;
        case "fall":
          await this.animFall(ev);
          break;
        case "spawn":
          await this.animSpawn(ev);
          break;
        case "shuffle":
          await this.animShuffle();
          break;
        case "refresh":
          this.syncFromBoard();
          break;
        default:
          break;
      }
    }
    this.syncFromBoard();
  }

  private animClear(ev: ClearBatchEvent): Promise<void> {
    const meshes: THREE.Object3D[] = [];
    for (const idx of ev.indices) {
      const m = this.tiles[idx];
      if (m) {
        meshes.push(m);
        this.burstAt(m);
      }
      this.tiles[idx] = null;
    }
    // detonation VFX for any special caught in this clear
    for (const ct of ev.clearedTiles) {
      if (ct.special !== SpecialType.None) this.specialEffect(ct.index, ct.special, ev);
    }
    // specials spawned in this batch: remove the old tile so the special does NOT overlap it
    for (const s of ev.specialsSpawned) {
      const old = this.tiles[s.index];
      if (old) {
        this.root.remove(old);
        this.tiles[s.index] = null;
      }
      const obj = this.makeTileMesh(0, s.special);
      const { row, col } = this.board.coord(s.index);
      obj.position.copy(this.cellWorld(row, col));
      obj.scale.setScalar(0.001);
      this.root.add(obj);
      this.tiles[s.index] = obj;
    }
    return this.animate(0.16, (k) => {
      for (const m of meshes) {
        m.scale.setScalar(Math.max(0.001, 1 - k));
        m.rotation.y = k * Math.PI;
      }
      for (const s of ev.specialsSpawned) {
        const m = this.tiles[s.index];
        if (m) m.scale.setScalar(k);
      }
    }).then(() => {
      for (const m of meshes) this.root.remove(m);
    });
  }

  private animFall(ev: FallEvent): Promise<void> {
    const items = ev.moves
      .map((mv) => {
        const mesh = this.tiles[mv.from];
        if (!mesh) return null;
        this.tiles[mv.from] = null;
        this.tiles[mv.to] = mesh;
        const { row, col } = this.board.coord(mv.to);
        return { mesh, from: mesh.position.clone(), to: this.cellWorld(row, col) };
      })
      .filter(Boolean) as Array<{ mesh: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3 }>;
    if (items.length === 0) return Promise.resolve();
    return this.animate(0.2, (k) => {
      const ease = Easing.easeOutQuad(k);
      for (const it of items) {
        it.mesh.position.lerpVectors(it.from, it.to, ease);
        it.mesh.position.y = Math.sin(ease * Math.PI) * 0.18;
      }
    });
  }

  private animSpawn(ev: SpawnEvent): Promise<void> {
    const meshes: THREE.Object3D[] = [];
    for (const s of ev.spawns) {
      const obj = this.makeTileMesh(s.tileType, SpecialType.None);
      const { row, col } = this.board.coord(s.index);
      const target = this.cellWorld(row, col);
      obj.position.copy(target);
      obj.position.y = 2.5;
      obj.scale.setScalar(0.9);
      this.root.add(obj);
      this.tiles[s.index] = obj;
      meshes.push(obj);
    }
    if (meshes.length === 0) return Promise.resolve();
    return this.animate(0.18, (k) => {
      for (const m of meshes) {
        m.position.y = 2.5 * (1 - k);
        m.scale.setScalar(0.9 + 0.1 * k);
      }
    });
  }

  private animShuffle(): Promise<void> {
    const out = this.tiles.filter(Boolean) as THREE.Object3D[];
    const outFrom = out.map((o) => o.position.clone());
    // 1) all elements fly out (up + spin + shrink)
    return this.animate(0.34, (k) => {
      const e = Easing.easeInCubic(k);
      out.forEach((o, i) => {
        o.position.y = outFrom[i].y + e * 3.2;
        o.rotation.y = e * Math.PI * 2;
        o.scale.setScalar(Math.max(0.001, 1 - e));
      });
    }).then(() => {
      // 2) rearrange, then fly the new arrangement back in
      this.syncFromBoard();
      const incoming = this.tiles.filter(Boolean) as THREE.Object3D[];
      const to = incoming.map((o) => o.position.clone());
      incoming.forEach((o, i) => {
        o.position.y = to[i].y + 3.2;
        o.scale.setScalar(0.001);
      });
      return this.animate(0.34, (k) => {
        const e = Easing.easeOutCubic(k);
        incoming.forEach((o, i) => {
          o.position.y = to[i].y + (1 - e) * 3.2;
          o.scale.setScalar(e);
        });
      });
    });
  }

  /** Project a world position to viewport pixels. */
  worldToScreen(pos: THREE.Vector3): { x: number; y: number } {
    const v = pos.clone().project(this.scene.camera);
    const rect = this.scene.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * rect.width + rect.left, y: (-v.y * 0.5 + 0.5) * rect.height + rect.top };
  }

  /** Approximate on-screen size of one cell, in pixels. */
  cellPixelSize(): { x: number; y: number } {
    const a = this.worldToScreen(this.cellWorld(0, 0));
    const bx = this.worldToScreen(this.cellWorld(0, this.board.cols > 1 ? 1 : 0));
    const by = this.worldToScreen(this.cellWorld(this.board.rows > 1 ? 1 : 0, 0));
    return { x: Math.abs(bx.x - a.x) || 40, y: Math.abs(by.y - a.y) || 40 };
  }

  private specialEffect(index: number, special: SpecialType, ev: ClearBatchEvent): void {
    const { row, col } = this.board.coord(index);
    const pos = this.cellWorld(row, col);
    const hexToColor = (h: string): THREE.Color => new THREE.Color(parseInt(h.slice(1), 16));
    if (special === SpecialType.LineHorizontal) {
      this.vfx.beam(pos, true, this.board.cols * CELL, hexToColor(SPECIAL_COLORS.lineHorizontal));
    } else if (special === SpecialType.LineVertical) {
      this.vfx.beam(pos, false, this.board.rows * CELL, hexToColor(SPECIAL_COLORS.lineVertical));
    } else if (special === SpecialType.Bomb3x3) {
      const c = hexToColor(SPECIAL_COLORS.bomb);
      this.vfx.shockwave(pos, c, 2.2);
      this.vfx.burst(pos, c, 24, 5);
    } else if (special === SpecialType.ColorBomb) {
      const c = hexToColor(SPECIAL_COLORS.colorBomb);
      this.vfx.shockwave(pos, c, 3);
      this.vfx.burst(pos, c, 30, 6);
      // rainbow chain across every other cleared cell
      let delay = 0;
      for (const ct of ev.clearedTiles) {
        if (ct.index === index) continue;
        const { row: r2, col: c2 } = this.board.coord(ct.index);
        const p2 = this.cellWorld(r2, c2);
        const cc =
          ct.special !== SpecialType.None
            ? c
            : hexToColor(tileColor(ct.tileType || 1).main);
        window.setTimeout(() => this.vfx.burst(p2, cc, 6, 3), delay);
        delay += 22;
        if (delay > 520) break;
      }
    }
  }

  private burstAt(obj: THREE.Object3D): void {
    const sp = (obj.userData.special as SpecialType | undefined) ?? SpecialType.None;
    const tileType = (obj.userData.tileType as number) || 1;
    let count = 11;
    let speed = 2.8;
    let colorHex: string;
    if (sp !== SpecialType.None) {
      colorHex =
        sp === SpecialType.ColorBomb
          ? SPECIAL_COLORS.colorBomb
          : sp === SpecialType.Bomb3x3
            ? SPECIAL_COLORS.bomb
            : SPECIAL_COLORS.lineHorizontal;
      count = 20;
      speed = 4.2;
    } else {
      colorHex = tileColor(tileType).main;
    }
    this.vfx.burst(obj.position, new THREE.Color(parseInt(colorHex.slice(1), 16)), count, speed);
  }

  private animate(duration: number, apply: (k: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const state = { t: 0 };
      this.scene.tweens.to(state, { t: 1 }, { duration, ease: Easing.easeOutCubic, onUpdate: () => apply(state.t), onComplete: resolve });
    });
  }
}
