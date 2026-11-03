// Бодът на сайта за клипа: същите схеми (stitch.ts) и същата нишка (paintLeg от
// stitch-dom.ts), но на часовника на филма — всеки кадър рисува „ушитото до момент p“,
// вместо да шие в реално време. render.mjs го пакетира с esbuild като window.QB.
import { borderTile, hash2, nearestSkein, noise1, outlinePath, rosette, stitchChance, THREAD } from "../src/lib/stitch";
import { paintLeg } from "../src/lib/stitch-dom";

type RGB = [number, number, number];
/** Един кръстат бод: двата крака (цветове a и b), кога се шие (order 0…1) и трептенето им. */
export type Stitch = { x: number; y: number; a: string; b: string; order: number; j1: number; j2: number };

const finish = (list: Stitch[]): Stitch[] => {
  const lo = Math.min(...list.map((s) => s.order)), hi = Math.max(...list.map((s) => s.order));
  for (const s of list) s.order = hi > lo ? (s.order - lo) / (hi - lo) : 0;
  return list.sort((p, q) => p.order - q.order);
};
const jit = (x: number, y: number, k: number) => (hash2(x, y, k) - 0.5) * 0.9;

/** Ушитото до p (0…1): първите крака, после вторите, `lag` по-късно — както работи ръката. */
export function paint(ctx: CanvasRenderingContext2D, list: Stitch[], s: number, p: number, lag = 0.06): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (p <= 0) return;
  const u = Math.max(0, Math.min(1, p)) * (1 + lag); // при p = 1 са ушити и последните втори крака
  for (const st of list) { if (st.order > u) break; paintLeg(ctx, st.x, st.y, s, st.a, false, st.j1); }
  for (const st of list) { if (st.order > u - lag) break; paintLeg(ctx, st.x, st.y, s, st.b, true, st.j2); }
}

/** Розетката от Дивотино, шита от средата навън. */
export function rosetteStitches(s: number) {
  const m = rosette(), pad = s * 0.6;
  const cx = (m.w - 1) / 2, cy = (m.h - 1) / 2, R = Math.hypot(cx, cy);
  const list = finish(m.cells.map((c) => ({
    x: pad + c.x * s, y: pad + c.y * s, a: c.c, b: c.c,
    order: (Math.hypot(c.x - cx, c.y - cy) / R) * 0.88 + hash2(c.x, c.y, 7) * 0.12, j1: jit(c.x, c.y, 23), j2: jit(c.x, c.y, 19),
  })));
  return { list, w: m.w * s + 2 * pad, h: m.h * s + 2 * pad, pad, outline: outlinePath(m.cells, s), colour: m.outline ?? THREAD.black };
}

const lengths = new Map<string, number>();
const pathLength = (d: string) => {
  let L = lengths.get(d);
  if (L === undefined) {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    L = p.getTotalLength();
    lengths.set(d, L);
  }
  return L;
};

/** Контурът (заден бод) като в Stitch.tsx, изтеглен до q (0…1). */
export function contour(ctx: CanvasRenderingContext2D, d: string, s: number, pad: number, colour: string, q: number): void {
  if (q <= 0) return;
  const path = new Path2D(d), L = pathLength(d), w = Math.max(1, s * 0.2);
  ctx.save();
  ctx.translate(pad, pad);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.setLineDash([L * Math.min(1, q), L + 1]);
  const stroke = (dx: number, dy: number, style: string, lw: number) => {
    ctx.save(); ctx.translate(dx, dy); ctx.strokeStyle = style; ctx.lineWidth = lw; ctx.stroke(path); ctx.restore();
  };
  stroke(s * 0.04, s * 0.06, "rgba(40,20,10,.25)", w * 1.15);
  stroke(0, 0, colour, w);
  stroke(-s * 0.03, -s * 0.03, "rgba(255,255,255,.18)", w * 0.3);
  ctx.restore();
}

/**
 * Подгъвът на снимка, който се разплита в бод (stitchPhoto от stitch-dom.ts, долният
 * ръб): цветовете са от самата снимка (обрязана като object-fit: cover), гъсто до нея
 * и разредено към лена. Платното е zone + out високо и стои с горния си ръб на H − zone.
 */
export function hemStitches(im: HTMLImageElement, P: number, H: number, s: number, depthShare: number, focus: [number, number]) {
  const zone = Math.round((H * depthShare) / s) * s, out = Math.round(72 / s) * s, W = zone + out;
  const pw = Math.ceil(P / s), ph = Math.ceil(H / s), iw = im.naturalWidth, ih = im.naturalHeight;
  const scale = Math.max(P / iw, H / ih), sw = P / scale, sh = H / scale;
  const sx = (iw - sw) * focus[0], sy = (ih - sh) * focus[1];
  const mid = document.createElement("canvas");
  mid.width = pw * 4; mid.height = ph * 4;
  const mctx = mid.getContext("2d")!;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(im, sx, sy, sw, sh, 0, 0, mid.width, mid.height);
  const small = document.createElement("canvas");
  small.width = pw; small.height = ph;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(mid, 0, 0, pw, ph);
  const px = sctx.getImageData(0, 0, pw, ph).data;
  const colour = (cx: number, cy: number): RGB => {
    const x = Math.min(pw - 1, Math.max(0, cx)), y = Math.min(ph - 1, Math.max(0, cy)), i = (y * pw + x) * 4;
    return nearestSkein(px[i], px[i + 1], px[i + 2]);
  };
  const shade = (rgb: RGB, m: number) => `rgb(${rgb.map((v) => Math.round(Math.min(255, v * m))).join(",")})`;
  const cols = Math.ceil(P / s), rows = Math.ceil(W / s), list: Stitch[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const depth = (rows - 1 - j) * s + s / 2;
    const u = depth / W + (noise1(i * 0.17, 3) - 0.5) * 0.24 + (hash2(i, j, 5) - 0.5) * 0.07;
    if (hash2(i, j, 11) >= stitchChance(u)) continue;
    const inPhoto = Math.floor((depth - out) / s);
    const a = inPhoto >= 0 ? inPhoto : Math.floor(hash2(i, j, 13) * 3);
    const rgb = colour(i, ph - 1 - a);
    list.push({ x: i * s, y: j * s, a: shade(rgb, 0.82), b: shade(rgb, 1), order: u + hash2(i, j, 17) * 0.08, j1: jit(i * s, j * s, 23), j2: jit(i * s, j * s, 19) });
  }
  return { list: finish(list), zone, out, w: P, h: W };
}

/** Главна буква на канава Аида (sewLetter от stitch-dom.ts), шита ред по ред. */
export function letterStitches(fontFamily: string, letter: string, size: number, N = 26) {
  const s = size / N, R = N * 8;
  const off = document.createElement("canvas");
  off.width = R; off.height = R;
  off.setAttribute("lang", "bg");
  const o = off.getContext("2d", { willReadFrequently: true })! as CanvasRenderingContext2D & { lang?: string };
  o.lang = "bg";
  o.textAlign = "center"; o.textBaseline = "alphabetic";
  o.font = `800 ${R}px ${fontFamily}`;
  const probe = o.measureText(letter);
  const k = Math.min((R * 0.74) / (probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent || R), (R * 0.84) / (probe.width || R));
  o.font = `800 ${R * k}px ${fontFamily}`;
  const m = o.measureText(letter);
  o.fillText(letter, R / 2, R / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  const px = o.getImageData(0, 0, R, R).data;
  const filled = (cx: number, cy: number) => {
    if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
    let sum = 0;
    for (let yy = 1; yy < 8; yy += 2) for (let xx = 1; xx < 8; xx += 2) sum += px[((cy * 8 + yy) * R + cx * 8 + xx) * 4 + 3];
    return sum / 16 > 120;
  };
  const list: Stitch[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!filled(x, y)) continue;
    const edge = !filled(x + 1, y) || !filled(x - 1, y) || !filled(x, y + 1) || !filled(x, y - 1);
    const c = edge ? THREAD.red : THREAD.wine;
    list.push({ x: x * s, y: y * s, a: c, b: c, order: y * N + x, j1: (hash2(x, y, 4) - 0.5) * 0.6, j2: (hash2(x, y, 3) - 0.5) * 0.6 });
  }
  return { list: finish(list), s, N };
}

/** Дупките на канавата Аида — веднъж, под буквата. */
export function aida(ctx: CanvasRenderingContext2D, size: number, N = 26): void {
  const s = size / N;
  ctx.fillStyle = "rgba(28,25,23,.13)";
  for (let y = 1; y < N; y++) for (let x = 1; x < N; x++) ctx.fillRect(x * s - 0.75, y * s - 0.75, 1.5, 1.5);
}

/** Бордюрът „вълчи зъби“ по цялата ширина, шит отляво надясно. */
export function borderStitches(width: number, s: number) {
  const m = borderTile(), list: Stitch[] = [];
  for (let ox = 0; ox * s < width; ox += m.w) for (const c of m.cells) {
    const x = ox + c.x;
    if (x * s >= width) continue;
    list.push({ x: x * s, y: c.y * s, a: c.c, b: c.c, order: x + hash2(x, c.y, 9) * 3, j1: jit(x, c.y, 23), j2: jit(x, c.y, 19) });
  }
  return { list: finish(list), h: m.h * s };
}

/** Един червен бод — знак пред ред в списък. */
export function single(colour: string = THREAD.red): Stitch[] {
  return [{ x: 0, y: 0, a: colour, b: colour, order: 0, j1: 0, j2: 0 }];
}

export { THREAD };
