// The handles of the one element selected in the sketch editor (schizzo-selezione.js): where they are and
// what dragging them makes of the element — the ends of a dimension, an arrow or a straight line; the
// corner of a symbol or an ellipse (its size), drawn a little outside it so the finger does not hide it.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { shared, view } = ed;

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
  // The point that `reshaped` turns into the present size — the size handle moves from it, so grabbing
  // the handle (drawn a little outside the corner) does not change anything yet.
  const sizePointOf = (el) => {
    if (el.t === 'e') return { x: el.x + el.rx, y: el.y + el.ry };
    const [dx, dy] = el.r % 2 ? [el.h / 2, el.w / 2] : [el.w / 2, el.h / 2];
    return { x: el.x + dx, y: el.y + dy };
  };

  ed.maniglie = { handlesOf, reshaped, sizePointOf };
})();
