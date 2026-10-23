// The tools of the sketch editor that end with a value to type: text, callout and dimension.
// - Text: a tap places it, the value bar (above the sheet) takes it; a tap on a text edits it.
// - Callout: drag from the detail to where the text goes, then type (no text — an arrow).
// - Dimension: drag between the two points; then drag to pull the line out (a tap — 50 units away from
//   the drawing, or in line with the previous dimension of a chain); then the number (empty — "?",
//   measured later). A tap on a dimension edits its number.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { regole } = ed;
  const round = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > ed.tol('slop');
  const OFFSET = 50;

  // The topmost element of these kinds under the point, if any.
  const pick = (p, kinds) => {
    const radius = ed.tol('hit');
    for (let i = ed.elements.length - 1; i >= 0; i -= 1) {
      const el = ed.elements[i];
      if (kinds.includes(el.t) && (el.t !== 'a' || el.v) && ed.shared.hitOf(el, p, radius))
        return el;
    }
    return null;
  };
  // Edit the text of an element in the value bar; the element is replaced where it stands (and stays
  // selected, if it was).
  const editText = (el) => {
    ed.valueBar.open({
      mode: el.t === 'q' ? 'quota' : el.t === 'a' ? 'richiamo' : 'testo',
      value: el.v || '',
      onOk: (text) => {
        const next = regole.normalizza({ ...el, v: text });
        if (next && ed.elements.includes(el)) ed.selection.replace([[el, next]]);
      },
    });
  };

  const text = () => {
    let downAt = null;
    return {
      hint: 'testo',
      down(p) {
        downAt = p;
      },
      move() {},
      up(p) {
        if (!downAt || far(p, downAt)) return;
        downAt = null;
        const existing = pick(p, ['x']);
        if (existing) return editText(existing);
        const at = round(p);
        // The bar first: closing a previous one clears its mark, not this one.
        ed.valueBar.open({
          mode: 'testo',
          value: '',
          onOk: (v) => ed.add({ t: 'x', c: ed.style().c, s: ed.style().s, x: at.x, y: at.y, v }),
          onClose: () => ed.setDecor(null),
        });
        ed.setDecor((ctx, px) => ed.shared.paintMark(ctx, at, ed.style().c, px));
      },
      cancel() {
        downAt = null;
      },
    };
  };

  // The perpendicular distance of a point from the line a→b, signed like the dimension's offset.
  const offsetOf = (a, b, p) => {
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    return ((p.x - a.x) * -(b.y - a.y) + (p.y - a.y) * (b.x - a.x)) / length;
  };

  const callout = () => {
    let start = null;
    let end = null;
    let downAt = null;
    let moved = false;
    const shape = () => ({ t: 'a', ...ed.style(), x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    return {
      hint: 'richiamo',
      hover(p) {
        ed.ring(ed.snap(p));
      },
      down(p) {
        start = ed.snap(p).p;
        end = start;
        downAt = p;
        moved = false;
      },
      move(p) {
        if (!start) return;
        if (far(p, downAt)) moved = true;
        const snapped = ed.snap(p, { from: start });
        end = snapped.p;
        ed.ring(snapped);
        if (moved) ed.setPreview([shape()]);
      },
      up(p) {
        if (!start) return;
        // Two ends that snapped into one point are no arrow.
        const el = moved && (end.x !== start.x || end.y !== start.y) ? shape() : null;
        start = null;
        ed.ring(null);
        if (!el) {
          ed.setPreview([]);
          const existing = !moved && pick(p, ['a']);
          if (existing) editText(existing);
          return;
        }
        // The bar first: closing a previous one clears its preview, not this one.
        ed.valueBar.open({
          mode: 'richiamo',
          value: '',
          onOk: (v) => ed.add({ ...el, v }),
          onClose: () => ed.setPreview([]),
        });
        ed.setPreview([el]);
      },
      cancel() {
        start = null;
        ed.setPreview([]);
      },
    };
  };

  // The dimension: `phase` 1 — the two points, 2 — the offset, 3 — the number in the value bar.
  const dimension = () => {
    let phase = 0;
    let a = null;
    let b = null;
    let o = 0;
    let downAt = null;
    let moved = false;
    let last = null;
    const shape = () => ({ t: 'q', ...ed.style(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, o, v: '?' });
    const show = () => ed.setPreview(a && b && (a.x !== b.x || a.y !== b.y) ? [shape()] : []);
    // Where a tap puts the line: in line with the previous one of a chain, else away from the drawing.
    const defaultOffset = () => {
      if (last && last.b.x === a.x && last.b.y === a.y) {
        const turn = Math.abs(
          Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(last.b.y - last.a.y, last.b.x - last.a.x),
        );
        if (turn < (7 * Math.PI) / 180) return last.o;
      }
      const centre = ed.centre();
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const side = centre
        ? Math.sign(offsetOf(a, b, { x: 2 * mx - centre.x, y: 2 * my - centre.y }))
        : -1;
      return (side || -1) * OFFSET;
    };
    const ask = () => {
      phase = 3;
      ed.hint('quotaValore');
      const el = shape();
      ed.valueBar.open({
        mode: 'quota',
        value: '',
        onOk: (v) => {
          const added = ed.add({ ...el, v });
          if (added)
            last = { a: { x: added.x1, y: added.y1 }, b: { x: added.x2, y: added.y2 }, o: added.o };
        },
        onClose: () => {
          phase = 0;
          a = b = null;
          ed.setPreview([]);
          ed.hint('quota');
        },
      });
    };
    const tool = {
      hint: 'quota',
      hover(p) {
        if (phase === 2) {
          o = regole.offsetInside(
            { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
            Math.round(offsetOf(a, b, p) / 25) * 25,
          );
          show();
        } else if (phase < 2) ed.ring(ed.snap(p));
      },
      down(p) {
        downAt = p;
        moved = false;
        if (phase === 0) {
          a = ed.snap(p).p;
          b = a;
          phase = 1;
        }
      },
      move(p) {
        if (far(p, downAt)) moved = true;
        if (phase === 1) {
          const snapped = ed.snap(p, { from: a });
          b = snapped.p;
          ed.ring(snapped);
          if (moved) show();
        } else if (phase === 2 && moved) {
          tool.hover(p);
        }
      },
      up(p) {
        if (phase === 1) {
          ed.ring(null);
          // A tap (an existing dimension is edited) or two points snapped into one: nothing to measure.
          if (!moved || (a.x === b.x && a.y === b.y)) {
            phase = 0;
            a = b = null;
            ed.setPreview([]);
            const existing = !moved && pick(p, ['q']);
            if (existing) editText(existing);
            return;
          }
          phase = 2;
          o = regole.offsetInside({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, 0);
          ed.hint('quotaStacco');
          show();
          return;
        }
        if (phase === 2) {
          // A finger that only tapped takes the default; a mouse or a stylus kept what it hovered.
          if (!moved && ed.pointerType === 'touch') {
            o = regole.offsetInside({ x1: a.x, y1: a.y, x2: b.x, y2: b.y }, defaultOffset());
          }
          show();
          ask();
        }
      },
      cancel() {
        // A second finger: the points already set stay.
        if (phase === 1) {
          phase = 0;
          a = b = null;
          ed.setPreview([]);
        }
      },
      // Another tool or the editor closed: a dimension without its number is dropped (its number
      // being typed is taken or dropped by the value bar).
      flush() {
        if (phase !== 1 && phase !== 2) return;
        phase = 0;
        a = b = null;
        ed.setPreview([]);
        ed.hint('quota');
      },
      undo() {
        if (phase === 0) return false;
        ed.valueBar.close();
        phase = 0;
        a = b = null;
        ed.setPreview([]);
        ed.hint('quota');
        return true;
      },
    };
    return tool;
  };

  ed.tools = Object.assign(ed.tools || {}, {
    testo: text(),
    richiamo: callout(),
    quota: dimension(),
  });
  ed.editText = editText;
  ed.pick = pick;
  ed.offsetOf = offsetOf;
  ed.round = round;
})();
