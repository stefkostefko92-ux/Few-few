// Drawing cross-stitch on a <canvas>: the browser half of stitch.ts. Plain DOM,
// no React, so the same code serves the site's components and any static copy
// of the page. Each function returns a cancel function.
import { hash2, nearestSkein, noise1, stitchChance, THREAD } from "./stitch";

type RGB = [number, number, number];

/** One leg of a stitch: soft shadow, the thread, and (on the top leg) a sheen. */
function paintLeg(
  ctx: CanvasRenderingContext2D, x: number, y: number, s: number, colour: string,
  second: boolean, jitter: number,
) {
  const inset = s * 0.17, lw = s * 0.3;
  const x0 = x + inset, y0 = y + inset, x1 = x + s - inset, y1 = y + s - inset;
  const [ax, ay, bx, by] = second ? [x0, y0, x1, y1] : [x0, y1, x1, y0];
  ctx.lineWidth = lw;
  ctx.strokeStyle = "rgba(28,25,23,.25)";
  ctx.beginPath(); ctx.moveTo(ax + 0.6, ay + 0.9 + jitter); ctx.lineTo(bx + 0.6, by + 0.9 - jitter); ctx.stroke();
  ctx.strokeStyle = colour;
  ctx.beginPath(); ctx.moveTo(ax, ay + jitter); ctx.lineTo(bx, by - jitter); ctx.stroke();
  if (second) {
    ctx.lineWidth = lw * 0.3;
    ctx.strokeStyle = "rgba(255,255,255,.25)";
    ctx.beginPath(); ctx.moveTo(ax - 0.3, ay - 0.45 + jitter); ctx.lineTo(bx - 0.3, by - 0.45 - jitter); ctx.stroke();
  }
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
