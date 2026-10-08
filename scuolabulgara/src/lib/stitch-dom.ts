// Drawing cross-stitch on a <canvas>: the browser half of stitch.ts. Plain DOM,
// no React, so the same code serves the site's components and any static copy
// of the page. Each function returns a cancel function.
import { hash2, nearestSkein, noise1, stitchChance, THREAD } from "./stitch";

type RGB = [number, number, number];

// The same thread as the server-drawn motifs (components/Stitch.tsx): a
// spindle pinched at both holes, lit from the top left, two twisted strands,
// darker where it dives into the cloth. Each leg is painted once per colour
// and size into a small sprite, then stamped — a photo's hem holds thousands.
const INSET = 0.07, BODY = 0.5;
const sprites = new Map<string, HTMLCanvasElement>();

const toRgb = (c: string): RGB => {
  if (c.startsWith("#")) return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)) as RGB;
  const m = c.match(/\d+(\.\d+)?/g) || ["0", "0", "0"];
  return [Number(m[0]), Number(m[1]), Number(m[2])];
};
const mix = ([r, g, b]: RGB, t: number, to: number) =>
  `rgb(${[r, g, b].map((v) => Math.round(v + (to - v) * t)).join(",")})`;

function legSprite(colour: string, second: boolean, s: number, dpr: number): { img: HTMLCanvasElement; pad: number } {
  const pad = Math.ceil(s * 0.25);
  const key = `${colour}|${second}|${s}|${dpr}`;
  let img = sprites.get(key);
  if (!img) {
    img = document.createElement("canvas");
    img.width = img.height = Math.ceil((s + 2 * pad) * dpr);
    const g = img.getContext("2d")!;
    g.scale(dpr, dpr);
    const half = ((1 - 2 * INSET) * Math.SQRT2 * s) / 2, h = BODY * 0.68 * s, k = 0.2 * s;
    const spindle = () => {
      g.beginPath();
      g.moveTo(-half, 0);
      g.bezierCurveTo(-half + k, -h, half - k, -h, half, 0);
      g.bezierCurveTo(half - k, h, -half + k, h, -half, 0);
      g.closePath();
    };
    const angle = second ? Math.PI / 4 : -Math.PI / 4;
    // its shadow — on the cloth, or for the top leg on the bottom one
    g.save();
    g.translate(pad + s / 2 + s * 0.035, pad + s / 2 + s * 0.06);
    g.rotate(angle);
    spindle();
    g.fillStyle = second ? "rgba(20,8,6,.3)" : "rgba(40,20,10,.22)";
    g.fill();
    g.restore();
    // the thread
    g.translate(pad + s / 2, pad + s / 2);
    g.rotate(angle);
    const rgb = toRgb(colour);
    const body = g.createLinearGradient(0, -h * 0.75, 0, h * 0.75);
    body.addColorStop(0, mix(rgb, 0.42, 0));
    body.addColorStop(0.2, colour);
    body.addColorStop(0.38, mix(rgb, 0.3, 255));
    body.addColorStop(0.56, colour);
    body.addColorStop(1, mix(rgb, 0.5, 0));
    spindle();
    g.fillStyle = body;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = "rgba(20,8,6,.2)"; // the twist of the two strands
    g.lineWidth = s * 0.04;
    for (let x = -half - h; x < half + h; x += s * 0.11) {
      g.beginPath(); g.moveTo(x - h * 0.8, -h); g.lineTo(x + h * 0.8, h); g.stroke();
    }
    const ends = g.createLinearGradient(-half, 0, half, 0);
    ends.addColorStop(0, "rgba(20,8,6,.55)");
    ends.addColorStop(0.16, "rgba(20,8,6,0)");
    ends.addColorStop(0.84, "rgba(20,8,6,0)");
    ends.addColorStop(1, "rgba(20,8,6,.55)");
    g.fillStyle = ends;
    g.fillRect(-half, -h, 2 * half, 2 * h);
    g.restore();
    g.strokeStyle = "rgba(255,255,255,.3)"; // sheen
    g.lineWidth = s * 0.035;
    g.lineCap = "round";
    g.beginPath(); g.moveTo(-0.36 * s, -BODY * 0.17 * s); g.lineTo(0.36 * s, -BODY * 0.17 * s); g.stroke();
    sprites.set(key, img);
  }
  return { img, pad };
}

/** One leg of a stitch, stamped from its sprite. */
function paintLeg(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string,
  second: boolean, jitter: number,
) {
  const dpr = ctx.getTransform().a || 1;
  const { img, pad } = legSprite(colour, second, s, dpr);
  ctx.drawImage(img, x - pad, y - pad + jitter * 0.5, s + 2 * pad, s + 2 * pad);
}

/** Sew a list of stitches: all at once, or first legs then second legs over
 *  `span` ms, the way a hand works. */
function sew<T>(items: T[], paint: (it: T, second: boolean) => void, animate: boolean, span: number, lag: number): () => void {
  if (!animate) {
    for (const it of items) { paint(it, false); paint(it, true); }
    return () => {};
  }
  let raf = 0, a = 0, b = 0, live = true;
  const n = items.length, t0 = performance.now();
  const step = (now: number) => {
    const t = now - t0;
    while (a < n && (a / n) * span <= t) paint(items[a++], false);
    while (b < a && (b / n) * span + lag <= t) paint(items[b++], true);
    if (b < n && live) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { live = false; cancelAnimationFrame(raf); };
}

function prepare(c: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  const ctx = c.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  return ctx;
}

/**
 * A photograph whose edge comes undone into cross-stitch. Reads its layout from
 * CSS custom properties on the figure: --stitch-axis (x: left edge, y: bottom
 * edge), --stitch-cell (px per stitch), --stitch-depth (how far into the photo
 * the embroidery climbs, as a share of it), --stitch-focus (object-position).
 * Sewn from the outer edge inwards — on the bottom edge: from the hem upwards,
 * stopping at the top of the zone. Sets --zone/--out for the CSS mask and adds
 * .is-stitched once drawn.
 */
export function stitchPhoto(f: HTMLElement, im: HTMLImageElement, c: HTMLCanvasElement, animate: boolean): () => void {
  const P = f.clientWidth, H = f.clientHeight;
  if (!P || !H || !im.naturalWidth) return () => {};
  const css = getComputedStyle(f);
  const vertical = css.getPropertyValue("--stitch-axis").trim() === "y";
  const s = parseFloat(css.getPropertyValue("--stitch-cell")) || 10;
  const along = vertical ? H : P;
  const across = vertical ? P : H;
  const depthShare = parseFloat(css.getPropertyValue("--stitch-depth")) || (vertical ? 0.3 : 0.42);
  const zone = Math.round((along * depthShare) / s) * s;
  const out = Math.round((vertical ? 32 : 72) / s) * s;
  const W = zone + out;

  // Photo colours, one per stitch cell, through the same object-fit: cover crop.
  const pw = Math.ceil(P / s), ph = Math.ceil(H / s);
  const iw = im.naturalWidth, ih = im.naturalHeight;
  const scale = Math.max(P / iw, H / ih);
  const [fx, fy] = css.getPropertyValue("--stitch-focus").trim().split(/\s+/).map((v) => parseFloat(v) / 100);
  const sw = P / scale, sh = H / scale;
  const sx = (iw - sw) * (Number.isFinite(fx) ? fx : 0.5), sy = (ih - sh) * (Number.isFinite(fy) ? fy : 0.5);
  let pixels: Uint8ClampedArray;
  try {
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
    pixels = sctx.getImageData(0, 0, pw, ph).data;
  } catch {
    return () => {}; // a picture we may not read (another origin): leave it whole
  }
  const colour = (cx: number, cy: number): RGB => {
    const x = Math.min(pw - 1, Math.max(0, cx)), y = Math.min(ph - 1, Math.max(0, cy));
    const i = (y * pw + x) * 4;
    return nearestSkein(pixels[i], pixels[i + 1], pixels[i + 2]);
  };

  // Which cells get a stitch, and the order they are sewn: from the outer edge in.
  type St = { x: number; y: number; rgb: RGB; order: number };
  const cols = Math.ceil((vertical ? across : W) / s), rows = Math.ceil((vertical ? W : across) / s);
  const stitches: St[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const depth = vertical ? (rows - 1 - j) * s + s / 2 : i * s + s / 2; // from the outer edge
      const k = vertical ? i : j; // position along the edge
      const u = depth / W + (noise1(k * 0.17, 3) - 0.5) * 0.24 + (hash2(i, j, 5) - 0.5) * 0.07;
      if (hash2(i, j, 11) >= stitchChance(u)) continue;
      const inPhoto = Math.floor((depth - out) / s);
      const a = inPhoto >= 0 ? inPhoto : Math.floor(hash2(i, j, 13) * 3); // loose threads keep the edge's colours
      stitches.push({ x: i * s, y: j * s, rgb: vertical ? colour(k, ph - 1 - a) : colour(a, k), order: u + hash2(i, j, 17) * 0.08 });
    }
  }
  stitches.sort((p, q) => p.order - q.order);

  f.style.setProperty("--zone", `${zone}px`);
  f.style.setProperty("--out", `${out}px`);
  const ctx = prepare(c, vertical ? across : W, vertical ? W : across);
  const shade = (rgb: RGB, m: number) => `rgb(${rgb.map((v) => Math.round(Math.min(255, v * m))).join(",")})`;
  f.classList.add("is-stitched");
  return sew(stitches, (st, second) => paintLeg(ctx, st.x, st.y, s, shade(st.rgb, second ? 1 : 0.82), second, (hash2(st.x, st.y, second ? 19 : 23) - 0.5) * 0.9), animate, 1900, 90);
}

/**
 * A capital letter embroidered on Aida cloth: rasterised from `fontFamily`
 * (Bulgarian letterforms via lang="bg") onto a grid and sewn row by row.
 */
export function sewLetter(c: HTMLCanvasElement, fontFamily: string, letter: string, animate: boolean): () => void {
  const size = c.clientWidth;
  if (!size) return () => {};
  const N = 26; // stitches per side
  const s = size / N;
  const ctx = prepare(c, size, size);

  // The cloth: a hole at every grid corner.
  ctx.fillStyle = "rgba(28,25,23,.13)";
  for (let y = 1; y < N; y++) for (let x = 1; x < N; x++) ctx.fillRect(x * s - 0.75, y * s - 0.75, 1.5, 1.5);

  const R = N * 8;
  const off = document.createElement("canvas");
  off.width = R; off.height = R;
  off.setAttribute("lang", "bg");
  const o = off.getContext("2d", { willReadFrequently: true })!;
  (o as CanvasRenderingContext2D & { lang?: string }).lang = "bg";
  o.textAlign = "center";
  o.textBaseline = "alphabetic";
  // Fill the cloth: cap height ≈ 74%, never wider than 84%.
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
  const cells: { x: number; y: number; colour: string }[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!filled(x, y)) continue;
    const edge = !filled(x + 1, y) || !filled(x - 1, y) || !filled(x, y + 1) || !filled(x, y - 1);
    cells.push({ x, y, colour: edge ? THREAD.red : THREAD.wine });
  }
  cells.sort((p, q) => p.y - q.y || p.x - q.x); // row by row
  c.parentElement?.setAttribute("data-sewn", "");
  return sew(cells, (e, second) => paintLeg(ctx, e.x * s, e.y * s, s, e.colour, second, (hash2(e.x, e.y, second ? 3 : 4) - 0.5) * 0.6), animate, 520, 60);
}
