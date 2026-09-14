/**
 * Asset gallery: renders every element / special / blocker / boss with the same
 * procedural factories the game uses. Click any card to open an interactive 3D
 * inspector (drag to rotate, wheel/pinch to zoom).
 */
import "./gallery.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { makeFaceObject } from "./proc/TileFaceFactory.js";
import { makeSpecialObject } from "./proc/SpecialFactory.js";
import { makeBlockerSprite } from "./proc/BlockerSpriteFactory.js";
import { generateBossModel } from "./proc/BossShapeGenerator.js";
import { BOSS_SHAPE_PARAMS, bossShapeParams } from "./proc/BossShapeParams.js";
import { SpecialType } from "./logic/Match3Types.js";
import { itemIconCanvas } from "./proc/ItemIconFactory.js";
import { bossCoinIconCanvas } from "./proc/BossCoinIconFactory.js";

interface Item {
  group: string;
  id: string;
  name: string;
  build: () => THREE.Object3D;
  /** Preferred thumbnail camera (flat sprite groups look right from the top). */
  view?: "iso" | "top";
}

const ELEMENT_NAMES: Record<number, string> = {
  1: "Coral 珊瑚红 · 开心",
  2: "Amber 琥珀黄 · 惊讶",
  3: "Mint 薄荷绿 · 困",
  4: "Sky 天空蓝 · 生气",
  5: "Violet 薰衣紫 · 眨眼",
  6: "Peach 蜜桃橙 · 咧嘴",
  7: "Mud 泥水褐 (inert)",
};

const BLOCKER_NAMES: Record<number, string> = {
  1: "Valve 水阀",
  2: "Cracked Floor 碎地板",
  3: "Bulb 灯泡",
  4: "Paper 纸团",
  5: "Germ 细菌",
  6: "Mold 霉菌",
  7: "Spore 孢子",
  8: "Corrosion 腐蚀",
  9: "Soap 肥皂",
  10: "Eye 眼睛 2x2",
  11: "Nose 鼻子 1x3",
  12: "Rubber Duck 小黄鸭",
  13: "Mouth 嘴",
  14: "Bathtub 浴缸",
  15: "Puddle 水坑",
  16: "Insecticide 杀虫剂",
  17: "Blind Box 盲盒",
  18: "Drain 地漏",
  19: "Roach 小蟑螂",
  20: "Queen Ant 蚁后",
  21: "Dirt Pile 土堆",
  22: "Moss Mushroom 苔藓菇",
  23: "Reward Gear 奖励块/齿轮",
};

const SPECIAL_NAMES: Record<number, string> = {
  [SpecialType.LineHorizontal]: "Line Horizontal 横向直线",
  [SpecialType.LineVertical]: "Line Vertical 纵向直线",
  [SpecialType.Bomb3x3]: "Bomb 3x3 炸弹",
  [SpecialType.ColorBomb]: "Color Bomb 彩球",
};

const ITEM_NAMES: Record<string, string> = {
  hammer: "Hammer 锤子",
  shuffle: "Shuffle 洗牌",
  rocket: "Rocket 导弹",
  glove: "Glove 手套",
  finger: "Finger 手指",
};

/** BossCoin: gold disc with the boss emblem on the face and a dark back. */function buildCoinModel(bossId: string): THREE.Group {
  const g = new THREE.Group();
  const emblem = new THREE.CanvasTexture(bossCoinIconCanvas(bossId, 256));
  emblem.colorSpace = THREE.SRGBColorSpace;
  const side = new THREE.MeshStandardMaterial({ color: 0x8a6a16, metalness: 0.75, roughness: 0.3 });
  const face = new THREE.MeshStandardMaterial({ map: emblem, metalness: 0.35, roughness: 0.4 });
  const back = new THREE.MeshStandardMaterial({ color: 0x5c4a14, metalness: 0.6, roughness: 0.45 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 48), [side, face, back]);
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  return g;
}

/** Flat canvas icon as a horizontal plane (matches in-game sprite style). */
function flatIconPlane(canvas: HTMLCanvasElement): THREE.Mesh {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function buildItems(): Item[] {
  const items: Item[] = [];
  for (let t = 1; t <= 7; t++) {
    items.push({ group: "Elements 消除元素", id: `Tile ${t}`, name: ELEMENT_NAMES[t], build: () => makeFaceObject(t), view: "top" });
  }
  for (const st of [SpecialType.LineHorizontal, SpecialType.LineVertical, SpecialType.Bomb3x3, SpecialType.ColorBomb]) {
    items.push({ group: "Specials 特殊块", id: `Special ${st}`, name: SPECIAL_NAMES[st], build: () => makeSpecialObject(st), view: "top" });
  }
  for (let t = 1; t <= 23; t++) {
    items.push({ group: "Blockers 障碍块", id: `TypeId ${t}`, name: BLOCKER_NAMES[t], build: () => makeBlockerSprite(t), view: "top" });
  }
  let bossIndex = 0;
  for (const id of Object.keys(BOSS_SHAPE_PARAMS)) {
    bossIndex++;
    const p = bossShapeParams(id);
    items.push({
      group: "Bosses Boss 形象",
      id: `Boss ${String(bossIndex).padStart(2, "0")} · ${id}`,
      name: p.name,
      build: () => generateBossModel(p).group,
    });
  }
  for (const id of Object.keys(ITEM_NAMES)) {
    items.push({ group: "Items 道具", id: `Item · ${id}`, name: ITEM_NAMES[id], build: () => flatIconPlane(itemIconCanvas(id)), view: "top" });
  }
  let coinIndex = 0;
  for (const id of Object.keys(BOSS_SHAPE_PARAMS)) {
    coinIndex++;
    const p = bossShapeParams(id);
    items.push({
      group: "BossCoins 硬币",
      id: `Coin ${String(coinIndex).padStart(2, "0")} · ${id}`,
      name: `${p.name} Coin`,
      build: () => buildCoinModel(id),
    });
  }
  return items;
}

/** Center an object at the origin and normalize its max dimension to `target`. */
function normalize(obj: THREE.Object3D, target = 1.05): void {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z) || 1;
  obj.scale.multiplyScalar(target / max);
  const box2 = new THREE.Box3().setFromObject(obj);
  const c = box2.getCenter(new THREE.Vector3());
  obj.position.sub(c);
}

// ── offscreen thumbnail renderer ──
const SIZE = 180;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(2.5, 4, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0x9fbcff, 0.7);
rim.position.set(-3, 2, -3);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 50);
function setCamera(mode: "iso" | "top"): void {
  if (mode === "iso") camera.position.set(1.7, 1.9, 1.9);
  else camera.position.set(0, 2.6, 0.01);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

function renderItem(item: Item, mode: "iso" | "top"): string {
  setCamera(mode);
  const pivot = new THREE.Group();
  const obj = item.build();
  normalize(obj);
  pivot.add(obj);
  scene.add(pivot);
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");
  scene.remove(pivot);
  return url;
}

/** Interactive 3D inspector: drag to rotate, wheel/pinch to zoom, any angle. */
function createInspector(): (item: Item) => void {
  const overlay = document.createElement("div");
  overlay.className = "inspect hidden";
  const stage = document.createElement("div");
  stage.className = "inspect-stage";
  const close = document.createElement("button");
  close.className = "inspect-close";
  close.textContent = "✕";
  const label = document.createElement("div");
  label.className = "inspect-label";
  const hint = document.createElement("div");
  hint.className = "inspect-hint";
  hint.textContent = "拖动旋转 · 滚轮 / 双指缩放";
  const spin = document.createElement("button");
  spin.className = "inspect-spin active";
  spin.textContent = "自转 ⟳";
  overlay.append(stage, close, label, hint, spin);
  document.body.appendChild(overlay);

  const ir = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  ir.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ir.outputColorSpace = THREE.SRGBColorSpace;
  ir.toneMapping = THREE.ACESFilmicToneMapping;
  ir.toneMappingExposure = 1.15;
  stage.appendChild(ir.domElement);

  const iscene = new THREE.Scene();
  iscene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const k = new THREE.DirectionalLight(0xffffff, 1.7);
  k.position.set(3, 5, 4);
  iscene.add(k);
  const r = new THREE.DirectionalLight(0x9fbcff, 0.8);
  r.position.set(-4, 2, -3);
  iscene.add(r);
  const fill = new THREE.PointLight(0xff8c42, 14, 8, 2);
  fill.position.set(-2, 0.5, 2);
  iscene.add(fill);

  const icam = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
  icam.position.set(0.9, 1.3, 2.2);

  const controls = new OrbitControls(icam, ir.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.1;
  controls.maxDistance = 9;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.6;
  controls.update();

  let current: THREE.Object3D | null = null;
  let open = false;

  const resize = (): void => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w === 0 || h === 0) return;
    ir.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    ir.setSize(w, h, false);
    icam.aspect = w / h;
    icam.updateProjectionMatrix();
  };

  const loop = (): void => {
    if (!open) return;
    controls.update();
    ir.render(iscene, icam);
    requestAnimationFrame(loop);
  };

  const closeInspector = (): void => {
    open = false;
    overlay.classList.add("hidden");
    if (current) {
      iscene.remove(current);
      current = null;
    }
  };

  close.addEventListener("click", closeInspector);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeInspector();
  });
  spin.addEventListener("click", () => {
    controls.autoRotate = !controls.autoRotate;
    spin.classList.toggle("active", controls.autoRotate);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeInspector();
  });
  window.addEventListener("resize", () => {
    if (open) resize();
  });

  return (item: Item): void => {
    if (current) iscene.remove(current);
    const pivot = new THREE.Group();
    const obj = item.build();
    normalize(obj);
    pivot.add(obj);
    iscene.add(pivot);
    current = pivot;
    label.innerHTML = `<b>${item.name}</b><span>${item.id}</span>`;
    overlay.classList.remove("hidden");
    open = true;
    resize();
    icam.position.set(0.9, 1.3, 2.2);
    controls.target.set(0, 0, 0);
    controls.autoRotate = true;
    spin.classList.add("active");
    controls.update();
    requestAnimationFrame(loop);
  };
}

function main(): void {
  const app = document.getElementById("gallery");
  if (!app) return;
  const items = buildItems();
  const openInspector = createInspector();

  const header = document.createElement("header");
  header.className = "gallery-header";
  header.innerHTML = `<h1>MatchFace · Asset Gallery</h1><p>${items.length} assets · 程序化生成（零素材）· 点击查看 3D</p>`;

  const toggle = document.createElement("div");
  toggle.className = "gallery-toggle";
  const btnIso = document.createElement("button");
  btnIso.textContent = "3/4 View";
  btnIso.className = "active";
  const btnTop = document.createElement("button");
  btnTop.textContent = "Top View";
  toggle.append(btnIso, btnTop);
  header.appendChild(toggle);
  app.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "gallery-grid";
  app.appendChild(grid);

  let lastGroup = "";
  const cards: Array<{ item: Item; img: HTMLImageElement }> = [];

  for (const item of items) {
    if (item.group !== lastGroup) {
      lastGroup = item.group;
      const h = document.createElement("h2");
      h.className = "gallery-group";
      h.textContent = item.group;
      grid.appendChild(h);
    }
    const card = document.createElement("figure");
    card.className = "gallery-card";
    const img = document.createElement("img");
    img.src = renderItem(item, item.view ?? "iso");
    img.alt = item.name;
    const cap = document.createElement("figcaption");
    cap.innerHTML = `<b>${item.name}</b><span>${item.id}</span>`;
    card.append(img, cap);
    card.addEventListener("click", () => openInspector(item));
    grid.appendChild(card);
    cards.push({ item, img });
  }

  const rerender = (m: "iso" | "top"): void => {
    btnIso.classList.toggle("active", m === "iso");
    btnTop.classList.toggle("active", m === "top");
    for (const c of cards) c.img.src = renderItem(c.item, m);
  };
  btnIso.addEventListener("click", () => rerender("iso"));
  btnTop.addEventListener("click", () => rerender("top"));
}

main();
