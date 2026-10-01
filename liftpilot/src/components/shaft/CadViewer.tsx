'use client';

// Canvas view of an imported drawing: drag to pan, wheel, buttons or two fingers to zoom; a click (or a tap) inside
// the shaft asks the designer to survey it there. The surveyed rectangle, its four rays and the landing wall are drawn
// over the drawing; layers left out of the survey are drawn faint. Colours from the theme.
import { useCallback, useEffect, useRef } from 'react';
import type { CadModel } from '@/lib/cad/model';
import { surveyCorners, type DoorSide, type Survey } from '@/lib/cad/measure';

interface Props {
  model: CadModel;
  hidden: ReadonlySet<number>;
  survey: Survey | null;
  door: DoorSide;
  onPick(x: number, y: number): void;
  labels: { fit: string; zoomIn: string; zoomOut: string; canvas: string };
}

interface View { s: number; tx: number; ty: number }

const SIDE: Record<DoorSide, [number, number]> = { down: [0, 1], right: [1, 2], up: [2, 3], left: [3, 0] };

export default function CadViewer({ model, hidden, survey, door, onPick, labels }: Props) {
  const wrap = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const view = useRef<View>({ s: 1, tx: 0, ty: 0 }), size = useRef({ w: 1, h: 1, dpr: 1 });
  const paths = useRef<{ shown: Path2D; faint: Path2D } | null>(null);
  const overlay = useRef<{ survey: Survey | null; door: DoorSide }>({ survey, door });

  const draw = useCallback((): void => {
    const c = canvas.current, ctx = c?.getContext('2d');
    if (!c || !ctx || !paths.current) return;
    const css = getComputedStyle(c), v = view.current, { w, h, dpr } = size.current;
    const color = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = color('--surface', '#fff');
    ctx.fillRect(0, 0, w, h);
    ctx.setTransform(dpr * v.s, 0, 0, -dpr * v.s, dpr * v.tx, dpr * v.ty);
    ctx.lineWidth = 1 / v.s;
    ctx.strokeStyle = color('--muted', '#888');
    ctx.globalAlpha = 0.3;
    ctx.stroke(paths.current.faint);
    ctx.strokeStyle = color('--ink', '#111');
    ctx.globalAlpha = 0.85;
    ctx.stroke(paths.current.shown);
    ctx.globalAlpha = 1;
    const sv = overlay.current.survey;
    if (!sv) return;
    const accent = color('--accent', '#1d3271'), k = surveyCorners(sv);
    ctx.beginPath();
    k.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 / v.s;
    ctx.stroke();
    const [i, j] = SIDE[overlay.current.door];
    ctx.lineWidth = 6 / v.s;
    ctx.beginPath();
    ctx.moveTo(...k[i]);
    ctx.lineTo(...k[j]);
    ctx.stroke();
    ctx.setLineDash([6 / v.s, 5 / v.s]);
    ctx.lineWidth = 1.2 / v.s;
    const ux = Math.cos(sv.angle), uy = Math.sin(sv.angle);
    for (const [dx, dy, d] of [[ux, uy, sv.right], [-ux, -uy, sv.left], [-uy, ux, sv.up], [uy, -ux, sv.down]] as const) {
      ctx.beginPath();
      ctx.moveTo(sv.x, sv.y);
      ctx.lineTo(sv.x + dx * d, sv.y + dy * d);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(sv.x, sv.y, 4 / v.s, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }, []);

  const fit = useCallback((): void => {
    const { minX, minY, maxX, maxY } = model.bounds, { w, h } = size.current;
    const s = 0.92 * Math.min(w / Math.max(maxX - minX, 1e-9), h / Math.max(maxY - minY, 1e-9));
    view.current = { s, tx: w / 2 - ((minX + maxX) / 2) * s, ty: h / 2 + ((minY + maxY) / 2) * s };
    draw();
  }, [model, draw]);

  const zoom = useCallback((factor: number, sx: number, sy: number): void => {
    const v = view.current, s = Math.min(Math.max(v.s * factor, 1e-6), 1e6), f = s / v.s;
    view.current = { s, tx: sx - (sx - v.tx) * f, ty: sy - (sy - v.ty) * f };
    draw();
  }, [draw]);

  // paths in drawing units, built once per drawing and per choice of layers
  useEffect(() => {
    const shown = new Path2D(), faint = new Path2D(), s = model.seg;
    for (let i = 0; i < model.count; i++) {
      const p = hidden.has(model.layerOf[i]) ? faint : shown;
      p.moveTo(s[4 * i], s[4 * i + 1]);
      p.lineTo(s[4 * i + 2], s[4 * i + 3]);
    }
    paths.current = { shown, faint };
    draw();
  }, [model, hidden, draw]);

  useEffect(() => {
    overlay.current = { survey, door };
    if (survey) {
      // a new measure on a whole floor plan: bring the shaft into view, about a third of the width
      const k = surveyCorners(survey), xs = k.map((p) => p[0]), ys = k.map((p) => p[1]), v = view.current, { w, h } = size.current;
      const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
      if (bw * v.s < w * 0.18 && bh * v.s < h * 0.18) {
        const s = Math.min(w / (bw * 3), h / (bh * 3)), cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        view.current = { s, tx: w / 2 - cx * s, ty: h / 2 + cy * s };
      }
    }
    draw();
  }, [survey, door, draw]);

  // size with the container; the first size fits the drawing
  useEffect(() => {
    const el = wrap.current, c = canvas.current;
    if (!el || !c) return;
    let first = true;
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2), w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      size.current = { w, h, dpr };
      if (first) { first = false; fit(); } else draw();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, draw]);

  // pan, pinch, wheel and click
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const down = new Map<number, { x: number; y: number }>();
    let moved = false, start = { x: 0, y: 0 };
    const local = (e: PointerEvent | WheelEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const onDown = (e: PointerEvent): void => {
      c.setPointerCapture(e.pointerId);
      down.set(e.pointerId, local(e));
      if (down.size === 1) { moved = false; start = local(e); }
    };
    const onMove = (e: PointerEvent): void => {
      const prev = down.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      if (down.size === 1) {
        if (Math.hypot(p.x - start.x, p.y - start.y) > 4) moved = true;
        if (moved) { view.current = { ...view.current, tx: view.current.tx + p.x - prev.x, ty: view.current.ty + p.y - prev.y }; draw(); }
      } else if (down.size === 2) {
        moved = true;
        const other = [...down.entries()].find(([id]) => id !== e.pointerId)?.[1];
        if (other) {
          const before = Math.hypot(prev.x - other.x, prev.y - other.y), after = Math.hypot(p.x - other.x, p.y - other.y);
          if (before > 0) zoom(after / before, (p.x + other.x) / 2, (p.y + other.y) / 2);
        }
      }
      down.set(e.pointerId, p);
    };
    const onUp = (e: PointerEvent): void => {
      const single = down.size === 1;
      down.delete(e.pointerId);
      if (single && !moved) {
        const p = local(e), v = view.current;
        onPick((p.x - v.tx) / v.s, (v.ty - p.y) / v.s);
      }
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const p = local(e);
      zoom(Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    };
    c.addEventListener('pointerdown', onDown);
    c.addEventListener('pointermove', onMove);
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      c.removeEventListener('pointerdown', onDown);
      c.removeEventListener('pointermove', onMove);
      c.removeEventListener('pointerup', onUp);
      c.removeEventListener('pointercancel', onUp);
      c.removeEventListener('wheel', onWheel);
    };
  }, [draw, zoom, onPick]);

  const centre = (f: number): void => zoom(f, size.current.w / 2, size.current.h / 2);
  return (
    <div className="cad-view">
      <div ref={wrap} className="cad-canvas">
        <canvas ref={canvas} aria-label={labels.canvas} />
      </div>
      <div className="cad-tools">
        <button type="button" className="btn btn-sm" onClick={() => centre(1.4)} aria-label={labels.zoomIn}>+</button>
        <button type="button" className="btn btn-sm" onClick={() => centre(1 / 1.4)} aria-label={labels.zoomOut}>−</button>
        <button type="button" className="btn btn-sm" onClick={fit}>{labels.fit}</button>
      </div>
    </div>
  );
}
