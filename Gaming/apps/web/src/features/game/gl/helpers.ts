/**
 * Shared three.js helpers for the 3D game scenes (magnat board, backgammon,
 * chess). Pure/stateless utilities: GPU-resource disposal, procedural textures
 * (wood, normal maps), dice faces, and easing. Keeping them here avoids
 * duplicating the (non-trivial) texture generation across scenes.
 */
import {
  CanvasTexture,
  Color,
  Euler,
  type Object3D,
  PMREMGenerator,
  RepeatWrapping,
  type Scene,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { Vector2 } from "three";
import type { Camera } from "three";

export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
export const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Recursively free a subtree's GPU resources (geometries, materials, textures). */
export function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as { geometry?: { dispose?: () => void }; material?: unknown };
    mesh.geometry?.dispose?.();
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats as Array<Record<string, unknown> & { dispose: () => void }>) {
      for (const v of Object.values(m)) {
        if (v && (v as Texture).isTexture) (v as Texture).dispose();
      }
      m.dispose();
    }
  });
}

/** A cinematic post-processing stack: ambient occlusion → bloom → SMAA → ACES.
 *  Returns a composer plus setSize/dispose that also handle every pass. */
export function makeComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w: number, h: number) {
  // NB: SSAOPass misbehaves under an orthographic camera (over-darkens flat
  // surfaces), so depth comes from real shadows; the composer does bloom + AA +
  // ACES only.
  const composer = new EffectComposer(renderer);
  const render = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new Vector2(w, h), 0.14, 0.5, 1.1);
  const output = new OutputPass();
  const smaa = new SMAAPass();
  const passes = [render, bloom, output, smaa];
  for (const p of passes) composer.addPass(p);
  return {
    composer,
    setSize: (nw: number, nh: number) => composer.setSize(nw, nh),
    dispose: () => {
      for (const p of passes) (p as { dispose?: () => void }).dispose?.();
      composer.dispose();
    },
  };
}

/** Bake a soft image-based environment for reflections; disposes the generator. */
export function bakeEnvironment(renderer: WebGLRenderer): Texture {
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const tex = pmrem.fromScene(room, 0.04).texture;
  pmrem.dispose();
  disposeObject(room);
  return tex;
}

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

/* ── procedural normal maps (height field → tangent-space normals) ───────── */
function heightCanvas(S: number, fn: (u: number, v: number) => number): HTMLCanvasElement {
  const { c, ctx } = makeCanvas(S, S);
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = Math.max(0, Math.min(1, fn(x / S, y / S))) * 255;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function heightToNormal(src: HTMLCanvasElement, strength: number): CanvasTexture {
  const S = src.width;
  const sd = src.getContext("2d")!.getImageData(0, 0, S, S).data;
  const { c: out, ctx: octx } = makeCanvas(S, S);
  const od = octx.createImageData(S, S);
  const at = (x: number, y: number) => sd[(((y + S) % S) * S + ((x + S) % S)) * 4]! / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      od.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      od.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      od.data[i + 2] = (1 / len) * 0.5 * 255 + 127.5;
      od.data[i + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  const tex = new CanvasTexture(out);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

const cloneTex = (t: CanvasTexture): CanvasTexture => {
  const c = t.clone();
  c.wrapS = c.wrapT = RepeatWrapping;
  c.needsUpdate = true;
  return c;
};

let _clothN: CanvasTexture | null = null;
/** Fine over-under cloth weave normal map (felt). Returns a disposable clone. */
export function clothNormal(): CanvasTexture {
  _clothN ??= heightToNormal(
    heightCanvas(128, (u, v) => 0.5 + 0.25 * Math.sin(u * Math.PI * 2 * 16) + 0.25 * Math.sin(v * Math.PI * 2 * 16)),
    2.2,
  );
  return cloneTex(_clothN);
}
let _woodN: CanvasTexture | null = null;
/** Wood-grain normal map. Returns a disposable clone. */
export function woodNormal(): CanvasTexture {
  _woodN ??= heightToNormal(
    heightCanvas(256, (u, v) => {
      const grain = 0.5 + 0.16 * Math.sin(v * Math.PI * 2 * 5 + Math.sin(u * 9) * 1.6) + 0.08 * Math.sin(v * Math.PI * 2 * 38);
      return grain + (hash2(Math.floor(u * 64), Math.floor(v * 256)) - 0.5) * 0.05;
    }),
    1.6,
  );
  return cloneTex(_woodN);
}
let _paperN: CanvasTexture | null = null;
/** Faint paper-grain normal map. Returns a disposable clone. */
export function paperNormal(): CanvasTexture {
  _paperN ??= heightToNormal(
    heightCanvas(128, (u, v) => 0.5 + (hash2(Math.floor(u * 128), Math.floor(v * 128)) - 0.5) * 0.6),
    1.0,
  );
  return cloneTex(_paperN);
}

/** Procedural walnut colour texture (per-call; cheap, no caching needed). */
export function woodTexture(): CanvasTexture {
  const W = 512;
  const { c, ctx } = makeCanvas(W, W);
  const g = ctx.createLinearGradient(0, 0, 0, W);
  g.addColorStop(0, "#5b3b1f");
  g.addColorStop(0.5, "#462914");
  g.addColorStop(1, "#3a2312");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, W);
  for (let i = 0; i < 70; i++) {
    const y = Math.random() * W;
    ctx.strokeStyle = `rgba(${(20 + Math.random() * 40) | 0},${(12 + Math.random() * 20) | 0},8,0.22)`;
    ctx.lineWidth = 1 + Math.random() * 2.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 14) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 5);
    ctx.stroke();
  }
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = "rgba(255,212,150,0.05)";
    ctx.fillRect(0, Math.random() * W, W, 1.5);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = tex.wrapT = RepeatWrapping;
  return tex;
}

/** Six dice-face textures (value 1..6) as pip canvases. */
export function pipFaces(): CanvasTexture[] {
  const PIP: Record<number, [number, number][]> = {
    1: [[.5, .5]],
    2: [[.27, .27], [.73, .73]],
    3: [[.27, .27], [.5, .5], [.73, .73]],
    4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
    5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]],
    6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]],
  };
  return [1, 2, 3, 4, 5, 6].map((v) => {
    const S = 128;
    const { c, ctx } = makeCanvas(S, S);
    ctx.fillStyle = "#f7f4ea";
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = "#15171a";
    for (const [px, py] of PIP[v]!) {
      ctx.beginPath();
      ctx.arc(px * S, py * S, S * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  });
}

/** BoxGeometry material slot order [+X,-X,+Y,-Y,+Z,-Z] → pip values [1,6,2,5,3,4]. */
export const DICE_FACE_ORDER = [0, 5, 1, 4, 2, 3];

/** Cube rotation that puts dice value `v` face-up (layout above). */
export function faceUp(v: number): Euler {
  switch (v) {
    case 1: return new Euler(0, 0, Math.PI / 2);
    case 6: return new Euler(0, 0, -Math.PI / 2);
    case 2: return new Euler(0, 0, 0);
    case 5: return new Euler(Math.PI, 0, 0);
    case 3: return new Euler(-Math.PI / 2, 0, 0);
    default: return new Euler(Math.PI / 2, 0, 0); // 4
  }
}

export { Color };
