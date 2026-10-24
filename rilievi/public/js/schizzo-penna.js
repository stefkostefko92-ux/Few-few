// The freehand tools of the sketch editor: the pen (the raw points while drawing, simplified when the
// stroke ends — schizzo-tracciati.js; its points do not snap) and the eraser (what it passes over goes when
// it is let go). Every stroke goes through the rules of the server (schizzo-regole.js).
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { view, regole, simplify, pathsOf } = ed;
  const SIMPLIFY = 1.2;
  const round = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });

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
    gomma: eraser(),
  });
})();
