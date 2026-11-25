// The polyline tool of the sketch editor: each point goes where the finger (or the button) is let go,
// with a rubber band and the snap ring while it moves. A tap on the last point ends the line; a tap on
// the first one, once there are three, closes it into a polygon; a double tap ends it without a new
// point; "Fine" and "Chiudi" in the bar do the same; Annulla takes back the last point. Switching tool,
// "Fatto" or closing the editor keep a line of two points or more — it is never dropped unseen.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const DOUBLE_TAP = 350;
  let points = [];
  let cursor = null;
  let downAt = null;
  let lastTap = { at: 0, p: null };

  const near = (a, b) => a && b && Math.hypot(a.x - b.x, a.y - b.y) <= ed.tol('hit');
  const shape = (pts, closed = false) => ({
    t: 'p',
    ...ed.style(),
    d: `M${pts[0].x} ${pts[0].y}${pts
      .slice(1)
      .map((p, i) => `l${p.x - pts[i].x} ${p.y - pts[i].y}`)
      .join('')}${closed ? 'z' : ''}`,
  });
  const show = () => {
    const pts = cursor ? points.concat([cursor]) : points;
    ed.setPreview(pts.length > 1 ? [shape(pts)] : []);
    ed.setDecor((ctx, px) => {
      // The first point as a ring once the shape can be closed on it.
      if (points.length >= 3) {
        ctx.lineWidth = 2 * px;
        ctx.strokeStyle = '#1565c0';
        ctx.beginPath();
        ctx.arc(points[0].x, points[0].y, 12 * px, 0, Math.PI * 2);
        ctx.stroke();
      }
      points.forEach((p) => {
        ctx.fillStyle = '#1565c0';
        ctx.fillRect(p.x - 3 * px, p.y - 3 * px, 6 * px, 6 * px);
      });
    });
    ed.polyline(points.length > 0, points.length >= 3);
  };
  const clear = () => {
    points = [];
    cursor = null;
    ed.setPreview([]);
    ed.setDecor(null);
    ed.polyline(false, false);
    ed.hint('polilinea');
  };
  // The line as it is: open, or closed into a polygon. Fewer than two points — nothing.
  const finish = (closed = false) => {
    const pts = points;
    clear();
    if (pts.length < 2) return;
    const parts = closed
      ? [shape(pts, true)]
      : ed.pathsOf(pts).map((d) => ({ t: 'p', ...ed.style(), d }));
    const ready = parts.map((el) => ed.regole.normalizza(el));
    if (ready.every(Boolean)) ed.commit(ed.elements.concat(ready));
  };

  ed.tools = Object.assign(ed.tools || {}, {
    polilinea: {
      hint: 'polilinea',
      hover(p) {
        const snapped = ed.snap(p, { from: points[points.length - 1] || null });
        cursor = points.length ? snapped.p : null;
        ed.snapKind(snapped.kind);
        show();
      },
      leave() {
        cursor = null;
        if (points.length) show();
      },
      down(p) {
        downAt = p;
        this.move(p);
      },
      move(p) {
        const snapped = ed.snap(p, { from: points[points.length - 1] || null });
        cursor = snapped.p;
        ed.snapKind(snapped.kind);
        show();
      },
      up(p) {
        const tap = downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) <= ed.tol('slop');
        const point = cursor || ed.round(p);
        const now = performance.now();
        const double = tap && now - lastTap.at < DOUBLE_TAP && near(point, lastTap.p);
        lastTap = { at: now, p: point };
        downAt = null;
        cursor = null;
        if (double) return finish(false);
        // Where the finger is, not where it snapped: the grid may have moved it off the point.
        const on = (target) => near(p, target) || near(point, target);
        if (tap && points.length >= 3 && on(points[0])) return finish(true);
        if (tap && points.length >= 2 && on(points[points.length - 1])) return finish(false);
        const last = points[points.length - 1];
        if (!last || last.x !== point.x || last.y !== point.y) points.push(point);
        if (points.length >= ed.view.maxSegmenti + 1) return finish(false);
        ed.hint(points.length > 1 ? 'polilineaFine' : 'polilinea');
        show();
      },
      cancel() {
        // A second finger: the points already set stay, the one being placed goes.
        downAt = null;
        cursor = null;
        if (points.length) show();
      },
      undo() {
        if (!points.length) return false;
        points.pop();
        if (points.length) show();
        else clear();
        return true;
      },
      flush: () => finish(false),
      end: finish,
    },
  });
})();
