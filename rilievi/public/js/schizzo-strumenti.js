// The drawing tools of the sketch editor that work with one drag: pen, line, rectangle, circle (centre,
// then radius), ellipse (its box), arrow (tail, then tip), symbol (its box — a tap places it at its
// usual size) and eraser. Points snap (schizzo-aggancio.js) except the pen's; a drag shorter than the
// pointer's slop is a tap and draws nothing (a finger never leaves slivers). Every element goes through
// the rules of the server (schizzo-regole.js) before it is committed. The tools with a value to type and
// the polyline — schizzo-testi.js.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { view, regole } = ed;
  const SIMPLIFY = 1.2;
  const round = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > ed.tol('slop');

  // The snap ring (CSS pixels, whatever the zoom) and what it caught, in the hint line.
  const ring = (snapped) => {
    ed.snapKind(snapped && snapped.kind);
    ed.setDecor(
      snapped && snapped.kind
        ? (ctx, px) => {
            ctx.lineWidth = 2 * px;
            ctx.strokeStyle = '#1565c0';
            ctx.beginPath();
            ctx.arc(snapped.p.x, snapped.p.y, 10 * px, 0, Math.PI * 2);
            ctx.stroke();
          }
        : null,
    );
  };

  // A new element at the end of the sheet, in the shape the server takes.
  const add = (el) => {
    const ready = regole.normalizza(el);
    return ready && ed.commit(ed.elements.concat([ready])) ? ready : null;
  };

  // Ramer–Douglas–Peucker: the points that keep the shape of the stroke within `eps` sheet units.
  const simplify = (pts, eps) => {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const dx = pts[b].x - pts[a].x;
      const dy = pts[b].y - pts[a].y;
      const length = Math.hypot(dx, dy);
      let farthest = 0;
      let index = -1;
      for (let i = a + 1; i < b; i += 1) {
        const px = pts[i].x - pts[a].x;
        const py = pts[i].y - pts[a].y;
        const d = length ? Math.abs(dx * py - dy * px) / length : Math.hypot(px, py);
        if (d > farthest) {
          farthest = d;
          index = i;
        }
      }
      if (farthest > eps) {
        keep[index] = 1;
        stack.push([a, index], [index, b]);
      }
    }
    return pts.filter((_, i) => keep[i]);
  };

  // The paths of points: "M x y" and relative "l dx dy", at most `maxSegmenti` segments each (the
  // server's limit) — each next one starts where the last one ended. A dot is "l0 0".
  const pathsOf = (pts, closed = false) => {
    const paths = [];
    for (let from = 0; from === 0 || from < pts.length - 1; from += view.maxSegmenti) {
      const part = pts.slice(from, from + view.maxSegmenti + 1);
      let d = `M${part[0].x} ${part[0].y}`;
      if (part.length === 1) d += 'l0 0';
      for (let i = 1; i < part.length; i += 1) {
        d += `l${part[i].x - part[i - 1].x} ${part[i].y - part[i - 1].y}`;
      }
      paths.push(d);
    }
    if (closed && paths.length === 1) paths[0] += 'z';
    return paths;
  };

  const pen = () => {
    let points = null;
    let current = null;
    return {
      hint: 'penna',
      down(p) {
        const style = ed.style();
        points = [round(p)];
        current = { t: 'p', ...style, raw: points };
        ed.setPreview([current]);
      },
      move(p) {
        if (!points) return;
        const q = round(p);
        const last = points[points.length - 1];
        if (q.x !== last.x || q.y !== last.y) points.push(q);
        ed.setPreview([current]);
      },
      up() {
        if (!points) return;
        const { c, s, k } = current;
        const inside = simplify(points, SIMPLIFY).map((q) => ({
          x: Math.min(view.larghezza, Math.max(0, q.x)),
          y: Math.min(view.altezza, Math.max(0, q.y)),
        }));
        points = null;
        current = null;
        ed.setPreview([]);
        const strokes = pathsOf(inside).map((d) => regole.normalizza({ t: 'p', c, s, k, d }));
        if (strokes.every(Boolean)) ed.commit(ed.elements.concat(strokes));
      },
      cancel() {
        points = null;
        current = null;
        ed.setPreview([]);
      },
    };
  };

  // A tool of one drag: `make(start, end)` gives the element (or null); `angle` — the end snaps to
  // 0/45/90° from the start; `tap(point)` — what a tap does (nothing by default).
  const drag = ({ hint, make, angle = false, snapEnd = true, tap = null, after = null }) => {
    let start = null;
    let end = null;
    let downAt = null;
    let moved = false;
    const reset = () => {
      start = null;
      end = null;
      moved = false;
      ed.setPreview([]);
      ring(null);
    };
    return {
      hint,
      hover(p) {
        ring(ed.snap(p));
      },
      leave() {
        ring(null);
      },
      down(p) {
        const snapped = ed.snap(p);
        start = snapped.p;
        end = start;
        downAt = p;
        moved = false;
        ring(snapped);
      },
      move(p) {
        if (!start) return;
        if (far(p, downAt)) moved = true;
        const snapped = snapEnd ? ed.snap(p, { from: angle ? start : null }) : { p: round(p) };
        end = snapped.p;
        ring(snapped);
        const el = moved ? make(start, end, ed.style()) : null;
        ed.setPreview(el ? [el] : []);
      },
      up() {
        if (!start) return;
        const [a, b, wasMoved] = [start, end, moved];
        reset();
        if (!wasMoved) {
          if (tap) tap(a);
          return;
        }
        const el = make(a, b, ed.style());
        const added = el && add(el);
        if (added && after) after(added);
      },
      cancel: reset,
    };
  };

  const line = (a, b, style) =>
    a.x === b.x && a.y === b.y
      ? null
      : { t: 'p', ...style, d: `M${a.x} ${a.y}l${b.x - a.x} ${b.y - a.y}` };
  const rect = (a, b, style) => {
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    if (!w || !h) return null;
    return {
      t: 'p',
      ...style,
      d: `M${Math.min(a.x, b.x)} ${Math.min(a.y, b.y)}l${w} 0l0 ${h}l${-w} 0z`,
    };
  };
  const circle = (a, b, style) => {
    const r = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    return r ? { t: 'e', ...style, x: a.x, y: a.y, rx: r, ry: r } : null;
  };
  const ellipse = (a, b, style) => {
    const rx = Math.round(Math.abs(b.x - a.x) / 2);
    const ry = Math.round(Math.abs(b.y - a.y) / 2);
    if (!rx || !ry) return null;
    return {
      t: 'e',
      ...style,
      x: Math.round((a.x + b.x) / 2),
      y: Math.round((a.y + b.y) / 2),
      rx,
      ry,
    };
  };
  const arrow = (a, b, style) =>
    a.x === b.x && a.y === b.y ? null : { t: 'a', ...style, x1: b.x, y1: b.y, x2: a.x, y2: a.y };

  // A symbol in the box of the drag, or at its usual size where tapped; the proportional ones keep
  // the ratio of their usual size. After it, the selection — to move, turn or mirror it at once.
  const symbol = (a, b, style) => {
    const name = ed.symbolName();
    const def = view.simboli[name];
    if (!def) return null;
    let w = Math.abs(b.x - a.x);
    let h = Math.abs(b.y - a.y);
    if (def.proporzionale) {
      const k = Math.max(w / def.misura[0], h / def.misura[1]);
      w = def.misura[0] * k;
      h = def.misura[1] * k;
    }
    if (w < 10 || h < 10) return null;
    const x = a.x + (Math.sign(b.x - a.x) * w) / 2;
    const y = a.y + (Math.sign(b.y - a.y) * h) / 2;
    return { t: 's', ...style, n: name, x, y, w, h, r: 0 };
  };
  const placeSymbol = (p) => {
    const def = view.simboli[ed.symbolName()];
    if (!def) return;
    const [w, h] = def.misura;
    const added = add({ t: 's', ...ed.style(), n: ed.symbolName(), x: p.x, y: p.y, w, h, r: 0 });
    if (added) ed.selectNew([added]);
  };

  const eraser = () => {
    let erased = null;
    const rub = (p) => {
      const radius = ed.tol('hit');
      const took = ed.elements.filter((el) => !erased.has(el) && ed.shared.hitOf(el, p, radius));
      if (!took.length) return;
      took.forEach((el) => erased.add(el));
      ed.setHidden(new Set(erased));
    };
    return {
      hint: 'gomma',
      down(p) {
        erased = new Set();
        rub(p);
      },
      move(p) {
        if (erased) rub(p);
      },
      up() {
        if (!erased) return;
        const gone = erased;
        erased = null;
        ed.setHidden(null);
        if (gone.size) ed.commit(ed.elements.filter((el) => !gone.has(el)));
      },
      cancel() {
        erased = null;
        ed.setHidden(null);
      },
    };
  };

  ed.tools = Object.assign(ed.tools || {}, {
    penna: pen(),
    linea: drag({ hint: 'linea', make: line, angle: true }),
    rettangolo: drag({ hint: 'rettangolo', make: rect }),
    cerchio: drag({ hint: 'cerchio', make: circle }),
    ellisse: drag({ hint: 'ellisse', make: ellipse }),
    freccia: drag({ hint: 'freccia', make: arrow, angle: true }),
    simbolo: drag({
      hint: 'simbolo',
      make: symbol,
      tap: placeSymbol,
      after: (added) => ed.selectNew([added]),
    }),
    gomma: eraser(),
  });
  ed.pathsOf = pathsOf;
  ed.add = add;
  ed.ring = ring;
})();
