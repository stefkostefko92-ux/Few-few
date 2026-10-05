"use client";

import { useEffect, useRef } from "react";
import { hash2, nearestSkein, noise1, stitchChance } from "@/lib/stitch";

type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
};

type Stitch = { x: number; y: number; rgb: [number, number, number]; order: number };

/**
 * A photograph whose edge comes undone into cross-stitch: the stitches take
 * their thread from the photo itself (each cell's colour, matched to a box of
 * embroidery skeins), dense where they meet the picture and thinning out onto
 * the bare linen. Embroidered once when the page opens; drawn at once when the
 * visitor prefers reduced motion. Without JavaScript the plain photo shows —
 * the fade on its edge only appears once the stitches are there to fill it.
 */
export default function StitchedPhoto({ src, alt, width, height, priority, className }: Props) {
  const fig = useRef<HTMLElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const f = fig.current, im = img.current, c = cvs.current;
    if (!f || !im || !c) return;
    let raf = 0, timer = 0, drawn = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = (animate: boolean) => {
      cancelAnimationFrame(raf);
      const P = f.clientWidth, H = f.clientHeight;
      if (!P || !H || !im.naturalWidth) return;
      const css = getComputedStyle(f);
      const vertical = css.getPropertyValue("--stitch-axis").trim() === "y";
      const s = parseFloat(css.getPropertyValue("--stitch-cell")) || 10;
      const along = vertical ? H : P;
      const across = vertical ? P : H;
      const zone = Math.round((along * (vertical ? 0.5 : 0.42)) / s) * s;
      const out = Math.round((vertical ? 32 : 72) / s) * s;
      const W = zone + out;

      // Photo colours, one per stitch cell, sampled through the same
      // object-fit: cover crop the browser shows.
      const pw = Math.ceil(P / s), ph = Math.ceil(H / s);
      const iw = im.naturalWidth, ih = im.naturalHeight;
      const scale = Math.max(P / iw, H / ih);
      const [px, py] = css.getPropertyValue("--stitch-focus").trim().split(/\s+/).map((v) => parseFloat(v) / 100);
      const sw = P / scale, sh = H / scale;
      const sx = (iw - sw) * (Number.isFinite(px) ? px : 0.5), sy = (ih - sh) * (Number.isFinite(py) ? py : 0.5);
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
        return; // a picture we may not read (another origin): leave it whole
      }
      const colour = (cx: number, cy: number): [number, number, number] => {
        const x = Math.min(pw - 1, Math.max(0, cx)), y = Math.min(ph - 1, Math.max(0, cy));
        const i = (y * pw + x) * 4;
        return nearestSkein(pixels[i], pixels[i + 1], pixels[i + 2]);
      };

      // Which cells get a stitch, and in what order they are sewn.
      const cols = (vertical ? across : W) / s, rows = (vertical ? W : across) / s;
      const stitches: Stitch[] = [];
      for (let j = 0; j < Math.ceil(rows); j++) {
        for (let i = 0; i < Math.ceil(cols); i++) {
          // depth: distance from the outer edge, in px; k: position across.
          const depth = vertical ? (Math.ceil(rows) - 1 - j) * s + s / 2 : i * s + s / 2;
          const k = vertical ? i : j;
          const u = depth / W + (noise1(k * 0.17, 3) - 0.5) * 0.24 + (hash2(i, j, 5) - 0.5) * 0.07;
          if (hash2(i, j, 11) >= stitchChance(u)) continue;
          const inPhoto = Math.floor((depth - out) / s);
          const a = inPhoto >= 0 ? inPhoto : Math.floor(hash2(i, j, 13) * 3); // loose threads keep the edge's colours
          const rgb = vertical ? colour(k, ph - 1 - a) : colour(a, k);
          stitches.push({ x: i * s, y: j * s, rgb, order: -u + hash2(i, j, 17) * 0.18 });
        }
      }
      stitches.sort((p, q) => p.order - q.order);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = vertical ? across : W, ch = vertical ? W : across;
      c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
      f.style.setProperty("--zone", `${zone}px`);
      f.style.setProperty("--out", `${out}px`);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.lineCap = "round";
      const inset = s * 0.17, lw = s * 0.3;

      const shade = (rgb: [number, number, number], m: number) => `rgb(${rgb.map((v) => Math.round(Math.min(255, v * m))).join(",")})`;
      // A stitch is two legs: "/" first, then "\" on top — the order a hand sews it.
      const leg = (st: Stitch, second: boolean) => {
        const x0 = st.x + inset, y0 = st.y + inset, x1 = st.x + s - inset, y1 = st.y + s - inset;
        const [ax, ay, bx, by] = second ? [x0, y0, x1, y1] : [x0, y1, x1, y0];
        const jit = (hash2(st.x, st.y, second ? 19 : 23) - 0.5) * 0.9;
        ctx.lineWidth = lw;
        ctx.strokeStyle = "rgba(28,25,23,.26)";
        ctx.beginPath(); ctx.moveTo(ax + 0.6, ay + 0.9 + jit); ctx.lineTo(bx + 0.6, by + 0.9 - jit); ctx.stroke();
        ctx.strokeStyle = shade(st.rgb, second ? 1 : 0.82);
        ctx.beginPath(); ctx.moveTo(ax, ay + jit); ctx.lineTo(bx, by - jit); ctx.stroke();
        if (second) {
          ctx.lineWidth = lw * 0.3;
          ctx.strokeStyle = "rgba(255,255,255,.24)";
          ctx.beginPath(); ctx.moveTo(ax - 0.3, ay - 0.5 + jit); ctx.lineTo(bx - 0.3, by - 0.5 - jit); ctx.stroke();
        }
      };

      f.classList.add("is-stitched");
      if (!animate) {
        for (const st of stitches) { leg(st, false); leg(st, true); }
        return;
      }
      // Sewn from the photo outwards over ~1.6 s; each stitch's second leg
      // follows its first by 90 ms.
      const n = stitches.length, span = 1400, lag = 90;
      const t0 = performance.now();
      let a = 0, b = 0;
      const step = (now: number) => {
        const t = now - t0;
        while (a < n && (a / n) * span <= t) leg(stitches[a++], false);
        while (b < a && (b / n) * span + lag <= t) leg(stitches[b++], true);
        if (b < n) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    const start = () => {
      if (drawn) return;
      drawn = true;
      draw(!reduce.matches);
    };
    if (im.complete && im.naturalWidth) start();
    else im.addEventListener("load", start, { once: true });

    // Same embroidery on resize (the pattern is seeded by position), drawn at once.
    let lastW = f.clientWidth, lastH = f.clientHeight;
    const ro = new ResizeObserver(() => {
      if (!drawn || (f.clientWidth === lastW && f.clientHeight === lastH)) return;
      lastW = f.clientWidth; lastH = f.clientHeight;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => draw(false), 160);
    });
    ro.observe(f);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(timer); ro.disconnect(); im.removeEventListener("load", start); };
  }, [src]);

  return (
    <figure ref={fig} className={`stitched ${className ?? ""}`}>
      <img
        ref={img}
        className="stitched__img"
        src={src}
        alt={alt}
        width={width}
        height={height}
        fetchPriority={priority ? "high" : undefined}
        decoding={priority ? "sync" : "async"}
      />
      <canvas ref={cvs} className="stitched__thread" aria-hidden="true" />
    </figure>
  );
}
