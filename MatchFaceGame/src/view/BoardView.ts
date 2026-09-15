/**
 * Board view: builds procedural tile/blocker meshes and replays logic events.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.4, §5.4.7.
 */
import * as THREE from "three";
import type { SceneRoot } from "./SceneRoot.js";
import type { BoardLogic, BoardEvent, ClearBatchEvent, FallEvent, SpawnEvent, BlockerHitEvent } from "../logic/BoardLogic.js";
import { SpecialType } from "../logic/Match3Types.js";
import { makeFaceObject } from "../proc/TileFaceFactory.js";
import { makeSpecialObject } from "../proc/SpecialFactory.js";
import { makeBlockerSprite } from "../proc/BlockerSpriteFactory.js";
import { blockerColor } from "../proc/BlockerFactory.js";
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
  private animT = 0;
  /** Strictly increasing draw order for flat sprites (stable transparent sort). */
  private spriteOrder = 1;
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
    this.animT += dt;
    for (let i = 0; i < this.tiles.length; i++) {
      const obj = this.tiles[i];
      if (!obj) continue;
      if (obj.userData.spin && i !== this.selected) obj.rotation.y += dt * 0.8;
      const ring = obj.userData.pulseRing as THREE.Mesh | undefined;
      if (ring) {
        const k = 0.5 + 0.5 * Math.sin(this.animT * 4);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.4 * k;
        ring.scale.setScalar(0.94 + 0.12 * k);
      }
      const pu = obj.userData.particlesUpdate as ((t: number) => void) | undefined;
      if (pu) pu(this.animT);
      // random blink for element faces
      const blink = obj.userData.blink as
        | { open: THREE.Texture; closed: THREE.Texture; nextAt: number; until: number }
        | undefined;
      if (blink) {
        const mat = obj.userData.blinkMat as THREE.MeshBasicMaterial | undefined;
        if (!mat) continue;
        const now = performance.now();
        if (now >= blink.until && mat.map === blink.closed) mat.map = blink.open;
        if (now >= blink.nextAt && blink.until <= now) {
          mat.map = blink.closed;
          blink.until = now + 130;
          blink.nextAt = now + 1800 + Math.random() * 5200;
        }
      }
    }
    for (const obj of this.blockers.values()) {
      const pu = obj.userData.particlesUpdate as ((t: number) => void) | undefined;
      if (pu) pu(this.animT);
    }
    this.vfx.update(dt);
    if (this.selected === null) return;
    const mesh = this.tiles[this.selected];
    if (!mesh) return;
    this.wiggleT += dt;
    if (mesh.userData.isFlatSprite) {
      // flat sprites: breathing scale (in-plane) reads better than a spin
      mesh.scale.setScalar(1 + Math.sin(this.wiggleT * 8) * 0.07);
    } else {
      // slight twisting rotation (yaw) instead of horizontal sliding
      mesh.rotation.y = Math.sin(this.wiggleT * 10) * 0.35;
    }
  }

  /**
   * Idle hint: visually nudge two tiles into each other and back to show a
   * possible match. Pure animation — never mutates logic/board state.
   */
  async hintSwap(a: { row: number; col: number }, b: { row: number; col: number }): Promise<void> {
    const ia = this.board.index(a.row, a.col);
    const ib = this.board.index(b.row, b.col);
    const ma = this.tiles[ia];
    const mb = this.tiles[ib];
    if (!ma || !mb) return;
    const pa = ma.position.clone();
    const pb = mb.position.clone();
    const color = new THREE.Color(0x7fe3ff);
    this.vfx.shockwave(pa, color, 0.9);
    this.vfx.shockwave(pb, color, 0.9);

    const slide = (fromA: THREE.Vector3, fromB: THREE.Vector3, toA: THREE.Vector3, toB: THREE.Vector3) =>
      this.animate(0.24, (k) => {
        const e = Easing.easeInOutQuad(k);
        ma.position.lerpVectors(fromA, toA, e);
        mb.position.lerpVectors(fromB, toB, e);
      });

    const pulse = this.animate(0.78, (k) => {
      const s = 1 + Math.sin(k * Math.PI) * 0.18;
      ma.scale.setScalar(s);
      mb.scale.setScalar(s);
    });

    const seq = slide(pa, pb, pb, pa)
      .then(() => this.animate(0.3, () => undefined)) // hold on the hinted pair
      .then(() => slide(pb, pa, pa, pb))
      .then(() => {
        ma.position.copy(pa);
        mb.position.copy(pb);
      });

    await Promise.all([seq, pulse]);
    ma.scale.setScalar(1);
    mb.scale.setScalar(1);
  }

  /** Animate a swap between two cells. Invalid/blocked swaps bounce back. */
  animateSwap(a: { row: number; col: number }, b: { row: number; col: number }, accepted: boolean): Promise<void> {
    const ia = this.board.index(a.row, a.col);
    const ib = this.board.index(b.row, b.col);
    const ma = this.tiles[ia];
    const mb = this.tiles[ib];
    if (!ma && !mb) return Promise.resolve();
    const pa = ma ? ma.position.clone() : this.cellWorld(a.row, a.col);
    const pb = mb ? mb.position.clone() : this.cellWorld(b.row, b.col);

    if (accepted) {
      if (!ma || !mb) return Promise.resolve();
      // keep index -> mesh mapping consistent with the logic state
      this.tiles[ia] = mb;
      this.tiles[ib] = ma;
      return this.animate(0.16, (k) => {
        const ease = Easing.easeInOutQuad(k);
        ma.position.lerpVectors(pa, pb, ease);
        mb.position.lerpVectors(pb, pa, ease);
      }).then(() => {
        ma.position.copy(pb);
        mb.position.copy(pa);
      });
    }

    // bounce: the active piece lunges halfway then springs back with overshoot;
    // the target (blocker / immovable) shakes to show it was bumped.
    const activeObj: THREE.Object3D | null = ma ?? this.blockers.get(ia) ?? null;
    const targetObj: THREE.Object3D | null = mb ?? this.blockers.get(ib) ?? null;
    const paActive = activeObj ? activeObj.position.clone() : this.cellWorld(a.row, a.col);
    const pbTarget = targetObj ? targetObj.position.clone() : this.cellWorld(b.row, b.col);
    const midA = paActive.clone().lerp(pbTarget, 0.62);

    const bounce = this.animate(0.12, (k) => {
      const ease = Easing.easeOutQuad(k);
      if (activeObj) activeObj.position.lerpVectors(paActive, midA, ease);
    })
      .then(() =>
        this.animate(0.46, (k) => {
          // elastic return overshoots past the origin, giving a springy rebound
          const ease = Easing.easeOutElastic(k);
          if (activeObj) activeObj.position.lerpVectors(midA, paActive, ease);
        })
      )
      .then(() => {
        if (activeObj) activeObj.position.copy(paActive);
      });

    const flatTarget = !!targetObj?.userData.isFlatSprite;
    const shake = targetObj
      ? this.animate(0.42, (k) => {
          const decay = 1 - k;
          const s = Math.sin(k * Math.PI * 9) * 0.28 * decay;
          if (flatTarget) {
            // flat sprites: nudge only (any rotation reads as jitter)
          } else {
            targetObj.rotation.z = s;
            targetObj.rotation.y = s * 0.5;
          }
          targetObj.position.x = pbTarget.x + s * 0.16;
        }).then(() => {
          targetObj.rotation.z = 0;
          targetObj.rotation.y = 0;
          targetObj.position.copy(pbTarget);
        })
      : Promise.resolve();

    return Promise.all([bounce, shake]).then(() => undefined);
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
    fitObject(inner, special !== SpecialType.None ? 0.98 : 0.8, true);
    outer.userData.tileType = special !== SpecialType.None ? 0 : tileType;
    outer.userData.special = special;
    outer.userData.spin = inner.userData.spin === true;
    outer.userData.isFlatSprite = inner.userData.isFlatSprite === true;
    outer.userData.particlesUpdate = inner.userData.particlesUpdate;
    outer.userData.blink = inner.userData.blink;
    outer.userData.blinkMat = inner.userData.blinkMat;
    return outer;
  }

  private setTileMesh(index: number, tileType: number, special: SpecialType, instant: boolean): void {
    const { row, col } = this.board.coord(index);
    const pos = this.cellWorld(row, col);
    const mesh = this.makeTileMesh(tileType, special);
    const ord = this.spriteOrder++;
    mesh.traverse((o) => {
      if (!(o as THREE.Points).isPoints) o.renderOrder = ord; // keep particles under the sprite
    });
    this.root.add(mesh);
    mesh.position.copy(pos);
    mesh.scale.setScalar(instant ? 1 : 0.001);
    this.tiles[index] = mesh;
  }

  private spawnBlockerMesh(index: number, row: number, col: number, typeId: number): void {
    const obj = makeBlockerSprite(typeId);
    fitObject(obj, 0.8, true);
    obj.position.copy(this.cellWorld(row, col));
    const ord = this.spriteOrder++;
    obj.traverse((o) => {
      if ((o as THREE.Points).isPoints) return; // particles stay under the sprite
      o.renderOrder = ord;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = false;
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
    shell.renderOrder = 50000; // state overlays above the flat sprites
    shell.position.copy(this.cellWorld(row, col));
    this.root.add(shell);
    this.overlays.set(index, shell);
  }

  // ───────────────────────────── selection ─────────────────────────────

  setSelected(index: number | null): void {
    if (this.selected !== null && this.selected !== index) {
      const prev = this.tiles[this.selected];
      if (prev) {
        if (prev.userData.isFlatSprite) prev.scale.setScalar(1);
        else if (!prev.userData.spin) prev.rotation.y = 0;
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
        case "blockerHit":
          await this.animBlockerHit(ev);
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

  /** Screen-wide celebration for a special+special super combo. */
  comboBlast(): void {
    const cols = this.board.cols;
    const rows = this.board.rows;
    const gold = new THREE.Color(0xffd166);
    const white = new THREE.Color(0xffffff);
    // ground shockwave + crossing beams across the whole board
    this.vfx.shockwave(new THREE.Vector3(0, 0.02, 0), gold, Math.max(cols, rows) * 1.6);
    this.vfx.beam(new THREE.Vector3(0, 0.4, 0), true, Math.abs(this.scene.camera.right - this.scene.camera.left) * 0.6, gold);
    this.vfx.beam(new THREE.Vector3(0, 0.4, 0), false, Math.abs(this.scene.camera.bottom - this.scene.camera.top) * 0.6, gold);
    // sparks all over the board
    for (let i = 0; i < 46; i++) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      const p = this.cellWorld(r, c);
      p.y = 0.4 + Math.random() * 0.7;
      this.vfx.burst(p, i % 3 === 0 ? white : gold, 7 + Math.floor(Math.random() * 6), 3.5 + Math.random() * 4);
    }
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
        const flat = m.userData.isFlatSprite === true;
        // flat sprites must not spin (in-plane rotation reads as jitter);
        // they shrink + fade instead
        m.scale.setScalar(Math.max(0.001, flat ? 1 - k * k : 1 - k));
        if (flat) {
          const mat = (m.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshBasicMaterial | undefined;
          if (mat && mat.transparent) mat.opacity = 1 - k;
        } else {
          m.rotation.y = k * Math.PI;
        }
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
    // collapse chained moves (vertical then diagonal) of the same piece
    const plan = new Map<THREE.Object3D, { from: THREE.Vector3; to: THREE.Vector3 }>();
    for (const mv of ev.moves) {
      const mesh = this.tiles[mv.from];
      if (!mesh) continue;
      this.tiles[mv.from] = null;
      this.tiles[mv.to] = mesh;
      const { row, col } = this.board.coord(mv.to);
      const to = this.cellWorld(row, col);
      const existing = plan.get(mesh);
      if (existing) existing.to.copy(to);
      else plan.set(mesh, { from: mesh.position.clone(), to });
    }
    const items = [...plan.entries()];
    if (items.length === 0) return Promise.resolve();
    return this.animate(0.2, (k) => {
      const ease = Easing.easeOutQuad(k);
      for (const [mesh, it] of items) {
        mesh.position.lerpVectors(it.from, it.to, ease);
        mesh.position.y = Math.sin(ease * Math.PI) * 0.18;
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
        if (o.userData.isFlatSprite !== true) o.rotation.y = e * Math.PI * 2;
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

  /** Ultimate release burst at the aimed cell. */
  ultimateBurst(coord: { row: number; col: number }, colorHex: string): void {
    const pos = this.cellWorld(coord.row, coord.col);
    const c = new THREE.Color(parseInt(colorHex.slice(1), 16));
    this.vfx.shockwave(pos, c, 3.4);
    this.vfx.burst(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z), c, 40, 5);
  }

  /** Boss skill projectile: particles stream from the boss to a target cell. */
  bossProjectile(from: { x: number; y: number; z: number }, toIndex: number, color: number): void {
    const { row, col } = this.board.coord(toIndex);
    const to = this.cellWorld(row, col);
    to.y += 0.25;
    this.vfx.projectile(new THREE.Vector3(from.x, from.y, from.z), to, new THREE.Color(color), 16);
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
    // beams run across the whole visible screen, not just the board
    const cam = this.scene.camera;
    const viewW = (cam.right - cam.left) * 1.15;
    const viewH = (cam.bottom - cam.top) * 1.15; // top<bottom in screen terms
    if (special === SpecialType.LineHorizontal) {
      this.vfx.beam(pos, true, Math.abs(viewW), hexToColor(SPECIAL_COLORS.lineHorizontal));
    } else if (special === SpecialType.LineVertical) {
      this.vfx.beam(pos, false, Math.abs(viewH), hexToColor(SPECIAL_COLORS.lineVertical));
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

  /**
   * Blocker damage/death. Broken blockers vanish immediately and emit a
   * distinct grey "stone debris" burst (different from element shatter).
   */
  private async animBlockerHit(ev: BlockerHitEvent): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const hit of ev.hits) {
      const { row, col } = this.board.coord(hit.index);
      const pos = this.cellWorld(row, col);
      const color = new THREE.Color(blockerColor(hit.blockerType));
      const center = new THREE.Vector3(pos.x, pos.y + 0.28, pos.z);
      const obj = this.blockers.get(hit.index);
      if (!hit.broken) {
        // HP loss: shake + white-flash punch so each lost point reads clearly
        this.vfx.burst(center, color, 8, 2.0);
        if (obj) jobs.push(this.animateBlockerDamage(obj));
        continue;
      }
      // HP reached 0: elimination animation (puff up -> shrink/spin out) then remove
      this.blockers.delete(hit.index);
      if (obj) {
        jobs.push(this.animateBlockerBreak(obj, pos, center, color));
      } else {
        this.vfx.burst(center, color, 26, 3.4);
        this.vfx.shockwave(pos, color, 1.5);
      }
    }
    await Promise.all(jobs);
  }

  private animateBlockerDamage(obj: THREE.Object3D): Promise<void> {
    const base = obj.position.clone();
    const baseScale = obj.scale.x;
    const flat = !!obj.userData.isFlatSprite;
    return this.animate(0.22, (k) => {
      const wob = Math.sin(k * Math.PI * 4) * (1 - k) * 0.06;
      obj.position.set(base.x + wob, base.y, base.z);
      obj.scale.setScalar(baseScale * (1 + Math.sin(k * Math.PI) * 0.14));
      if (!flat) obj.rotation.z = Math.sin(k * Math.PI * 3) * (1 - k) * 0.2;
    }).then(() => {
      obj.position.copy(base);
      obj.scale.setScalar(baseScale);
      obj.rotation.z = 0;
      obj.rotation.y = 0;
    });
  }

  private animateBlockerBreak(obj: THREE.Object3D, pos: THREE.Vector3, center: THREE.Vector3, color: THREE.Color): Promise<void> {
    this.vfx.burst(center, color, 26, 3.4);
    this.vfx.burst(new THREE.Vector3(pos.x, pos.y + 0.1, pos.z), new THREE.Color(0xf0f0f0), 12, 2.2);
    this.vfx.shockwave(pos, color, 1.5);
    const baseScale = obj.scale.x;
    const baseY = obj.position.y;
    const flat = !!obj.userData.isFlatSprite;
    return this.animate(0.3, (k) => {
      // brief puff up, then collapse while spinning out
      const s = k < 0.3 ? 1 + k * 0.6 : Math.max(0.001, 1.18 * (1 - (k - 0.3) / 0.7));
      obj.scale.setScalar(baseScale * s);
      obj.position.y = baseY + k * 0.35;
      if (!flat) {
        obj.rotation.y = k * Math.PI * 2;
        obj.rotation.z = k * 1.1;
      } // flat sprite blockers: no spin, just puff + collapse
    }).then(() => {
      this.root.remove(obj);
    });
  }

  private animate(duration: number, apply: (k: number) => void): Promise<void> {
    return new Promise((resolve) => {
      const state = { t: 0 };
      this.scene.tweens.to(state, { t: 1 }, { duration, ease: Easing.easeOutCubic, onUpdate: () => apply(state.t), onComplete: resolve });
    });
  }
}
