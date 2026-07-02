/**
 * МАГНАТ 3D board (three.js) — "Stylized Bulgaria", fixed isometric camera.
 *
 * Builds the 40-tile ring with group-coloured property bands and readable
 * Cyrillic city labels, player tokens that glide tile-to-tile, houses/hotels on
 * developed properties, a central plaque in the Bulgarian tricolour, and 3D
 * dice. Soft shadows + ACES tone mapping + a room environment give it depth.
 * The React view (MagnatView) owns the DOM HUD; this owns the pixels. Renders
 * on demand (rAF only while tokens move) so a static board costs no idle GPU.
 */
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DirectionalLight,
  Euler,
  Group,
  HemisphereLight,
  LatheGeometry,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector2,
  Vector3,
} from "three";
import { BOARD, GROUP_COLORS, BOARD_SIZE, type MagnatState } from "@aso/shared";
import { RenderCore } from "../gl/render.js";
import { defaultGfxParams } from "../gl/gfxRegistry.js";

/** Recursively free a subtree's GPU resources (geometries, materials, textures). */
function disposeObject(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as { geometry?: { dispose?: () => void }; material?: unknown };
    mesh.geometry?.dispose?.();
    const mat = mesh.material;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats as MeshStandardMaterial[]) {
      for (const v of Object.values(m)) {
        if (v && (v as Texture).isTexture) (v as Texture).dispose();
      }
      m.dispose();
    }
  });
}

/** Free only a subtree's geometries (used when its materials are shared/reused). */
function disposeGeoms(root: Object3D): void {
  root.traverse((o) => (o as { geometry?: { dispose?: () => void } }).geometry?.dispose?.());
}

const PLAYER_COLORS = ["#e23b3b", "#2f7fe2", "#2faa55", "#e8b923", "#9b4fd0", "#e07a1f"];
const T = 2; // tile pitch
const H = 5 * T; // board half-size
const RING_DEPTH = T * 1.7;
const SCENE_RATIO = 0.66;
const HOP_MS = 145; // per-tile token hop
const HOP_H = 0.7; // hop arc height
const DICE_MS = 760; // dice tumble
const POP_MS = 340; // house build pop-in
const TOKEN_Y = 0.5;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOutBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

/** Cube rotation that puts dice value `v` face-up (face layout: +X1 -X6 +Y2 -Y5 +Z3 -Z4). */
function faceUp(v: number): Euler {
  switch (v) {
    case 1: return new Euler(0, 0, Math.PI / 2);
    case 6: return new Euler(0, 0, -Math.PI / 2);
    case 2: return new Euler(0, 0, 0);
    case 5: return new Euler(Math.PI, 0, 0);
    case 3: return new Euler(-Math.PI / 2, 0, 0);
    default: return new Euler(Math.PI / 2, 0, 0); // 4
  }
}

/** Forward tile path from `from` to `to` around the ring; a single hop for teleports. */
function ringPath(from: number, to: number): number[] {
  const fwd = (to - from + BOARD_SIZE) % BOARD_SIZE;
  if (fwd === 0 || fwd > 13) return [to]; // same tile or a jump (jail / advance to GO)
  const out: number[] = [];
  for (let s = 1; s <= fwd; s++) out.push((from + s) % BOARD_SIZE);
  return out;
}

interface TilePlacement {
  x: number;
  z: number;
  side: 0 | 1 | 2 | 3; // 0 bottom (+z), 1 left (-x), 2 top (-z), 3 right (+x)
  corner: boolean;
}

function placements(): TilePlacement[] {
  const p: TilePlacement[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (i <= 10) p.push({ x: H - i * T, z: H, side: 0, corner: i === 0 || i === 10 });
    else if (i <= 20) p.push({ x: -H, z: H - (i - 10) * T, side: 1, corner: i === 20 });
    else if (i <= 30) p.push({ x: -H + (i - 20) * T, z: -H, side: 2, corner: i === 30 });
    else p.push({ x: H, z: -H + (i - 30) * T, side: 3, corner: false });
  }
  return p;
}

function specialColor(type: string): string {
  switch (type) {
    case "go": return "#2faa55";
    case "jail": return "#4a4a4a";
    case "free": return "#3a7bd5";
    case "gotojail": return "#cc2b2b";
    case "station": return "#2a2a2a";
    case "utility": return "#3a8f8f";
    case "tax": return "#8a6a35";
    case "chance": return "#e8862b";
    case "chest": return "#c9a23a";
    default: return "#caa";
  }
}

/**
 * Choose a line-split (1–3 lines) and font size that fills the box while
 * guaranteeing the text fits both width and height — so no name ever overflows.
 */
function fitText(
  ctx: CanvasRenderingContext2D,
  name: string,
  maxW: number,
  maxH: number,
  maxFont: number,
): { lines: string[]; font: number } {
  const base = 100;
  const fontStr = (f: number) => `800 ${f}px Manrope, system-ui, sans-serif`;
  const words = name.split(" ");
  const candidates: string[][] = [[name]];
  // every 2-line split at a space
  for (let k = 1; k < words.length; k++) {
    candidates.push([words.slice(0, k).join(" "), words.slice(k).join(" ")]);
  }
  // a balanced 3-line split for very long multi-word names
  if (words.length >= 3) {
    const a = Math.ceil(words.length / 3);
    candidates.push([
      words.slice(0, a).join(" "),
      words.slice(a, 2 * a).join(" "),
      words.slice(2 * a).join(" "),
    ]);
  }
  let best = { lines: [name], font: 8 };
  for (const lines of candidates) {
    ctx.font = fontStr(base);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const byW = (maxW / widest) * base;
    const byH = maxH / (lines.length * 1.18);
    const f = Math.min(maxFont, byW, byH);
    if (f > best.font) best = { lines, font: f };
  }
  return best;
}

/** High-res tile label (name + price) oriented to read from outside the board. */
function labelTexture(idx: number, side: number): CanvasTexture {
  const tl = BOARD[idx]!;
  const W = 360;
  const Hc = 480; // taller axis = radial (inner→outer)
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hc;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f4ecd6";
  ctx.fillRect(0, 0, W, Hc);

  // outward-reading: rotate the whole drawing so "up" points to board centre
  ctx.save();
  ctx.translate(W / 2, Hc / 2);
  ctx.rotate((side * Math.PI) / 2);
  ctx.translate(-W / 2, -Hc / 2);

  const banded = tl.type === "prop";
  if (banded) {
    ctx.fillStyle = GROUP_COLORS[tl.group] ?? "#999";
    ctx.fillRect(0, 0, W, Hc * 0.2);
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, Hc * 0.2 - 5, W, 5);
  }
  ctx.fillStyle = "#120c06";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const top = banded ? Hc * 0.2 : 0;
  const bottom = tl.price > 0 ? Hc * 0.78 : Hc;
  const { lines, font } = fitText(ctx, tl.name, W * 0.9, (bottom - top) * 0.92, 96);
  ctx.font = `800 ${font}px Manrope, system-ui, sans-serif`;
  const lh = font * 1.18;
  const cy = (top + bottom) / 2;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, cy - ((lines.length - 1) * lh) / 2 + i * lh));
  if (tl.price > 0) {
    ctx.font = "800 54px Manrope, system-ui, sans-serif";
    ctx.fillStyle = "#6a4421";
    ctx.fillText(`${tl.price}`, W / 2, Hc * 0.88);
  }
  ctx.restore();

  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  return tex;
}

function plaqueTexture(): CanvasTexture {
  const W = 768;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
  // Muted tricolour — an inlaid felt banner, not a printed flag; the pure
  // white/green/red stripes read neon under the key light + ACES.
  ctx.fillStyle = "#ded5bd"; ctx.fillRect(0, 0, W, W / 3);
  ctx.fillStyle = "#2e6e44"; ctx.fillRect(0, W / 3, W, W / 3);
  ctx.fillStyle = "#9e3a30"; ctx.fillRect(0, (2 * W) / 3, W, W / 3);
  // soft edge vignette so the inlay sits into the felt instead of floating
  const vg = ctx.createRadialGradient(W / 2, W / 2, W * 0.32, W / 2, W / 2, W * 0.72);
  vg.addColorStop(0, "rgba(10,20,14,0)");
  vg.addColorStop(1, "rgba(10,20,14,0.34)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = "rgba(233,205,130,0.55)";
  ctx.lineWidth = 7;
  ctx.strokeRect(10, 10, W - 20, W - 20);
  ctx.save();
  ctx.translate(W / 2, W / 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = "rgba(15,12,9,0.92)";
  ctx.fillRect(-W * 0.46, -84, W * 0.92, 168);
  ctx.fillStyle = "#e9cd82";
  ctx.font = "900 132px Playfair Display, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("МАГНАТ", 0, 8);
  ctx.restore();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Procedural walnut wood for the outer rail frame. */
function woodTexture(): CanvasTexture {
  const W = 512;
  const c = document.createElement("canvas");
  c.width = c.height = W;
  const ctx = c.getContext("2d")!;
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

function pipFaces(): CanvasTexture[] {
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
    const c = document.createElement("canvas");
    c.width = c.height = S;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f7f4ea"; ctx.fillRect(0, 0, S, S);
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

/** Turned-pawn profile for player tokens. */
function pawnGeometry(): LatheGeometry {
  const pts = [
    [0.0, 0.0], [0.52, 0.0], [0.52, 0.1], [0.34, 0.16], [0.26, 0.18],
    [0.24, 0.5], [0.34, 0.62], [0.2, 0.74], [0.32, 0.84], [0.3, 0.96],
    [0.0, 1.06],
  ].map(([r, y]) => new Vector2(r, y));
  return new LatheGeometry(pts, 28);
}

/* ── procedural normal maps (height field → tangent-space normals) ───────── */
function heightCanvas(S: number, fn: (u: number, v: number) => number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d")!;
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
  const W = src.width;
  const Hh = src.height;
  const sd = src.getContext("2d")!.getImageData(0, 0, W, Hh).data;
  const out = document.createElement("canvas");
  out.width = W;
  out.height = Hh;
  const octx = out.getContext("2d")!;
  const od = octx.createImageData(W, Hh);
  const at = (x: number, y: number) => sd[((((y % Hh) + Hh) % Hh) * W + (((x % W) + W) % W)) * 4]! / 255;
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
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

const hash2 = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// The Sobel pass is cached once; callers get a lightweight clone (shares the
// source canvas) so per-instance disposal never frees the shared singleton.
const cloneTex = (t: CanvasTexture): CanvasTexture => {
  const c = t.clone();
  c.wrapS = c.wrapT = RepeatWrapping;
  c.needsUpdate = true;
  return c;
};
let _clothN: CanvasTexture | null = null;
function clothNormal(): CanvasTexture {
  _clothN ??= heightToNormal(
    heightCanvas(128, (u, v) => 0.5 + 0.25 * Math.sin(u * Math.PI * 2 * 16) + 0.25 * Math.sin(v * Math.PI * 2 * 16)),
    2.2,
  );
  return cloneTex(_clothN);
}
let _woodN: CanvasTexture | null = null;
function woodNormal(): CanvasTexture {
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
function paperNormal(): CanvasTexture {
  _paperN ??= heightToNormal(
    heightCanvas(128, (u, v) => 0.5 + (hash2(Math.floor(u * 128), Math.floor(v * 128)) - 0.5) * 0.6),
    1.0,
  );
  return cloneTex(_paperN);
}

export class MagnatScene {
  private core!: RenderCore;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private place = placements();
  private pawnGeo = pawnGeometry();
  private maxAniso = 1;
  private tokens: Group[] = [];
  private tokenTarget: Vector3[] = [];
  private prevPos: number[] = [];
  private walks: ({ pts: Vector3[]; from: Vector3; seg: number; t: number } | null)[] = [];
  private prevDice = "";
  private diceAnim: { start: number; from: [Euler, Euler]; to: [Euler, Euler] } | null = null;
  private housePops: { g: Group; born: number }[] = [];
  private lastFrame = 0;
  private reduceMotion = false;
  private houseGroups: (Group | null)[] = new Array(BOARD_SIZE).fill(null);
  private houseCount: number[] = new Array(BOARD_SIZE).fill(-1);
  private ownerStuds: (Mesh | null)[] = new Array(BOARD_SIZE).fill(null);
  private dice: Mesh[] = [];
  private baseMat?: MeshStandardMaterial;
  // Shared building materials (CC0 photo facades + structural). Created once per
  // scene; reused across every tower so disposal only ever frees geometry.
  private matOffice!: MeshPhysicalMaterial;
  private matGlass!: MeshPhysicalMaterial;
  private matConcrete = new MeshStandardMaterial({ color: new Color("#9a958c"), roughness: 0.85, metalness: 0.1 });
  private matSteel = new MeshStandardMaterial({ color: new Color("#8a8f96"), roughness: 0.4, metalness: 0.85 });
  private matCrown = new MeshPhysicalMaterial({ color: new Color("#ecca73"), metalness: 0.9, roughness: 0.16, clearcoat: 0.7 });

  constructor(canvas: HTMLCanvasElement, width: number) {
    this.maxAniso = 8; // per-device cap is applied automatically by the renderer
    this.reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.loadFacadeMaterials();
    // opaque felt background (post-processing doesn't carry CSS transparency)
    this.scene.background = new Color("#0e2c1c");

    // Business-Tour-style 3/4 view: a perspective camera elevated and pulled
    // toward the near (Старт) edge, so developed properties rise as a skyline.
    this.camera = new PerspectiveCamera(38, 1 / SCENE_RATIO, 0.1, 200);
    this.camera.position.set(0, H * 2.18, H * 2.66);
    this.camera.lookAt(0, -1.5, -0.6);

    this.scene.add(new AmbientLight(0xffffff, 0.32));
    this.scene.add(new HemisphereLight(0xfff3d8, 0x20180f, 0.45));
    const key = new DirectionalLight(0xfff1d4, 2.0);
    key.position.set(H * 0.7, H * 3, H * 1.4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0006;
    const sc = key.shadow.camera;
    sc.left = -H * 1.5; sc.right = H * 1.5; sc.top = H * 1.5; sc.bottom = -H * 1.5;
    sc.near = 1; sc.far = H * 6;
    this.scene.add(key);

    this.build();

    const params = defaultGfxParams();
    params.exposure = 1.08;
    // 1.35 sits just above the lit ivory tiles' HDR luminance (~1.3) — below it
    // the whole ring washes out. Windows at emissive 2.2 still burn through.
    params.bloom = { enabled: true, strength: 0.06, radius: 0.45, threshold: 1.35 };
    params.ao = { enabled: true, radius: 0.6, intensity: 1.0 };
    this.core = new RenderCore({
      canvas,
      scene: this.scene,
      camera: this.camera,
      width,
      ratio: SCENE_RATIO,
      params,
      onFrame: () => this.frame(),
    });
  }

  /** Per-frame hook from RenderCore: token hops, dice tumble, house pop-ins. */
  private frame(): boolean {
    const now = performance.now();
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 50) : 16;
    this.lastFrame = now;
    let active = false;

    this.tokens.forEach((g, seat) => {
      const w = this.walks[seat];
      if (!w) {
        const target = this.tokenTarget[seat];
        if (target && g.position.distanceToSquared(target) > 1e-5) {
          g.position.lerp(target, 0.2);
          active = true;
        }
        return;
      }
      active = true;
      w.t += dt / HOP_MS;
      while (w.t >= 1 && w.seg < w.pts.length - 1) {
        w.seg += 1;
        w.t -= 1;
      }
      const to = w.pts[w.seg]!;
      const from = w.seg === 0 ? w.from : w.pts[w.seg - 1]!;
      if (w.seg >= w.pts.length - 1 && w.t >= 1) {
        g.position.copy(to);
        this.walks[seat] = null;
      } else {
        const tt = Math.min(w.t, 1);
        g.position.lerpVectors(from, to, easeInOut(tt));
        g.position.y = TOKEN_Y + Math.sin(Math.PI * tt) * HOP_H;
      }
    });

    if (this.diceAnim) {
      active = true;
      const t = (now - this.diceAnim.start) / DICE_MS;
      if (t >= 1) {
        this.dice.forEach((d, n) => d.rotation.copy(this.diceAnim!.to[n]!));
        this.diceAnim = null;
      } else {
        const spin = t < 0.7;
        this.dice.forEach((d, n) => {
          if (spin) {
            d.rotation.x += (0.5 + n * 0.12) * (dt / 16);
            d.rotation.y += (0.62 - n * 0.1) * (dt / 16);
          } else {
            const k = 0.25;
            const to = this.diceAnim!.to[n]!;
            d.rotation.x += (to.x - d.rotation.x) * k;
            d.rotation.y += (to.y - d.rotation.y) * k;
            d.rotation.z += (to.z - d.rotation.z) * k;
          }
          d.position.y = 0.55 + Math.abs(Math.sin(t * Math.PI * 3)) * 0.5 * (1 - t);
        });
      }
    }

    if (this.housePops.length > 0) {
      active = true;
      this.housePops = this.housePops.filter((p) => {
        const t = (now - p.born) / POP_MS;
        if (t >= 1) {
          p.g.scale.setScalar(1);
          return false;
        }
        p.g.scale.setScalar(Math.max(0.01, easeOutBack(t)));
        return true;
      });
    }
    return active;
  }

  private aniso(tex: CanvasTexture): CanvasTexture {
    tex.anisotropy = this.maxAniso;
    return tex;
  }

  private build(): void {
    const outer = H + RING_DEPTH / 2;
    const railW = 1.7;
    const railH = 1.15;

    // base (felt) — sits under the whole board incl. rail; cloth-weave normal
    const clothN = this.aniso(clothNormal());
    clothN.repeat.set(46, 46);
    this.baseMat = new MeshStandardMaterial({
      color: new Color("#1a5a36"),
      roughness: 0.96,
      metalness: 0,
      normalMap: clothN,
      normalScale: new Vector2(0.45, 0.45),
    });
    const base = new Mesh(new BoxGeometry(2 * (outer + railW) + 0.6, 1, 2 * (outer + railW) + 0.6), this.baseMat);
    base.position.y = -0.5;
    base.receiveShadow = true;
    this.scene.add(base);

    // walnut rail frame around the ring
    const woodTex = this.aniso(woodTexture());
    woodTex.repeat.set(7, 1);
    const woodN = this.aniso(woodNormal());
    woodN.repeat.set(7, 1);
    const woodMat = new MeshStandardMaterial({
      map: woodTex,
      roughness: 0.5,
      metalness: 0.08,
      normalMap: woodN,
      normalScale: new Vector2(0.6, 0.6),
    });
    const e = outer + railW / 2;
    const len = 2 * e + railW;
    const beams: [number, number, number, number][] = [
      [0, e, len, railW],
      [0, -e, len, railW],
      [e, 0, railW, 2 * e],
      [-e, 0, railW, 2 * e],
    ];
    for (const [bx, bz, bw, bd] of beams) {
      const beam = new Mesh(new BoxGeometry(bw, railH, bd), woodMat);
      beam.position.set(bx, railH / 2 - 0.05, bz);
      beam.castShadow = true;
      beam.receiveShadow = true;
      this.scene.add(beam);
    }

    // centre plaque
    const plaque = new Mesh(
      new PlaneGeometry((2 * H - RING_DEPTH) * 0.64, (2 * H - RING_DEPTH) * 0.64),
      new MeshStandardMaterial({ map: this.aniso(plaqueTexture()), roughness: 0.7 }),
    );
    plaque.rotation.x = -Math.PI / 2;
    plaque.position.y = 0.06;
    plaque.receiveShadow = true;
    this.scene.add(plaque);

    const paperN = this.aniso(paperNormal());
    paperN.repeat.set(2, 2);
    const tileMat = new MeshStandardMaterial({
      color: new Color("#efe6d2"),
      roughness: 0.78,
      metalness: 0.02,
      normalMap: paperN,
      normalScale: new Vector2(0.12, 0.12),
    });

    this.place.forEach((p, i) => {
      const tl = BOARD[i]!;
      const sz = p.corner ? RING_DEPTH : T;
      const along = p.side % 2 === 0 ? sz : RING_DEPTH;
      const deep = p.side % 2 === 0 ? RING_DEPTH : sz;

      const tile = new Mesh(new BoxGeometry(along * 0.97, 0.5, deep * 0.97), tileMat);
      tile.position.set(p.x, 0.25, p.z);
      tile.castShadow = true;
      tile.receiveShadow = true;
      this.scene.add(tile);

      // label on top
      const label = new Mesh(
        new PlaneGeometry(along * 0.94, deep * 0.94),
        new MeshStandardMaterial({ map: this.aniso(labelTexture(i, p.side)), roughness: 0.85, transparent: true }),
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(p.x, 0.505, p.z);
      this.scene.add(label);

      // raised group-colour rib along the inner edge of property tiles — the
      // recognisable Monopoly colour strip, given real depth for the 3/4 view.
      if (tl.type === "prop") {
        const inX = p.side === 3 ? -1 : p.side === 1 ? 1 : 0;
        const inZ = p.side === 0 ? -1 : p.side === 2 ? 1 : 0;
        const ribT = 0.5; // radial thickness
        const rw = p.side % 2 === 0 ? along * 0.97 : ribT;
        const rd = p.side % 2 === 0 ? ribT : along * 0.97;
        const rib = new Mesh(
          new BoxGeometry(rw, 0.24, rd),
          new MeshStandardMaterial({ color: new Color(GROUP_COLORS[tl.group] ?? "#999"), roughness: 0.38, metalness: 0.12 }),
        );
        const off = deep / 2 - ribT / 2;
        rib.position.set(p.x + inX * off, 0.6, p.z + inZ * off);
        rib.castShadow = true;
        rib.receiveShadow = true;
        this.scene.add(rib);
      } else {
        // special-tile colour cap
        const cap = new Mesh(
          new BoxGeometry(along * 0.4, 0.14, deep * 0.4),
          new MeshStandardMaterial({ color: new Color(specialColor(tl.type)), roughness: 0.5 }),
        );
        cap.position.set(p.x, 0.57, p.z);
        cap.castShadow = true;
        this.scene.add(cap);
      }
    });
  }

  private tokenPos(idx: number, seat: number, seats: number): Vector3 {
    const p = this.place[idx]!;
    const ang = (seat / Math.max(seats, 1)) * Math.PI * 2;
    const r = T * 0.3;
    return new Vector3(p.x + Math.cos(ang) * r, 0.5, p.z + Math.sin(ang) * r);
  }

  setState(state: MagnatState): void {
    const seats = state.seats;
    while (this.tokens.length < seats) {
      const seat = this.tokens.length;
      const color = new Color(PLAYER_COLORS[seat % PLAYER_COLORS.length]);
      const pawn = new Mesh(
        this.pawnGeo,
        new MeshStandardMaterial({ color, roughness: 0.22, metalness: 0.9 }),
      );
      pawn.castShadow = true;
      pawn.scale.setScalar(0.9);
      const g = new Group();
      g.add(pawn);
      this.scene.add(g);
      this.tokens.push(g);
      this.tokenTarget.push(new Vector3());
      this.walks.push(null);
    }

    this.tokens.forEach((g, seat) => {
      g.visible = seat < seats;
      if (seat >= seats) return;
      const pos = state.pos[seat]!;
      const target = this.tokenPos(pos, seat, seats);
      this.tokenTarget[seat] = target;
      g.scale.setScalar(state.bankrupt[seat] ? 0.45 : 1);
      const mat = (g.children[0] as Mesh).material as MeshStandardMaterial;
      const active = seat === state.turn && !state.done;
      mat.emissive.set(active ? (PLAYER_COLORS[seat % PLAYER_COLORS.length] as string) : "#000000");
      mat.emissiveIntensity = active ? 0.4 : 0;

      const prev = this.prevPos[seat];
      if (prev === undefined || g.position.lengthSq() === 0 || this.reduceMotion) {
        g.position.copy(target); // first placement / reduced-motion → snap
        this.walks[seat] = null;
      } else if (prev !== pos) {
        // walk tile-by-tile from the current tile to the new one
        const pts = ringPath(prev, pos).map((idx) => this.tokenPos(idx, seat, seats));
        this.walks[seat] = { pts, from: g.position.clone(), seg: 0, t: 0 };
      }
      this.prevPos[seat] = pos;
    });

    for (let i = 0; i < BOARD_SIZE; i++) {
      const owner = state.owner[i]!;
      const p = this.place[i]!;
      if (owner >= 0 && !this.ownerStuds[i]) {
        const stud = new Mesh(
          new BoxGeometry(0.5, 0.22, 0.5),
          new MeshStandardMaterial({ color: new Color(PLAYER_COLORS[owner % PLAYER_COLORS.length]), roughness: 0.4, metalness: 0.3 }),
        );
        stud.castShadow = true;
        this.scene.add(stud);
        this.ownerStuds[i] = stud;
      }
      const stud = this.ownerStuds[i];
      if (stud) {
        stud.visible = owner >= 0;
        if (owner >= 0) {
          (stud.material as MeshStandardMaterial).color = new Color(
            state.mortgaged[i] ? "#666" : PLAYER_COLORS[owner % PLAYER_COLORS.length],
          );
          // park the ownership stud at the inner corner of the tile
          const inX = p.side === 3 ? -1 : p.side === 1 ? 1 : 0;
          const inZ = p.side === 0 ? -1 : p.side === 2 ? 1 : 0;
          stud.position.set(p.x + inX * T * 0.32, 0.62, p.z + inZ * T * 0.32);
        }
      }
      this.syncHouses(i, state.houses[i]!);
    }

    this.syncDice(state.dice);
    this.core.invalidate();
  }

  /** Spin both dice and settle them on the rolled values. */
  private rollDice(values: [number, number]): void {
    const to: [Euler, Euler] = [faceUp(values[0]), faceUp(values[1])];
    if (this.reduceMotion || this.dice.length < 2) {
      this.dice.forEach((d, n) => d.rotation.copy(to[n]!));
      this.diceAnim = null;
      return;
    }
    this.diceAnim = {
      start: performance.now(),
      from: [this.dice[0]!.rotation.clone(), this.dice[1]!.rotation.clone()],
      to,
    };
  }

  /**
   * Load the CC0 photo facade sets (ambientCG, public-domain) into two shared
   * physical materials: a modern concrete/glass office and a glass skyscraper
   * with an emission map so its windows glow. Textures stream in (same-origin
   * static assets) and a render is requested as each arrives.
   */
  private loadFacadeMaterials(): void {
    const base = `${import.meta.env.BASE_URL}textures/magnat/`;
    const loader = new TextureLoader();
    const tex = (file: string, srgb = false): Texture => {
      const t = loader.load(base + file, () => this.core?.invalidate());
      if (srgb) t.colorSpace = SRGBColorSpace;
      t.wrapS = t.wrapT = RepeatWrapping;
      t.anisotropy = this.maxAniso;
      return t;
    };
    this.matOffice = new MeshPhysicalMaterial({
      map: tex("office_color.jpg", true),
      normalMap: tex("office_normal.jpg"),
      roughnessMap: tex("office_rough.jpg"),
      color: new Color("#cfc9bd"),
      metalness: 0.15,
      roughness: 1,
      normalScale: new Vector2(0.8, 0.8),
      envMapIntensity: 1.0,
    });
    this.matGlass = new MeshPhysicalMaterial({
      map: tex("glass_color.jpg", true),
      normalMap: tex("glass_normal.jpg"),
      roughnessMap: tex("glass_rough.jpg"),
      emissiveMap: tex("glass_emission.jpg", true),
      emissive: new Color("#ffeccb"),
      // Above the 1.35 bloom threshold so lit windows glow softly at dusk
      // (2.2+ halos the whole ring — 40 towers bleed onto the tiles).
      emissiveIntensity: 1.9,
      color: new Color("#2b3440"),
      metalness: 0.9,
      roughness: 1,
      clearcoat: 0.5,
      clearcoatRoughness: 0.35,
      normalScale: new Vector2(0.7, 0.7),
      envMapIntensity: 1.3,
    });
  }

  /** A box whose UVs map the facade photo so one modelled floor covers one
   *  photo floor. Each facade photo holds a different number of floors/window
   *  columns, so the caller passes the fractional repeats directly. */
  private facadeBox(w: number, h: number, d: number, repX: number, repY: number): BoxGeometry {
    const geo = new BoxGeometry(w, h, d);
    const uv = geo.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * repX, uv.getY(i) * repY);
    uv.needsUpdate = true;
    return geo;
  }

  /**
   * A realistic high-rise for a developed property: a concrete podium, one or
   * two photo-textured glazed shafts (taller ones step back for a real skyline
   * silhouette) with parapets, a rooftop plant + antenna on tall towers, and a
   * gold landmark crown for hotels. Height grows with the development level.
   */
  private buildTower(count: number, hotel: boolean): Group {
    const g = new Group();
    // Tempered skyline: tall enough to read as development, short enough that
    // the near edge never walls off the board (was 5·7·9·11·13 at 0.34/floor).
    const floors = hotel ? 10 : 2 + count * 2; // 4 · 6 · 8 · 10 · (hotel 10)
    const floorH = 0.3;
    const w = hotel ? 1.16 : 0.98;
    const d = hotel ? 1.16 : 0.92;
    const glassy = hotel || count >= 2;
    const facade = glassy ? this.matGlass : this.matOffice;
    // Floors/window-columns held by one texture tile: the office photo shows
    // ~6.5 floors × 7 columns, the glass high-rise photo ~40 floors × 26
    // columns. Mapping modelled floors onto photo floors keeps windows at real
    // scale — integer per-2-floor repeats turned the glass into micro-stripes.
    const texFloors = glassy ? 40 : 6.5;
    const texCols = glassy ? 26 : 7;

    // podium / lobby
    const podH = 0.4;
    const podium = new Mesh(new BoxGeometry(w * 1.08, podH, d * 1.08), this.matConcrete);
    podium.position.y = podH / 2;
    podium.castShadow = podium.receiveShadow = true;
    g.add(podium);

    const stepped = hotel || count >= 3;
    const lowerFloors = stepped ? Math.ceil(floors * 0.62) : floors;
    const upperFloors = floors - lowerFloors;

    const shaft = (fl: number, ww: number, dd: number, y0: number): number => {
      const h = fl * floorH;
      const cols = Math.max(3, Math.round(ww * 7)); // ~7 window columns per unit width
      const box = new Mesh(this.facadeBox(ww, h, dd, cols / texCols, fl / texFloors), facade);
      box.position.y = y0 + h / 2;
      box.castShadow = box.receiveShadow = true;
      g.add(box);
      const cap = new Mesh(new BoxGeometry(ww * 1.05, 0.12, dd * 1.05), this.matConcrete);
      cap.position.y = y0 + h + 0.06;
      cap.castShadow = true;
      g.add(cap);
      return y0 + h + 0.12;
    };

    let y = podH;
    y = shaft(lowerFloors, w, d, y);
    if (upperFloors > 0) y = shaft(upperFloors, w * 0.72, d * 0.72, y);

    // rooftop plant + antenna on taller towers
    if (floors >= 7 || hotel) {
      const mech = new Mesh(new BoxGeometry(w * 0.36, 0.26, d * 0.36), this.matConcrete);
      mech.position.set(-w * 0.16, y + 0.13, -d * 0.1);
      mech.castShadow = true;
      g.add(mech);
      const antenna = new Mesh(new BoxGeometry(0.05, hotel ? 1.1 : 0.7, 0.05), this.matSteel);
      antenna.position.set(w * 0.16, y + (hotel ? 0.55 : 0.35), d * 0.1);
      antenna.castShadow = true;
      g.add(antenna);
    }
    // hotel landmark crown
    if (hotel) {
      const crown = new Mesh(new ConeGeometry(w * 0.4, 0.8, 4), this.matCrown);
      crown.rotation.y = Math.PI / 4;
      crown.position.y = y + 0.4;
      crown.castShadow = true;
      g.add(crown);
    }
    return g;
  }

  private syncHouses(i: number, count: number): void {
    if (this.houseCount[i] === count) return; // only rebuild when it changed
    this.houseCount[i] = count;
    if (this.houseGroups[i]) {
      // free only the old buildings' geometry — facade/structural materials are
      // shared across every tower and live for the scene's lifetime.
      disposeGeoms(this.houseGroups[i]!);
      this.scene.remove(this.houseGroups[i]!);
      this.houseGroups[i] = null;
    }
    if (count <= 0) return;
    const p = this.place[i]!;
    const hotel = count >= 5;
    const g = this.buildTower(count, hotel);

    // seat the tower toward the inner edge so the tile's name/price stays visible
    const inX = p.side === 3 ? -1 : p.side === 1 ? 1 : 0;
    const inZ = p.side === 0 ? -1 : p.side === 2 ? 1 : 0;
    g.position.set(p.x + inX * 0.45, 0.5, p.z + inZ * 0.45);
    this.scene.add(g);
    this.houseGroups[i] = g;
    if (!this.reduceMotion) {
      g.scale.setScalar(0.01); // pop in
      this.housePops.push({ g, born: performance.now() });
    }
  }

  private syncDice(dice: [number, number] | null): void {
    if (!dice) {
      this.dice.forEach((d) => (d.visible = false));
      this.prevDice = "";
      this.diceAnim = null;
      return;
    }
    if (this.dice.length === 0) {
      const faces = pipFaces();
      const order = [0, 5, 1, 4, 2, 3]; // +X,-X,+Y,-Y,+Z,-Z → 1..6
      for (let n = 0; n < 2; n++) {
        const mats = order.map((f) => new MeshStandardMaterial({ map: faces[f], roughness: 0.45, metalness: 0.05 }));
        const die = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), mats);
        die.position.set(n === 0 ? -1.5 : 1.5, 0.55, 2.6);
        die.castShadow = true;
        this.scene.add(die);
        this.dice.push(die);
      }
    }
    this.dice.forEach((d) => (d.visible = true));
    const key = dice.join(",");
    if (key !== this.prevDice) {
      this.prevDice = key;
      this.rollDice(dice);
    }
  }

  /** Apply an equipped board-felt cosmetic (ESTATE) — recolours base + bg. */
  setFelt(a: string, b: string): void {
    this.scene.background = new Color(b);
    if (this.baseMat) this.baseMat.color = new Color(a);
    this.core.invalidate();
  }

  resize(width: number): void {
    this.core.setSize(width);
  }

  destroy(): void {
    // RenderCore frees the renderer, env map and post pipeline; we free the
    // scene graph (geometries, materials, ~50 CanvasTextures) + pawn geometry.
    this.core.dispose();
    disposeObject(this.scene);
    this.pawnGeo.dispose();
    // shared building materials aren't always attached to the live scene graph
    for (const m of [this.matOffice, this.matGlass, this.matConcrete, this.matSteel, this.matCrown]) {
      for (const v of Object.values(m ?? {})) if (v && (v as Texture).isTexture) (v as Texture).dispose();
      m?.dispose();
    }
  }
}
