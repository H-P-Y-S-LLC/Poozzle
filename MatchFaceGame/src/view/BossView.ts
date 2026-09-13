/**
 * Boss view: procedural boss model + event reactions.
 * Spec: Documents/ThreeJsWebPortDevDoc.md §5.5.
 */
import * as THREE from "three";
import type { SceneRoot } from "./SceneRoot.js";
import type { BoardEvent } from "../logic/BoardLogic.js";
import { generateBossModel, type BossModel } from "../proc/BossShapeGenerator.js";
import { bossShapeParams } from "../proc/BossShapeParams.js";

export class BossView {
  private scene: SceneRoot;
  private model: BossModel;
  private flash = 0;
  private lunge = 0;
  private phase = 1;
  private t = 0;
  private baseZ: number;

  constructor(scene: SceneRoot, bossId: string, rows: number, cols: number) {
    this.scene = scene;
    this.model = generateBossModel(bossShapeParams(bossId));
    this.baseZ = rows / 2 + 0.45;
    const g = this.model.group;
    g.position.set(0, 0, -this.baseZ);
    g.rotation.y = Math.PI; // face the board/camera
    g.scale.multiplyScalar(0.72);
    void cols;
    scene.boardRoot.add(g);
  }

  get group(): THREE.Group {
    return this.model.group;
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

    g.position.y = Math.sin(this.t * 1.8) * 0.06;
    const lungeZ = Math.sin(this.lunge * Math.PI) * 0.9;
    g.position.z = -this.baseZ + lungeZ;

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
