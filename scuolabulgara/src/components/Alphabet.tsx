"use client";

import { useEffect, useRef, useState } from "react";
import type { Letter } from "@/lib/content";
import { hash2, THREAD } from "@/lib/stitch";

type Labels = { pick: string; latin: string; meaning: string };

/**
 * The 30 letters as a keyboard-friendly grid; the chosen one is shown large
 * and embroidered — its capital rasterised from the page font (Bulgarian
 * letterforms) onto an Aida grid and sewn stitch by stitch. Without JavaScript
 * the grid and the first letter still read correctly.
 */
export default function Alphabet({ letters, labels }: { letters: Letter[]; labels: Labels }) {
  const [sel, setSel] = useState(0);
  const cvs = useRef<HTMLCanvasElement>(null);
  const glyph = useRef<HTMLSpanElement>(null);
  const cur = letters[sel] ?? letters[0];

  useEffect(() => {
    const c = cvs.current, g = glyph.current;
    if (!c || !g || !cur) return;
    let raf = 0, cancelled = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const sew = () => {
      if (cancelled) return;
      const size = c.clientWidth;
      if (!size) return;
      const N = 26; // stitches per side
      const s = size / N;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
      const ctx = c.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);

      // The Aida cloth: a hole at every grid corner.
      ctx.fillStyle = "rgba(28,25,23,.13)";
      for (let y = 1; y < N; y++) for (let x = 1; x < N; x++) ctx.fillRect(x * s - 0.75, y * s - 0.75, 1.5, 1.5);

      // Rasterise the capital in the page's own display face.
      const R = N * 8;
      const off = document.createElement("canvas");
      off.width = R; off.height = R;
      off.setAttribute("lang", "bg");
      const o = off.getContext("2d", { willReadFrequently: true })!;
      const fam = getComputedStyle(g).fontFamily;
      (o as CanvasRenderingContext2D & { lang?: string }).lang = "bg";
      o.textAlign = "center";
      o.textBaseline = "alphabetic";
      // Size the capital to fill the cloth: cap height ≈ 74%, never wider than 84%.
      o.font = `800 ${R}px ${fam}`;
      const probe = o.measureText(cur.letter);
      const k = Math.min((R * 0.74) / (probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent || R), (R * 0.84) / (probe.width || R));
      o.font = `800 ${R * k}px ${fam}`;
      const m = o.measureText(cur.letter);
      const top = m.actualBoundingBoxAscent, bottom = m.actualBoundingBoxDescent;
      o.fillText(cur.letter, R / 2, R / 2 + (top - bottom) / 2);
      const px = o.getImageData(0, 0, R, R).data;
      const filled = (cx: number, cy: number) => {
        let sum = 0;
        for (let yy = 1; yy < 8; yy += 2) for (let xx = 1; xx < 8; xx += 2) sum += px[((cy * 8 + yy) * R + cx * 8 + xx) * 4 + 3];
        return sum / 16 > 120;
      };
      const cells: { x: number; y: number; edge: boolean }[] = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!filled(x, y)) continue;
        const edge = !filled(x + 1, y) || !filled(x - 1, y) || !filled(x, y + 1) || !filled(x, y - 1);
        cells.push({ x, y, edge });
      }
      // Sewn row by row, the way a hand works across the cloth.
      cells.sort((p, q) => p.y - q.y || p.x - q.x);

      const inset = s * 0.16, lw = s * 0.3;
      ctx.lineCap = "round";
      const leg = (cx: number, cy: number, colour: string, second: boolean) => {
        const x0 = cx * s + inset, y0 = cy * s + inset, x1 = (cx + 1) * s - inset, y1 = (cy + 1) * s - inset;
        const [ax, ay, bx, by] = second ? [x0, y0, x1, y1] : [x0, y1, x1, y0];
        const j = (hash2(cx, cy, second ? 3 : 4) - 0.5) * 0.6;
        ctx.lineWidth = lw;
        ctx.strokeStyle = "rgba(28,25,23,.22)";
        ctx.beginPath(); ctx.moveTo(ax + 0.5, ay + 0.8 + j); ctx.lineTo(bx + 0.5, by + 0.8 - j); ctx.stroke();
        ctx.strokeStyle = colour;
        ctx.beginPath(); ctx.moveTo(ax, ay + j); ctx.lineTo(bx, by - j); ctx.stroke();
        if (second) {
          ctx.lineWidth = lw * 0.3;
          ctx.strokeStyle = "rgba(255,255,255,.26)";
          ctx.beginPath(); ctx.moveTo(ax - 0.3, ay - 0.4 + j); ctx.lineTo(bx - 0.3, by - 0.4 - j); ctx.stroke();
        }
      };
      const colourOf = (e: { edge: boolean }) => (e.edge ? THREAD.red : THREAD.wine);
      c.parentElement?.setAttribute("data-sewn", "");
      if (reduce) {
        for (const e of cells) { leg(e.x, e.y, colourOf(e), false); leg(e.x, e.y, colourOf(e), true); }
        return;
      }
      const n = cells.length, span = 520, t0 = performance.now();
      let a = 0, b = 0;
      const step = (now: number) => {
        const t = now - t0;
        while (a < n && (a / n) * span <= t) { const e = cells[a++]; leg(e.x, e.y, colourOf(e), false); }
        while (b < a && (b / n) * span + 60 <= t) { const e = cells[b++]; leg(e.x, e.y, colourOf(e), true); }
        if (b < n && !cancelled) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };

    document.fonts.ready.then(sew);
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [cur]);

  // Arrow keys move through the grid like a keyboard (roving focus).
  const grid = useRef<HTMLDivElement>(null);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const cols = Number(getComputedStyle(grid.current!).getPropertyValue("--cols")) || 6;
    const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: letters.length - 1 - i }[e.key];
    if (d === undefined) return;
    e.preventDefault();
    const next = Math.min(letters.length - 1, Math.max(0, i + d));
    setSel(next);
    grid.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  if (!cur) return null;
  return (
    <div className="abc">
      <div className="abc__grid" ref={grid} role="group" aria-label={labels.pick}>
        {letters.map((l, i) => (
          <button
            key={`${l.letter}-${i}`}
            type="button"
            lang="bg"
            className="abc__key"
            aria-pressed={i === sel}
            tabIndex={i === sel ? 0 : -1}
            onClick={() => setSel(i)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {l.letter}
            <small>{l.latin}</small>
          </button>
        ))}
      </div>

      <div className="abc__card">
        <div className="abc__cloth">
          <canvas ref={cvs} aria-hidden="true" />
          <span className="abc__glyph" ref={glyph} lang="bg" aria-hidden="true">{cur.letter}</span>
        </div>
        <div className="abc__info" aria-live="polite">
          <p className="abc__pair" lang="bg">{cur.letter}{cur.letter.toLocaleLowerCase("bg")}</p>
          <p className="abc__word" lang="bg">{cur.word}</p>
          <dl>
            <div><dt>{labels.latin}</dt><dd>{cur.latin}</dd></div>
            <div><dt>{labels.meaning}</dt><dd>{cur.meaning}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
