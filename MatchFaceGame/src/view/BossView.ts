/**
 * Boss view: procedural boss model + event reactions.
 * Shown as a horizontal side profile facing the top-down camera, in its own
 * strip above the board (never overlapping the grid).
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.5.
 */
import * as THREE from "three";
import type { SceneRoot } from "./SceneRoot.js";
import type { BoardEvent } from "../logic/BoardLogic.js";
import { generateBossModel, type BossModel } from "../proc/BossShapeGenerator.js";
import { bossShapeParams } from "../proc/BossShapeParams.js";

/** Horizontal (screen-vertical axis) turn applied to the side profile. */
const BOSS_VIEW_YAW_DEG = 30;
/** Slight forward tilt (screen-horizontal axis) for extra depth. */
const BOSS_VIEW_PITCH_DEG = 30;
/** Roll around the depth axis (dip the model downward on screen). */
const BOSS_VIEW_ROLL_DEG = -15;

export class BossView {
  private scene: SceneRoot;
  private model: BossModel;
  private flash = 0;
  private lunge = 0;
  private phase = 1;
  private t = 0;
  private baseZ: number;
  private baseScale = new THREE.Vector3(1, 1, 1);
  private baseQuat = new THREE.Quaternion();
  private hitT = 0;
  private readonly shakeAxis = new THREE.Vector3(0, 0, 1);

  constructor(scene: SceneRoot, bossId: string, rows: number, strip = 1.4, lowBias = 0.34) {
    this.scene = scene;
    this.model = generateBossModel(bossShapeParams(bossId));
    this.baseZ = rows / 2 + strip * lowBias; // gap above the board (higher bias = bigger gap)
    const g = this.model.group;
    g.position.set(0, 0, -this.baseZ);

    // Horizontal side profile, right way up: local X (left/right) -> world -Y,
    // local Y (dorsal) -> world -Z (screen up), local Z (head/tail) -> world +X.
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(1, 0, 0)
    );
    this.baseQuat.setFromRotationMatrix(basis);
    const pitch = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      THREE.MathUtils.degToRad(BOSS_VIEW_PITCH_DEG)
    );
    const yaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      THREE.MathUtils.degToRad(BOSS_VIEW_YAW_DEG)
    );
    this.baseQuat.premultiply(pitch).premultiply(yaw);
    const roll = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      THREE.MathUtils.degToRad(BOSS_VIEW_ROLL_DEG)
    );
    this.baseQuat.premultiply(roll);
    g.quaternion.copy(this.baseQuat);

    // thicken the dorsal axis so the side profile has presence
    g.scale.set(0.72, 0.72 * 1.55, 0.72);
    this.baseScale.copy(g.scale);
    scene.boardRoot.add(g);
  }

  get group(): THREE.Group {
    return this.model.group;
  }

  /** Trigger a hit reaction (used when a weakness flies in). */
  hit(strength = 1): void {
    this.flash = Math.max(this.flash, strength);
    this.hitT = Math.max(this.hitT, strength);
  }

  onEvents(events: BoardEvent[]): void {
    for (const e of events) {
      if (e.type === "bossHp") this.flash = 1;
      else if (e.type === "bossSkill") this.lunge = 1;
      else if (e.type === "bossPhase") this.phase = e.phase;
    }
  }

  update(dt: number): void {
    this.t += dt;
    const m = this.model;
    const g = m.group;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.lunge = Math.max(0, this.lunge - dt * 2);
    this.hitT = Math.max(0, this.hitT - dt * 1.6);

    const hit = this.hitT;
    g.position.y = Math.sin(this.t * 1.8) * 0.06;
    g.position.x = Math.sin(this.t * 46) * 0.12 * hit;
    const lungeZ = Math.sin(this.lunge * Math.PI) * 0.9;
    g.position.z = -this.baseZ + lungeZ - hit * 0.45;

    g.quaternion.copy(this.baseQuat);
    if (hit > 0.001) {
      const q = new THREE.Quaternion().setFromAxisAngle(this.shakeAxis, Math.sin(this.t * 42) * 0.14 * hit);
      g.quaternion.multiply(q);
    }
    const sq = 1 - hit * 0.07;
    g.scale.set(this.baseScale.x, this.baseScale.y * sq, this.baseScale.z);

    m.head.rotation.y = Math.sin(this.t * 1.1) * 0.2;
    m.legs.forEach((leg, i) => {
      leg.rotation.x = Math.sin(this.t * 4 + i) * 0.18;
    });
    m.wings.forEach((w) => {
      w.group.rotation.z = w.side * (0.3 + Math.sin(this.t * 30) * 0.6);
    });
    m.tail.forEach((seg, i) => {
      seg.rotation.y = Math.sin(this.t * 2.4 - i * 0.5) * 0.18;
      seg.rotation.x = -0.05 + Math.sin(this.t * 1.8 - i * 0.4) * 0.08;
    });
    m.antennae.forEach((a, i) => {
      a.group.rotation.z = a.side * Math.sin(this.t * 2 + i) * 0.2;
    });

    const emissive = this.flash * 0.9 + (this.phase - 1) * 0.15;
    for (const mat of m.bodyMaterials) {
      mat.emissiveIntensity = emissive;
    }
  }

  dispose(): void {
    this.scene.boardRoot.remove(this.model.group);
    this.model.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry?.dispose?.();
        if (Array.isArray(mesh.material)) mesh.material.forEach((mm) => mm.dispose());
        else (mesh.material as THREE.Material)?.dispose?.();
      }
    });
  }
}
