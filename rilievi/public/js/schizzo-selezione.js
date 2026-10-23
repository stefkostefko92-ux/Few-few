// The select tool of the sketch editor. A tap selects what is under it — texts, dimensions and callouts
// before arrows, symbols, ellipses and lines, the topmost first; a second tap on the same spot takes the
// next one below. "Seleziona più" (or Shift) adds to the selection. A drag on the empty sheet selects
// what its box touches; a drag on the selection moves it, the grabbed point snapping. One element has
// handles: the ends of a dimension, an arrow or a straight line; the corner of a symbol or an ellipse
// (its size); the line of a dimension (its offset). A tap on a selected text, dimension or callout
// edits it. The actions on the selection — schizzo-azioni.js.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { regole, shared, view } = ed;
  const ORDER = ['x', 'q', 'a', 's', 'e', 'p'];
  let selection = [];
  let action = null;
  let lastTap = null;

  const multi = () => ed.dialog.querySelector('#schizzo-piu').checked;
  const union = (list) => {
    const boxes = list.map(shared.boundsOf);
    return {
      x0: Math.min(...boxes.map((b) => b.x0)),
      y0: Math.min(...boxes.map((b) => b.y0)),
      x1: Math.max(...boxes.map((b) => b.x1)),
      y1: Math.max(...boxes.map((b) => b.y1)),
    };
  };
  const inside = (p, b, pad) =>
    p.x >= b.x0 - pad && p.x <= b.x1 + pad && p.y >= b.y0 - pad && p.y <= b.y1 + pad;
  // Everything under the point, in the order a finger means it.
  const candidates = (p) => {
    const radius = ed.tol('hit');
    const hits = ed.elements.filter((el) =>
      el.t === 's' ? inside(p, shared.boundsOf(el), radius) : shared.hitOf(el, p, radius),
    );
    return hits.reverse().sort((a, b) => ORDER.indexOf(a.t) - ORDER.indexOf(b.t));
  };

  // The point of an element nearest the finger — the one that snaps when it moves.
  const keyOf = (el, p) => {
    const points = regole.snapPointsOf(el);
    if (!points.length) return { x: p.x, y: p.y };
    const [x, y] = points.reduce((best, q) =>
      Math.hypot(q[0] - p.x, q[1] - p.y) < Math.hypot(best[0] - p.x, best[1] - p.y) ? q : best,
    );
    return { x, y };
  };

  // The handles of a single element: where they are and what dragging them changes.
  const isLine = (el) => el.t === 'p' && /^M\d+ \d+l-?\d+ -?\d+$/.test(el.d);
  const handlesOf = (el) => {
    if (el.t === 'q' || el.t === 'a') {
      return [
        { key: 'a', x: el.x1, y: el.y1 },
        { key: 'b', x: el.x2, y: el.y2 },
      ];
    }
    if (isLine(el)) {
      const [[x1, y1], [x2, y2]] = ed.forme.puntiDi(el.d);
      return [
        { key: 'a', x: x1, y: y1 },
        { key: 'b', x: x2, y: y2 },
      ];
    }
    if (el.t === 's' || el.t === 'e') {
      // Outside the corner when the element is small on the screen — the finger does not hide it.
      const box = shared.boundsOf(el);
      const gap = 16 * ed.vista.unitsPerPx();
      return [{ key: 'size', x: box.x1 + gap, y: box.y1 + gap }];
    }
    return [];
  };
  // The element with handle `key` dragged to `p`.
  const reshaped = (el, key, p) => {
    if (key === 'size') {
      const dx = Math.abs(p.x - el.x);
      const dy = Math.abs(p.y - el.y);
      if (el.t === 'e') {
        return el.rx === el.ry
          ? { ...el, rx: Math.max(dx, dy), ry: Math.max(dx, dy) }
          : { ...el, rx: dx, ry: dy };
      }
      const [sx, sy] = el.r % 2 ? [dy, dx] : [dx, dy];
      const def = view.simboli[el.n];
      if (def && def.proporzionale) {
        const k = Math.max((2 * sx) / def.misura[0], (2 * sy) / def.misura[1]);
        return { ...el, w: def.misura[0] * k, h: def.misura[1] * k };
      }
      return { ...el, w: 2 * sx, h: 2 * sy };
    }
    if (el.t === 'q' || el.t === 'a') {
      return key === 'a' ? { ...el, x1: p.x, y1: p.y } : { ...el, x2: p.x, y2: p.y };
    }
    const [[x1, y1], [x2, y2]] = ed.forme.puntiDi(el.d);
    const [a, b] = key === 'a' ? [p, { x: x2, y: y2 }] : [{ x: x1, y: y1 }, p];
    return { ...el, d: `M${a.x} ${a.y}l${b.x - a.x} ${b.y - a.y}` };
  };

  const decorate = (box) => {
    ed.setDecor((ctx, px) => {
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = '#1565c0';
      ctx.setLineDash([6 * px, 4 * px]);
      selection.forEach((el) => {
        const b = shared.boundsOf(el);
        ctx.strokeRect(b.x0 - 4 * px, b.y0 - 4 * px, b.x1 - b.x0 + 8 * px, b.y1 - b.y0 + 8 * px);
      });
      if (box) ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      ctx.setLineDash([]);
      if (selection.length === 1 && !action) {
        handlesOf(selection[0]).forEach((h) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(h.x - 7 * px, h.y - 7 * px, 14 * px, 14 * px);
          ctx.strokeRect(h.x - 7 * px, h.y - 7 * px, 14 * px, 14 * px);
        });
      }
    });
  };
  const select = (list) => {
    selection = list.filter((el) => ed.elements.includes(el));
    // The frames are drawn by the select tool only — another tool keeps its own marks.
    if (ed.tool === tool) decorate(null);
    ed.selectionChanged(selection);
  };
  // After a commit: the new objects in place of the old ones (same positions in the sheet).
  // The next selection is taken before the commit: its sync drops the old objects.
  const replace = (pairs) => {
    const map = new Map(pairs);
    const next = selection.map((el) => (map.has(el) ? map.get(el) : el));
    if (ed.commit(ed.elements.map((el) => (map.has(el) ? map.get(el) : el)))) {
      select(next);
      return true;
    }
    return false;
  };

  const tool = {
    hint: 'seleziona',
    down(p, event) {
      const handle =
        selection.length === 1 &&
        handlesOf(selection[0]).find((h) => Math.hypot(h.x - p.x, h.y - p.y) <= ed.tol('handle'));
      if (handle) {
        action = { kind: 'handle', key: handle.key, el: selection[0], from: p, moved: false };
        return;
      }
      const single = selection.length === 1 ? selection[0] : null;
      if (single && single.t === 'q' && shared.hitOf(single, p, ed.tol('hit'))) {
        action = { kind: 'offset', el: single, from: p, moved: false };
        return;
      }
      const under = candidates(p);
      const onSelection = under.find((el) => selection.includes(el));
      if (onSelection) {
        action = { kind: 'move', from: p, key: keyOf(onSelection, p), moved: false, dx: 0, dy: 0 };
        return;
      }
      const add = multi() || (event && event.shiftKey);
      if (under.length) {
        const again = lastTap && Math.hypot(lastTap.x - p.x, lastTap.y - p.y) <= ed.tol('slop');
        const index = again
          ? (under.indexOf(selection[selection.length - 1]) + 1) % under.length
          : 0;
        const el = under[index];
        lastTap = p;
        select(
          add
            ? selection.includes(el)
              ? selection.filter((s) => s !== el)
              : selection.concat([el])
            : [el],
        );
        action = { kind: 'picked', from: p, moved: false, key: keyOf(el, p), dx: 0, dy: 0 };
        return;
      }
      // Empty space: the selection goes on lifting (a second finger — the pinch — keeps it).
      lastTap = null;
      action = { kind: 'box', from: p, to: p, moved: false, add };
    },
    move(p) {
      if (!action) return;
      if (Math.hypot(p.x - action.from.x, p.y - action.from.y) > ed.tol('slop'))
        action.moved = true;
      if (!action.moved) return;
      if (action.kind === 'box') {
        action.to = p;
        decorate({
          x0: Math.min(action.from.x, p.x),
          y0: Math.min(action.from.y, p.y),
          x1: Math.max(action.from.x, p.x),
          y1: Math.max(action.from.y, p.y),
        });
      } else if (action.kind === 'move' || action.kind === 'picked') {
        const skip = new Set(selection);
        const raw = {
          x: action.key.x + p.x - action.from.x,
          y: action.key.y + p.y - action.from.y,
        };
        const snapped = ed.snap(raw, { skip });
        [action.dx, action.dy] = regole.limitMove(
          selection,
          snapped.p.x - action.key.x,
          snapped.p.y - action.key.y,
        );
        ed.snapKind(snapped.kind);
        ed.setHidden(skip);
        ed.setPreview(selection, action.dx, action.dy);
      } else if (action.kind === 'handle') {
        const snapped =
          action.key === 'size' ? { p: ed.round(p) } : ed.snap(p, { skip: new Set([action.el]) });
        action.next = regole.normalizza(reshaped(action.el, action.key, snapped.p));
        ed.setHidden(new Set([action.el]));
        ed.setPreview(action.next ? [action.next] : []);
      } else if (action.kind === 'offset') {
        const el = action.el;
        const o =
          Math.round(ed.offsetOf({ x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }, p) / 5) * 5;
        action.next = el.m === 'r' ? el : regole.normalizza({ ...el, o });
        ed.setHidden(new Set([el]));
        ed.setPreview(action.next ? [action.next] : []);
      }
    },
    up() {
      const done = action;
      action = null;
      if (!done) return;
      ed.setPreview([]);
      ed.setHidden(null);
      ed.snapKind(null);
      if (done.kind === 'box') {
        if (done.moved) {
          const box = {
            x0: Math.min(done.from.x, done.to.x),
            y0: Math.min(done.from.y, done.to.y),
            x1: Math.max(done.from.x, done.to.x),
            y1: Math.max(done.from.y, done.to.y),
          };
          const caught = ed.elements.filter((el) => {
            const b = shared.boundsOf(el);
            return b.x1 >= box.x0 && b.x0 <= box.x1 && b.y1 >= box.y0 && b.y0 <= box.y1;
          });
          select(
            done.add ? selection.concat(caught.filter((el) => !selection.includes(el))) : caught,
          );
        } else if (!done.add) select([]);
        else decorate(null);
        return;
      }
      if ((done.kind === 'move' || done.kind === 'picked') && done.moved && (done.dx || done.dy)) {
        replace(selection.map((el) => [el, regole.moved(el, done.dx, done.dy)]));
        return;
      }
      if (done.kind === 'move' && !done.moved && selection.length === 1) {
        const el = selection[0];
        if (el.t === 'x' || el.t === 'q' || (el.t === 'a' && el.v)) ed.editText(el);
        return;
      }
      if ((done.kind === 'handle' || done.kind === 'offset') && done.moved && done.next) {
        replace([[done.el, done.next]]);
        return;
      }
      decorate(null);
    },
    cancel() {
      action = null;
      ed.setPreview([]);
      ed.setHidden(null);
      decorate(null);
    },
  };

  ed.tools = Object.assign(ed.tools || {}, { seleziona: tool });
  ed.selection = {
    get: () => selection,
    set: select,
    replace,
    clear: () => select([]),
    // The sheet changed under the selection (undo, redo): keep only what is still there.
    sync: () => select(selection),
  };
})();
