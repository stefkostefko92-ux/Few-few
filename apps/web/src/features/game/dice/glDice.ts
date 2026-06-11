/**
 * WebGL dice renderer (PixiJS v8) — 3D-shaded dice with a tumble-and-settle
 * roll. Same hybrid idea as the cue table: the canvas owns the pixels while the
 * DOM keeps the focusable hold buttons + labels (see GLDice.tsx).
 *
 * All shading is baked once into canvas textures (a bevelled ivory body, a
 * recessed pip, a soft shadow) and reused, so a tray of dice is a handful of
 * tinted sprites.
 */
import { Application, Container, Sprite, Texture } from "pixi.js";

const PIP_ON: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function makeCanvas(w: number, h: number): { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let _body: Texture | null = null;
function bodyTexture(): Texture {
  if (_body) return _body;
  const S = 256;
  const { c, ctx } = makeCanvas(S, S);
  const m = S * 0.06;
  const r = S * 0.2;
  // base gradient (top-lit ivory)
  const g = ctx.createLinearGradient(0, m, 0, S - m);
  g.addColorStop(0, "#fdfaf1");
  g.addColorStop(0.5, "#efe9d8");
  g.addColorStop(1, "#d6cdb8");
  roundRectPath(ctx, m, m, S - 2 * m, S - 2 * m, r);
  ctx.fillStyle = g;
  ctx.fill();
  // top-left sheen
  ctx.save();
  roundRectPath(ctx, m, m, S - 2 * m, S - 2 * m, r);
  ctx.clip();
  const sheen = ctx.createRadialGradient(S * 0.32, S * 0.28, S * 0.02, S * 0.32, S * 0.28, S * 0.55);
  sheen.addColorStop(0, "rgba(255,255,255,0.7)");
  sheen.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, S, S);
  // bottom inner shade for roundness
  const sh = ctx.createLinearGradient(0, S * 0.55, 0, S - m);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(60,52,36,0.28)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, S, S);
  ctx.restore();
  // rim
  roundRectPath(ctx, m, m, S - 2 * m, S - 2 * m, r);
  ctx.lineWidth = S * 0.012;
  ctx.strokeStyle = "rgba(120,104,72,0.45)";
  ctx.stroke();
  _body = Texture.from(c);
  return _body;
}

let _pip: Texture | null = null;
function pipTexture(): Texture {
  if (_pip) return _pip;
  const S = 64;
  const { c, ctx } = makeCanvas(S, S);
  // recessed pip: dark well + top inner shadow + tiny bottom highlight
  const g = ctx.createRadialGradient(S * 0.42, S * 0.38, 1, S * 0.5, S * 0.5, S * 0.5);
  g.addColorStop(0, "#3a3026");
  g.addColorStop(0.7, "#15110c");
  g.addColorStop(1, "#070503");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,250,230,0.18)";
  ctx.beginPath();
  ctx.arc(S * 0.6, S * 0.66, S * 0.12, 0, Math.PI * 2);
  ctx.fill();
  _pip = Texture.from(c);
  return _pip;
}

let _shadow: Texture | null = null;
function shadowTexture(): Texture {
  if (_shadow) return _shadow;
  const S = 128;
  const { c, ctx } = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.6, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _shadow = Texture.from(c);
  return _shadow;
}

interface DieNode {
  root: Container; // holds shadow + lift group
  lift: Container; // raised when held; carries body + pips, rotates/scales on roll
  shadow: Sprite;
  ring: Sprite | null;
  body: Sprite;
  pips: Sprite[]; // 9, toggled per face
  rolling: { start: number; dur: number; final: number; lastSwap: number } | null;
}

export class GLDice {
  private app: Application;
  private size = 64; // die edge px
  private gap = 0;
  private dice: DieNode[] = [];
  private running = false;

  private constructor(app: Application) {
    this.app = app;
  }

  static async create(canvas: HTMLCanvasElement, cssWidth: number, count: number): Promise<GLDice> {
    const app = new Application();
    const size = cssWidth / (1.22 * count + 0.22);
    await app.init({
      canvas,
      width: cssWidth,
      height: size * 1.62,
      antialias: true,
      backgroundAlpha: 0,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
      autoDensity: true,
      autoStart: false,
    });
    const d = new GLDice(app);
    d.size = size;
    d.gap = size * 0.22;
    for (let i = 0; i < count; i++) d.dice.push(d.build(i));
    return d;
  }

  get height(): number {
    return this.size * 1.62;
  }

  private cx(i: number): number {
    return this.gap + this.size / 2 + i * (this.size + this.gap);
  }
  private get cy(): number {
    return this.height * 0.56;
  }

  private build(i: number): DieNode {
    const D = this.size;
    const root = new Container();
    root.position.set(this.cx(i), this.cy);

    const shadow = new Sprite(shadowTexture());
    shadow.anchor.set(0.5);
    shadow.width = D * 1.5;
    shadow.height = D * 0.6;
    shadow.position.set(0, D * 0.62);
    root.addChild(shadow);

    const lift = new Container();
    root.addChild(lift);

    const body = new Sprite(bodyTexture());
    body.anchor.set(0.5);
    body.width = body.height = D;
    lift.addChild(body);

    const pips: Sprite[] = [];
    for (let p = 0; p < 9; p++) {
      const s = new Sprite(pipTexture());
      s.anchor.set(0.5);
      s.width = s.height = D * 0.17;
      const col = p % 3;
      const row = Math.floor(p / 3);
      s.position.set((col - 1) * D * 0.27, (row - 1) * D * 0.27);
      s.visible = false;
      lift.addChild(s);
      pips.push(s);
    }

    this.app.stage.addChild(root);
    return { root, lift, shadow, ring: null, body, pips, rolling: null };
  }

  private setFace(d: DieNode, value: number): void {
    const on = new Set(PIP_ON[value] ?? []);
    d.pips.forEach((p, idx) => (p.visible = on.has(idx)));
  }

  private setHeld(d: DieNode, held: boolean): void {
    const D = this.size;
    d.lift.y = held ? -D * 0.16 : 0;
    d.shadow.alpha = held ? 0.35 : 1;
    if (held && !d.ring) {
      const ring = new Sprite(bodyTexture());
      ring.anchor.set(0.5);
      ring.width = ring.height = D * 1.18;
      ring.tint = 0xd9b25f; // brass halo
      ring.alpha = 0.5;
      d.lift.addChildAt(ring, 0);
      d.ring = ring;
    } else if (!held && d.ring) {
      d.ring.destroy();
      d.ring = null;
    }
  }

  /** Static layout: place dice at `values`, apply held lift; skips rolling dice. */
  render(values: number[], held: boolean[]): void {
    this.dice.forEach((d, i) => {
      this.setHeld(d, held[i] ?? false);
      if (!d.rolling) {
        d.lift.rotation = 0;
        d.lift.scale.set(1);
        this.setFace(d, values[i] ?? 0);
      }
    });
    this.app.render();
  }

  /** Tumble the non-held dice and settle on `values`. */
  roll(values: number[], held: boolean[]): void {
    const now = performance.now();
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.dice.forEach((d, i) => {
      this.setHeld(d, held[i] ?? false);
      if (held[i]) {
        d.rolling = null;
        this.setFace(d, values[i] ?? 1);
        return;
      }
      if (reduce) {
        d.rolling = null;
        d.lift.rotation = 0;
        d.lift.scale.set(1);
        this.setFace(d, values[i] ?? 1);
        return;
      }
      d.rolling = { start: now, dur: 460 + Math.random() * 200, final: values[i] ?? 1, lastSwap: 0 };
    });
    if (!reduce && !this.running) {
      this.app.ticker.add(this.tick);
      this.app.ticker.start();
      this.running = true;
    }
    this.app.render();
  }

  private tick = (): void => {
    const now = performance.now();
    const D = this.size;
    let active = false;
    for (const d of this.dice) {
      if (!d.rolling) continue;
      const r = d.rolling;
      const t = (now - r.start) / r.dur;
      if (t >= 1) {
        d.lift.rotation = 0;
        d.lift.scale.set(1);
        d.lift.y = 0;
        this.setFace(d, r.final);
        d.rolling = null;
        continue;
      }
      active = true;
      const e = 1 - t;
      d.lift.rotation = e * Math.sin(t * 34) * 0.6;
      d.lift.scale.set(1 + e * 0.12 * Math.sin(t * 40));
      d.lift.y = -Math.sin(t * Math.PI) * D * 0.32 * e;
      if (t > 0.82) {
        this.setFace(d, r.final);
      } else if (now - r.lastSwap > 55) {
        this.setFace(d, 1 + Math.floor(Math.random() * 6));
        r.lastSwap = now;
      }
    }
    this.app.render();
    if (!active) {
      this.app.ticker.remove(this.tick);
      this.app.ticker.stop();
      this.running = false;
    }
  };

  /** Frozen pose for the visual demo/screenshots (no ticker). */
  poseDemo(items: { value: number; held?: boolean; rot?: number; lift?: number; scale?: number }[]): void {
    this.dice.forEach((d, i) => {
      const it = items[i];
      if (!it) return;
      this.setHeld(d, it.held ?? false);
      d.lift.rotation = it.rot ?? 0;
      d.lift.scale.set(it.scale ?? 1);
      d.lift.y = (it.held ? -this.size * 0.16 : 0) + (it.lift ?? 0);
      this.setFace(d, it.value);
    });
    this.app.render();
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
    this.dice = [];
  }
}
