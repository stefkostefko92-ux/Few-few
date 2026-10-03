'use client';

// Zoom and move for a drawing on the whole screen: the stage is drawn wider (its width is the fitted width times the
// zoom, in CSS) inside a scrolling viewport, so the browser keeps the lettering sharp and the buttons over the
// dimensions where they are. The point under the cursor, the fingers or the middle of the screen stays where it is
// while the zoom changes. One finger or the mouse drags the drawing; two fingers zoom; Ctrl with the wheel (and a
// touchpad's pinch, which the browser sends as one) zooms, the wheel alone scrolls. A drag is not a click: the button
// of a dimension under it does not open.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
/** one step of the buttons and the keys */
export const ZOOM_STEP = 1.25;

const clamp = (z: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
// a movement shorter than this is a click [px]
const DRAG = 5;

interface Anchor {
  /** where the anchor is in the viewport [px], and the same point as a fraction of the stage */
  ax: number;
  ay: number;
  fx: number;
  fy: number;
}

export function useZoomPan(active: boolean) {
  const viewport = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  // the zoom at the time of an event (a wheel, two fingers): the handlers outlive the render that made them
  const zoomRef = useRef(1);
  const anchor = useRef<Anchor | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ x: number; y: number; sl: number; st: number; moved: boolean } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const swallow = useRef(false);

  /** zoom to `z` keeping the point (cx, cy) of the viewport where it is (default: its middle) */
  const zoomTo = useCallback((z: number, cx?: number, cy?: number): void => {
    const vp = viewport.current, st = stage.current, next = clamp(z);
    if (!vp || !st) return;
    const v = vp.getBoundingClientRect(), r = st.getBoundingClientRect();
    const ax = cx ?? v.width / 2, ay = cy ?? v.height / 2;
    anchor.current = { ax, ay, fx: r.width ? (v.left + ax - r.left) / r.width : 0.5, fy: r.height ? (v.top + ay - r.top) / r.height : 0.5 };
    setZoom(next);
  }, []);
  const zoomBy = useCallback((k: number, cx?: number, cy?: number): void => zoomTo(zoom * k, cx, cy), [zoom, zoomTo]);
  const fit = useCallback((): void => { anchor.current = null; setZoom(1); }, []);

  // after the stage got its new width: the anchored point back under the cursor
  useLayoutEffect(() => {
    zoomRef.current = zoom;
    const a = anchor.current, vp = viewport.current, st = stage.current;
    anchor.current = null;
    if (!a || !vp || !st) return;
    const v = vp.getBoundingClientRect(), r = st.getBoundingClientRect();
    vp.scrollLeft += r.left + a.fx * r.width - (v.left + a.ax);
    vp.scrollTop += r.top + a.fy * r.height - (v.top + a.ay);
  }, [zoom]);

  // Ctrl + wheel (and a touchpad's pinch) zooms: a listener that may cancel the page's own zoom
  useEffect(() => {
    const vp = viewport.current;
    if (!active || !vp) return;
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const v = vp.getBoundingClientRect();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.002), e.clientX - v.left, e.clientY - v.top);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [active, zoomTo]);

  // a gesture cut short by the full screen closing is forgotten (the zoom starts fitted when it opens again: `fit`)
  useEffect(() => { if (!active) { pointers.current.clear(); drag.current = null; pinch.current = null; } }, [active]);

  const inField = (t: EventTarget | null): boolean => t instanceof Element && !!t.closest('input, select, textarea, button, .ed-pop');
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const vp = viewport.current;
    if (!active || !vp || (e.pointerType === 'mouse' && e.button !== 0) || inField(e.target)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [p, q] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(p.x - q.x, p.y - q.y) || 1, z: zoomRef.current };
      drag.current = null;
    } else if (pointers.current.size === 1) drag.current = { x: e.clientX, y: e.clientY, sl: vp.scrollLeft, st: vp.scrollTop, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const vp = viewport.current;
    if (!active || !vp || !pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size >= 2) {
      const [p, q] = [...pointers.current.values()], v = vp.getBoundingClientRect();
      swallow.current = true;
      zoomTo(pinch.current.z * (Math.hypot(p.x - q.x, p.y - q.y) / pinch.current.d), (p.x + q.x) / 2 - v.left, (p.y + q.y) / 2 - v.top);
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG) return;
    if (!d.moved) {
      d.moved = true;
      vp.setPointerCapture(e.pointerId);
    }
    vp.scrollLeft = d.sl - dx;
    vp.scrollTop = d.st - dy;
  };
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (drag.current?.moved) swallow.current = true;
    if (pointers.current.size < 2) pinch.current = null;
    if (!pointers.current.size) drag.current = null;
    if (viewport.current?.hasPointerCapture(e.pointerId)) viewport.current.releasePointerCapture(e.pointerId);
  };
  // the click that ends a drag or a pinch is not a click on the drawing
  const onClickCapture = (e: ReactMouseEvent): void => {
    if (!swallow.current) return;
    swallow.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  return {
    viewport, stage, zoom: active ? zoom : 1, zoomTo, zoomBy, fit,
    handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd, onClickCapture },
  };
}
