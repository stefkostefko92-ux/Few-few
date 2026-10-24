// The shapes of the sketch editor, each one drag: line, rectangle, circle (centre, then radius), ellipse
// (its box), arrow (tail, then tip), symbol (its box — a tap places it at its usual size). Points snap
// (schizzo-aggancio.js); a drag shorter than the pointer's slop is a tap, never a sliver — for a shape it
// is the first of two clicks (the start; the next tap ends the shape: a mouse on a computer clicks, it
// does not drag). Every element goes through the rules of the server (schizzo-regole.js) before it is
// committed. The pen and the eraser — schizzo-penna.js; the tools with a value to type —
// schizzo-testi.js, schizzo-quota.js; the polyline — schizzo-polilinea.js.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { view, regole } = ed;
  const round = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > ed.tol('slop');

  // The snap ring (CSS pixels, whatever the zoom) and what it caught, in the hint line; `from` — a start
  // set by a first click, marked with a small cross while the second one is awaited.
  const ring = (snapped, from = null) => {
    ed.snapKind(snapped && snapped.kind);
    const caught = snapped && snapped.kind ? snapped.p : null;
    ed.setDecor(
      caught || from
        ? (ctx, px) => {
            if (from) ed.shared.paintMark(ctx, from, ed.style().c, px);
            if (!caught) return;
            ctx.lineWidth = 2 * px;
            ctx.strokeStyle = '#1565c0';
            ctx.beginPath();
            ctx.arc(caught.x, caught.y, 10 * px, 0, Math.PI * 2);
            ctx.stroke();
          }
        : null,
    );
  };

  // A start waiting for its second click: the hint says so and Annulla can drop it (schizzo-comandi.js).
  const waitFor = (on, hint) => {
    if (ed.waiting) ed.waiting(on);
    ed.hint(on ? 'secondoPunto' : hint);
  };

  // A new element at the end of the sheet, in the shape the server takes.
  const add = (el) => {
    const ready = regole.normalizza(el);
    return ready && ed.commit(ed.elements.concat([ready])) ? ready : null;
  };

  // A tool of one drag: `make(start, end)` gives the element (or null); `angle` — the end snaps to
  // 0/45/90° from the start; `tap(point)` — what a tap does. Without one, a tap sets the start and the
  // shape follows the pointer until the next tap ends it (two clicks instead of a drag — the owner on a
  // computer, 24 October 2026: „non vedo le linee“); Annulla, Esc or another tool drop the start.
  const drag = ({ hint, make, angle = false, snapEnd = true, tap = null, after = null }) => {
    let start = null;
    let end = null;
    let downAt = null;
    let moved = false;
    let waiting = false;
    const endOf = (p) =>
      snapEnd ? ed.snap(p, { from: angle ? start : null }) : { p: round(p), kind: null };
    const reset = () => {
      if (waiting) waitFor(false, hint);
      start = null;
      end = null;
      moved = false;
      waiting = false;
      ed.setPreview([]);
      ring(null);
    };
    // The end of a shape whose start a first click set follows the pointer.
    const follow = (p) => {
      const snapped = endOf(p);
      end = snapped.p;
      ring(snapped, start);
      const el = make(start, end, ed.style());
      ed.setPreview(el ? [el] : []);
    };
    // A second click on the start itself is no shape: the start goes with it.
    const finish = () => {
      const el = make(start, end, ed.style());
      reset();
      const added = el && add(el);
      if (added && after) after(added);
    };
    return {
      hint,
      hover(p) {
        if (waiting) follow(p);
        else ring(ed.snap(p));
      },
      leave() {
        if (!waiting) ring(null);
      },
      down(p) {
        downAt = p;
        moved = false;
        if (waiting) {
          follow(p);
          return;
        }
        const snapped = ed.snap(p);
        start = snapped.p;
        end = start;
        ring(snapped);
      },
      move(p) {
        if (!start) return;
        if (far(p, downAt)) moved = true;
        if (waiting) {
          follow(p);
          return;
        }
        const snapped = endOf(p);
        end = snapped.p;
        ring(snapped);
        const el = moved ? make(start, end, ed.style()) : null;
        ed.setPreview(el ? [el] : []);
      },
      up(p) {
        if (!start) return;
        if (waiting) {
          follow(p);
          finish();
          return;
        }
        if (moved) {
          finish();
          return;
        }
        if (tap) {
          const a = start;
          reset();
          tap(a);
          return;
        }
        waiting = true;
        waitFor(true, hint);
        ed.setPreview([]);
        ring(null, start);
      },
      cancel: reset,
      // Annulla and Esc: a start waiting for its second click goes first.
      undo() {
        if (!waiting) return false;
        reset();
        return true;
      },
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

  ed.tools = Object.assign(ed.tools || {}, {
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
  });
  ed.add = add;
  ed.ring = ring;
  ed.waitFor = waitFor;
})();
