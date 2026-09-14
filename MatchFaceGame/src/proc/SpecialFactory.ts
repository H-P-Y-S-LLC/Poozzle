/**
 * Special blocks (variant design): flat glyph sprites whose strokes are tinted
 * by an animated flowing gradient (shader), so the texture itself looks alive.
 * Shapes/semantics per §5.4.2. A pulsing ring marks the block as tappable.
 */
import * as THREE from "three";
import { SpecialType } from "../logic/Match3Types.js";

const TEX = 256;
const maskCache = new Map<number, THREE.CanvasTexture>();

/** Stroke mask: dark outline + white glyph (the shader tints the white parts). */
function drawGlyph(g: CanvasRenderingContext2D, special: SpecialType, cx: number, cy: number, r: number, outline: boolean): void {
  if (special === SpecialType.LineHorizontal || special === SpecialType.LineVertical) {
    const horizontal = special === SpecialType.LineHorizontal;
    g.save();
    g.translate(cx, cy);
    if (!horizontal) g.rotate(Math.PI / 2);
    const len = r * 0.62;
    g.lineWidth = outline ? TEX * 0.05 : TEX * 0.028;
    g.beginPath();
    g.moveTo(-len, 0);
    g.lineTo(len, 0);
    g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(s * len, 0);
      g.lineTo(s * (len - r * 0.26), -r * 0.25);
      g.lineTo(s * (len - r * 0.26), r * 0.25);
      g.closePath();
      g.fill();
    }
    g.restore();
  } else if (special === SpecialType.Bomb3x3) {
    g.beginPath();
    g.arc(cx, cy + r * 0.08, r * 0.46, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = outline ? TEX * 0.055 : TEX * 0.035;
    g.beginPath();
    g.moveTo(cx + r * 0.3, cy - r * 0.3);
    g.quadraticCurveTo(cx + r * 0.6, cy - r * 0.62, cx + r * 0.42, cy - r * 0.78);
    g.stroke();
    g.beginPath();
    g.arc(cx + r * 0.42, cy - r * 0.82, r * (outline ? 0.12 : 0.1), 0, Math.PI * 2);
    g.fill();
  } else {
    for (let i = 0; i < 5; i++) {
      g.lineWidth = outline ? TEX * 0.07 : TEX * 0.05;
      g.beginPath();
      g.arc(cx, cy, r * (0.18 + i * 0.12), 0, Math.PI * 2);
      g.stroke();
    }
  }
}

function makeMask(special: SpecialType): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = TEX;
  c.height = TEX;
  const g = c.getContext("2d")!;
  const cx = TEX / 2;
  const cy = TEX / 2;
  const r = TEX * 0.45;
  g.lineCap = "round";
  g.lineJoin = "round";
  // dark outline behind the strokes keeps the glyph readable on any board
  g.strokeStyle = "rgba(18,20,32,0.9)";
  g.fillStyle = "rgba(18,20,32,0.9)";
  drawGlyph(g, special, cx, cy, r, true);
  // crisp white glyph -> tinted by the flowing gradient (no blurred edge)
  g.strokeStyle = "#ffffff";
  g.fillStyle = "#ffffff";
  drawGlyph(g, special, cx, cy, r, false);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = `
uniform sampler2D uMap;
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uFlow;
varying vec2 vUv;
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.02) discard;
  float lum = dot(t.rgb, vec3(0.3333));
  float m = smoothstep(0.4, 0.95, lum);        // 1 on white strokes, 0 on outline

  // flowing two-color base
  float f1 = 0.5 + 0.5 * sin((vUv.x + vUv.y) * uFlow + uTime * 2.0);
  float f2 = 0.5 + 0.5 * sin((vUv.x - vUv.y) * uFlow * 1.3 - uTime * 1.6);
  vec3 flow = mix(mix(uA, uB, f1), uC, f2 * 0.5);

  // moving texture inside the glyph: soft diagonal bands + travelling highlight
  // (kept low-frequency so it doesn't alias into jagged edges at board scale)
  float bands = 0.5 + 0.5 * sin((vUv.x + vUv.y) * 11.0 - uTime * 2.2);
  float shimmer = pow(0.5 + 0.5 * sin((vUv.x - vUv.y) * 6.0 - uTime * 1.7), 6.0);
  flow *= 0.8 + 0.32 * bands;
  flow += vec3(0.35) * shimmer * m * m;

  gl_FragColor = vec4(mix(t.rgb, flow, m), t.a);
}`;

function paletteFor(special: SpecialType): { a: THREE.Color; b: THREE.Color; c: THREE.Color } {
  switch (special) {
    case SpecialType.LineVertical:
      return { a: new THREE.Color(0x06d6a0), b: new THREE.Color(0x2d9cff), c: new THREE.Color(0xb8ffe0) };
    case SpecialType.Bomb3x3:
      return { a: new THREE.Color(0xef476f), b: new THREE.Color(0xffb020), c: new THREE.Color(0xffe066) };
    case SpecialType.ColorBomb:
      return { a: new THREE.Color(0xff5a8a), b: new THREE.Color(0x4c9aff), c: new THREE.Color(0x7cff6a) };
    default:
      return { a: new THREE.Color(0xffd166), b: new THREE.Color(0xff7a45), c: new THREE.Color(0xffe9a8) };
  }
}

export function makeSpecialObject(special: SpecialType): THREE.Group {
  const group = new THREE.Group();
  group.userData.special = special;
  group.userData.isFlatSprite = true;

  const pal = paletteFor(special);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: maskTexture(special) },
      uTime: { value: 0 },
      uA: { value: pal.a },
      uB: { value: pal.b },
      uC: { value: pal.c },
      uFlow: { value: 7.0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });

  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.03;
  group.add(plane);
  group.userData.particlesUpdate = (t: number): void => {
    mat.uniforms.uTime.value = t;
  };

  group.traverse((o) => {
    (o as THREE.Mesh).castShadow = false;
  });
  return group;
}

function maskTexture(special: SpecialType): THREE.CanvasTexture {
  let tex = maskCache.get(special);
  if (!tex) {
    tex = makeMask(special);
    maskCache.set(special, tex);
  }
  return tex;
}
