/**
 * WebGL cue-table renderer (PixiJS v8). Draws the felt, rails, pockets and
 * spherically-shaded balls onto a GPU canvas. This is the rendering half of the
 * hybrid cue scene — the React layer (CueTableGL) owns the DOM controls/HUD on
 * top, while this owns the pixels.
 *
 * Visual technique: rather than lean on (CPU-bound) SVG filters, every soft
 * effect is baked once into a small canvas-generated texture and reused —
 *   • a single grayscale "sphere" texture, tinted per ball → true 3D shading
 *   • a blurred shadow blob under each ball
 *   • a radial felt texture (cloth-coloured, vignetted, lightly noised)
 *   • a radial pocket texture (depth + brass rim)
 * so the per-frame cost is just transforms on ~16 sprites.
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { TABLE, type CueVariant } from "@aso/shared";

export interface SceneBall {
  id: number;
  x: number;
  y: number;
}
export interface CueScene {
  variant: CueVariant;
  cloth: { a: string; b: string };
  balls: SceneBall[];
  /** Aim ray from the cue ball, in world coords. */
  aim?: { x0: number; y0: number; x1: number; y1: number } | null;
  /** Translucent ball-in-hand preview. */
  ghost?: { x: number; y: number } | null;
}

const RAIL = 0.085; // rail thickness as a fraction of felt height (= world unit)
const POCKETS: [number, number][] = [
  [0, 0],
  [TABLE.w / 2, 0],
  [TABLE.w, 0],
  [0, TABLE.h],
  [TABLE.w / 2, TABLE.h],
  [TABLE.w, TABLE.h],
];

const POOL_HUES = ["#e8b923", "#1f4fb0", "#c0241f", "#5a2a7a", "#e07a1f", "#1f8a3a", "#7a1f2a"];
const SNOOKER_HUES: Record<number, string> = {
  2: "#e8c531",
  3: "#1f8a3a",
  4: "#7a4a25",
  5: "#1f5fb0",
  6: "#e87fa0",
  7: "#15171a",
};
const hex = (s: string): number => parseInt(s.replace("#", ""), 16);

function ballColor(id: number, variant: CueVariant): string {
  if (id === 0) return "#f7f4ea";
  if (variant === "SNOOKER") {
    if (id >= 11 && id <= 25) return "#c0241f";
    return SNOOKER_HUES[id] ?? "#cccccc";
  }
  if (id === 8) return "#15171a";
  const hue = id <= 7 ? id : id - 8;
  return POOL_HUES[hue - 1] ?? "#cccccc";
}
const isStripe = (id: number, v: CueVariant): boolean => v !== "SNOOKER" && id >= 9 && id <= 15;

/* ── canvas-baked textures (created once, cached) ───────────────────────── */

function makeCanvas(size: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return { c, ctx: c.getContext("2d")! };
}

let _sphere: Texture | null = null;
function sphereTexture(): Texture {
  if (_sphere) return _sphere;
  const S = 256;
  const { c, ctx } = makeCanvas(S);
  const g = ctx.createRadialGradient(S * 0.36, S * 0.32, S * 0.02, S * 0.5, S * 0.5, S * 0.52);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.16, "#f2f2f2");
  g.addColorStop(0.55, "#bdbdbd");
  g.addColorStop(0.86, "#7c7c7c");
  g.addColorStop(1, "#3f3f3f");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  // contact-shadow ring at the very rim for roundness
  ctx.globalCompositeOperation = "multiply";
  const rim = ctx.createRadialGradient(S * 0.5, S * 0.5, S * 0.34, S * 0.5, S * 0.5, S * 0.5);
  rim.addColorStop(0, "rgba(255,255,255,1)");
  rim.addColorStop(1, "rgba(120,120,120,1)");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  _sphere = Texture.from(c);
  return _sphere;
}

let _spec: Texture | null = null;
function specTexture(): Texture {
  if (_spec) return _spec;
  const S = 128;
  const { c, ctx } = makeCanvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _spec = Texture.from(c);
  return _spec;
}

let _shadow: Texture | null = null;
function shadowTexture(): Texture {
  if (_shadow) return _shadow;
  const S = 256;
  const { c, ctx } = makeCanvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.6, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _shadow = Texture.from(c);
  return _shadow;
}

let _pocket: Texture | null = null;
function pocketTexture(): Texture {
  if (_pocket) return _pocket;
  const S = 256;
  const { c, ctx } = makeCanvas(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,1)");
  g.addColorStop(0.62, "rgba(0,0,0,1)");
  g.addColorStop(0.74, "rgba(40,28,12,0.9)");
  g.addColorStop(0.82, "rgba(150,110,55,0.85)"); // brass rim
  g.addColorStop(0.9, "rgba(60,42,18,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _pocket = Texture.from(c);
  return _pocket;
}

const _felt = new Map<string, Texture>();
const FELT_CACHE_MAX = 12; // bound growth across many equipped cloth cosmetics
function feltTexture(a: string, b: string): Texture {
  const key = `${a}|${b}`;
  const cached = _felt.get(key);
  if (cached) return cached;
  if (_felt.size >= FELT_CACHE_MAX) {
    const oldest = _felt.keys().next().value;
    if (oldest !== undefined) {
      _felt.get(oldest)?.destroy(true);
      _felt.delete(oldest);
    }
  }
  const W = 1024;
  const H = 512;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(W * 0.42, H * 0.36, H * 0.1, W * 0.5, H * 0.5, W * 0.62);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // faint cloth grain
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = i % 2 ? "#ffffff" : "#000000";
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }
  ctx.globalAlpha = 1;
  // edge vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.6);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  const tex = Texture.from(c);
  _felt.set(key, tex);
  return tex;
}

/* ── renderer ───────────────────────────────────────────────────────────── */

export class GLTable {
  private app: Application;
  private fh = 200; // felt height in px (= world unit)
  private clothKey = "";

  private bg = new Container(); // rails + felt + pockets + lines (static)
  private aimLayer = new Graphics();
  private ballLayer = new Container();
  private fxLayer = new Container();
  private nodes = new Map<number, { node: Container; kind: string }>();
  private sinks: { node: Container; born: number; dur: number }[] = [];
  private fxRunning = false;

  private constructor(app: Application) {
    this.app = app;
    app.stage.addChild(this.bg, this.aimLayer, this.ballLayer, this.fxLayer);
  }

  static async create(canvas: HTMLCanvasElement, cssWidth: number): Promise<GLTable> {
    const app = new Application();
    const fh = cssWidth / (TABLE.w + 2 * RAIL); // px per world unit
    await app.init({
      canvas,
      width: cssWidth,
      height: (TABLE.h + 2 * RAIL) * fh,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
      autoDensity: true,
      autoStart: false, // render on demand (render()/sink ticker) — no idle GPU
    });
    const t = new GLTable(app);
    t.fh = fh;
    return t;
  }

  get canvasHeight(): number {
    return (TABLE.h + 2 * RAIL) * this.fh;
  }

  resize(cssWidth: number): void {
    this.fh = cssWidth / (TABLE.w + 2 * RAIL);
    this.app.renderer.resize(cssWidth, this.canvasHeight);
    this.clothKey = ""; // force static rebuild at the new scale
  }

  /** World (felt) coords → canvas pixels. */
  private px(x: number): number {
    return (RAIL + x) * this.fh;
  }
  private py(y: number): number {
    return (RAIL + y) * this.fh;
  }
  /** Canvas CSS pixels → world coords (for pointer hit-testing). */
  toWorld(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } {
    const fhCss = rect.width / (TABLE.w + 2 * RAIL);
    return {
      x: (clientX - rect.left) / fhCss - RAIL,
      y: (clientY - rect.top) / fhCss - RAIL,
    };
  }

  private buildStatic(scene: CueScene): void {
    const key = `${scene.cloth.a}|${scene.cloth.b}|${scene.variant}|${this.fh}`;
    if (key === this.clothKey) return;
    this.clothKey = key;
    this.bg.removeChildren();
    const fh = this.fh;
    const w = this.px(TABLE.w) + RAIL * fh;
    const h = this.py(TABLE.h) + RAIL * fh;

    // wooden rail frame
    const rail = new Graphics();
    rail.roundRect(0, 0, w, h, RAIL * fh * 0.7).fill(0x3a2414);
    rail.roundRect(RAIL * fh * 0.18, RAIL * fh * 0.18, w - RAIL * fh * 0.36, h - RAIL * fh * 0.36, RAIL * fh * 0.5).fill(0x53381f);
    this.bg.addChild(rail);

    // felt
    const felt = new Sprite(feltTexture(scene.cloth.a, scene.cloth.b));
    felt.position.set(this.px(0), this.py(0));
    felt.width = TABLE.w * fh;
    felt.height = TABLE.h * fh;
    this.bg.addChild(felt);

    // cushion bevel (subtle inner light edge)
    const bevel = new Graphics();
    bevel
      .rect(this.px(0), this.py(0), TABLE.w * fh, TABLE.h * fh)
      .stroke({ width: Math.max(2, fh * 0.02), color: 0x000000, alpha: 0.35, alignment: 1 });
    this.bg.addChild(bevel);

    // snooker baulk line + D
    if (scene.variant === "SNOOKER") {
      const lines = new Graphics();
      const bx = this.px(0.42);
      lines.moveTo(bx, this.py(0)).lineTo(bx, this.py(TABLE.h)).stroke({ width: Math.max(1, fh * 0.006), color: 0xffffff, alpha: 0.22 });
      lines
        .arc(bx, this.py(TABLE.h / 2), 0.18 * fh, Math.PI / 2, -Math.PI / 2, true)
        .stroke({ width: Math.max(1, fh * 0.006), color: 0xffffff, alpha: 0.22 });
      this.bg.addChild(lines);
    }

    // pockets
    for (const [px, py] of POCKETS) {
      const p = new Sprite(pocketTexture());
      p.anchor.set(0.5);
      const d = TABLE.pocketR * 2.6 * fh;
      p.width = p.height = d;
      p.position.set(this.px(px), this.py(py));
      this.bg.addChild(p);
    }
  }

  private ballKind(id: number, variant: CueVariant): string {
    if (id === 0) return "cue";
    if (variant === "SNOOKER") return `snk-${ballColor(id, variant)}`;
    if (id === 8) return "eight";
    return `${isStripe(id, variant) ? "stripe" : "solid"}-${id}`;
  }

  private buildBall(id: number, variant: CueVariant): Container {
    const fh = this.fh;
    const r = TABLE.ballR * fh;
    const node = new Container();

    const shadow = new Sprite(shadowTexture());
    shadow.anchor.set(0.5);
    shadow.width = shadow.height = r * 3.1;
    shadow.position.set(r * 0.28, r * 0.42);
    node.addChild(shadow);

    const stripe = isStripe(id, variant);
    const colorHex = hex(ballColor(id, variant));

    const sphere = new Sprite(sphereTexture());
    sphere.anchor.set(0.5);
    sphere.width = sphere.height = r * 2;
    sphere.tint = stripe ? 0xffffff : colorHex;
    node.addChild(sphere);

    // stripe band: a coloured belt masked to the ball
    if (stripe) {
      const band = new Sprite(sphereTexture());
      band.anchor.set(0.5);
      band.width = r * 2;
      band.height = r * 0.95;
      band.tint = colorHex;
      const mask = new Graphics().circle(0, 0, r).fill(0xffffff);
      node.addChild(mask, band);
      band.mask = mask;
    }

    // number disc (pool only)
    if (variant !== "SNOOKER" && id !== 0) {
      const disc = new Graphics().circle(0, 0, r * 0.46).fill(0xfffdf6);
      const num = new Text({
        text: String(id),
        style: { fontFamily: "Manrope, sans-serif", fontSize: r * 0.62, fontWeight: "700", fill: 0x15171a },
      });
      num.anchor.set(0.5);
      node.addChild(disc, num);
    }

    // specular highlight (untinted, top-left)
    const spec = new Sprite(specTexture());
    spec.anchor.set(0.5);
    spec.width = spec.height = r * 1.05;
    spec.position.set(-r * 0.32, -r * 0.36);
    node.addChild(spec);

    return node;
  }

  private renderBalls(scene: CueScene): void {
    const present = new Set<number>();
    for (const b of scene.balls) {
      present.add(b.id);
      const kind = this.ballKind(b.id, scene.variant);
      let entry = this.nodes.get(b.id);
      if (!entry || entry.kind !== kind) {
        if (entry) entry.node.destroy({ children: true });
        const node = this.buildBall(b.id, scene.variant);
        this.ballLayer.addChild(node);
        entry = { node, kind };
        this.nodes.set(b.id, entry);
      }
      entry.node.visible = true;
      entry.node.position.set(this.px(b.x), this.py(b.y));
    }
    for (const [id, entry] of this.nodes) {
      if (!present.has(id)) entry.node.visible = false;
    }
  }

  /**
   * Render a frozen pocket-drop pose (no ticker) — a posed still of balls part
   * way into the pockets. Used by the visual demo/screenshot harness.
   */
  poseDrop(items: { x: number; y: number; color: string; progress: number }[]): void {
    this.fxLayer.removeChildren();
    for (const it of items) {
      const node = this.buildSinkBall(it.color);
      node.position.set(this.px(it.x), this.py(it.y));
      const e = 1 - Math.max(0, Math.min(1, it.progress));
      node.scale.set(0.06 + e * 0.94);
      node.alpha = e;
      this.fxLayer.addChild(node);
    }
    this.app.render();
  }

  private buildSinkBall(color: string): Container {
    const r = TABLE.ballR * this.fh;
    const node = new Container();
    const sphere = new Sprite(sphereTexture());
    sphere.anchor.set(0.5);
    sphere.width = sphere.height = r * 2;
    sphere.tint = hex(color);
    const spec = new Sprite(specTexture());
    spec.anchor.set(0.5);
    spec.width = spec.height = r * 1.05;
    spec.position.set(-r * 0.32, -r * 0.36);
    node.addChild(sphere, spec);
    return node;
  }

  /**
   * Drop a potted ball into a pocket: a short shrink-and-fade at (x, y), driven
   * by the renderer's own ticker so it completes smoothly even after React has
   * handed back to the resting state. Honours prefers-reduced-motion.
   */
  addSink(x: number, y: number, color: string): void {
    const node = this.buildSinkBall(color);
    node.position.set(this.px(x), this.py(y));
    this.fxLayer.addChild(node);
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.sinks.push({ node, born: performance.now(), dur: reduce ? 1 : 340 });
    if (!this.fxRunning) {
      this.app.ticker.add(this.tickFx);
      this.app.ticker.start();
      this.fxRunning = true;
    }
  }

  private tickFx = (): void => {
    const now = performance.now();
    this.sinks = this.sinks.filter((s) => {
      const t = (now - s.born) / s.dur;
      if (t >= 1) {
        s.node.destroy({ children: true });
        return false;
      }
      const e = 1 - t; // 1 → 0
      s.node.scale.set(0.06 + e * 0.94);
      s.node.alpha = e;
      return true;
    });
    this.app.render();
    if (this.sinks.length === 0) {
      this.app.ticker.remove(this.tickFx);
      this.app.ticker.stop();
      this.fxRunning = false;
    }
  };

  render(scene: CueScene): void {
    this.buildStatic(scene);

    // aim ray (dashed) + ghost
    this.aimLayer.clear();
    if (scene.aim) {
      const { x0, y0, x1, y1 } = scene.aim;
      const dx = this.px(x1) - this.px(x0);
      const dy = this.py(y1) - this.py(y0);
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const dash = this.fh * 0.025;
      for (let d = this.fh * TABLE.ballR; d < len; d += dash * 2) {
        const sx = this.px(x0) + ux * d;
        const sy = this.py(y0) + uy * d;
        this.aimLayer.moveTo(sx, sy).lineTo(sx + ux * dash, sy + uy * dash);
      }
      this.aimLayer.stroke({ width: Math.max(1, this.fh * 0.008), color: 0xffffff, alpha: 0.55 });
    }
    if (scene.ghost) {
      this.aimLayer.circle(this.px(scene.ghost.x), this.py(scene.ghost.y), TABLE.ballR * this.fh).fill({ color: 0xffffff, alpha: 0.4 });
    }

    this.renderBalls(scene);
    this.app.render();
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
    this.nodes.clear();
  }
}
