// Snapping in the sketch editor ("Aggancio", on by default): a point goes to the nearest point of what is
// drawn (path vertices, ellipse centre and quadrants, ends of arrows and dimensions, symbol corners and
// centre) within the tolerance of the pointer; otherwise a straight segment goes to 0/45/90° within 7°;
// otherwise the point rounds to the grid — 25 units, or 50 when 25 would be under 12 CSS pixels on the
// screen. Points outside the sheet are never targets, and the result stays inside the sheet.
(() => {
  'use strict';

  window.rilieviSchizzoAggancio = (view, regole) => {
    const W = view.larghezza;
    const H = view.altezza;
    const ANGLE = (7 * Math.PI) / 180;
    const STEP = Math.PI / 4;
    const points = new WeakMap();
    const pointsOf = (el) => {
      if (!points.has(el)) {
        points.set(
          el,
          regole.snapPointsOf(el).filter(([x, y]) => x >= 0 && x <= W && y >= 0 && y <= H),
        );
      }
      return points.get(el);
    };
    const inside = (p) => ({
      x: Math.min(W, Math.max(0, Math.round(p.x))),
      y: Math.min(H, Math.max(0, Math.round(p.y))),
    });

    // `elements` to snap to (`skip`: those being moved), `from` — the start of a straight segment,
    // `tolerance` in sheet units, `unitsPerPx` — for the grid step.
    const snap = (raw, { on, elements, skip, from, tolerance, unitsPerPx }) => {
      if (!on) return { p: inside(raw), kind: null };
      let best = null;
      let bestD = tolerance;
      for (const el of elements) {
        if (skip && skip.has(el)) continue;
        for (const [x, y] of pointsOf(el)) {
          const d = Math.hypot(x - raw.x, y - raw.y);
          if (d < bestD) {
            bestD = d;
            best = { x, y };
          }
        }
      }
      // Whole units like every other point (a symbol's corner can fall on a half).
      if (best) return { p: inside(best), kind: 'punto' };
      if (from) {
        const dx = raw.x - from.x;
        const dy = raw.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const angle = Math.atan2(dy, dx);
          const snapped = Math.round(angle / STEP) * STEP;
          if (Math.abs(angle - snapped) < ANGLE) {
            const p = inside({
              x: from.x + Math.cos(snapped) * length,
              y: from.y + Math.sin(snapped) * length,
            });
            return { p, kind: 'angolo' };
          }
        }
      }
      const step = 25 / unitsPerPx < 12 ? 50 : 25;
      return {
        p: inside({ x: Math.round(raw.x / step) * step, y: Math.round(raw.y / step) * step }),
        kind: 'griglia',
      };
    };

    return Object.freeze({ snap });
  };
})();
