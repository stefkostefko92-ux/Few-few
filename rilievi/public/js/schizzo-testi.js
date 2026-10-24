// The tools of the sketch editor that end with a value to type: text and callout (the dimension —
// schizzo-quota.js).
// - Text: a tap places it, the value bar (above the sheet) takes it; a tap on a text edits it.
// - Callout: drag from the detail to where the text goes — or two clicks, the detail and then the place
//   of the text —, then type (no text — an arrow). A tap on a callout edits its text.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { regole } = ed;
  const round = (p) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > ed.tol('slop');

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
    // The detail set by a first click, the place of the text awaited (as the shapes, schizzo-strumenti.js).
    let waiting = false;
    // The detail caught on a point of the drawing: a tap there starts a callout, it edits nothing.
    let onPoint = false;
    const shape = () => ({ t: 'a', ...ed.style(), x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    const apart = () => end.x !== start.x || end.y !== start.y;
    const follow = (p) => {
      const snapped = ed.snap(p, { from: start });
      end = snapped.p;
      ed.ring(snapped, start);
      ed.setPreview(apart() ? [shape()] : []);
    };
    const stop = () => {
      if (waiting) ed.waitFor(false, 'richiamo');
      waiting = false;
      start = null;
      ed.setPreview([]);
      ed.ring(null);
    };
    return {
      hint: 'richiamo',
      hover(p) {
        if (waiting) follow(p);
        else ed.ring(ed.snap(p));
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
        onPoint = snapped.kind === 'punto';
      },
      move(p) {
        if (!start) return;
        if (far(p, downAt)) moved = true;
        if (waiting) {
          follow(p);
          return;
        }
        const snapped = ed.snap(p, { from: start });
        end = snapped.p;
        ed.ring(snapped);
        if (moved) ed.setPreview([shape()]);
      },
      up(p) {
        if (!start) return;
        if (waiting) follow(p);
        else if (!moved) {
          // A tap: on a callout its text is edited, elsewhere (or on a point of the drawing) it is the
          // detail of two clicks.
          const existing = !onPoint && pick(p, ['a']);
          if (existing) {
            stop();
            editText(existing);
            return;
          }
          waiting = true;
          ed.waitFor(true, 'richiamo');
          ed.setPreview([]);
          ed.ring(null, start);
          return;
        }
        // Two ends that snapped into one point are no arrow.
        const el = apart() ? shape() : null;
        stop();
        if (!el) return;
        // The bar first: closing a previous one clears its preview, not this one.
        ed.valueBar.open({
          mode: 'richiamo',
          value: '',
          onOk: (v) => ed.add({ ...el, v }),
          onClose: () => ed.setPreview([]),
        });
        ed.setPreview([el]);
      },
      // A second finger or a cancelled pointer: what this press started goes, a detail set before stays.
      cancel() {
        if (!waiting) {
          stop();
          return;
        }
        end = start;
        ed.setPreview([]);
        ed.ring(null, start);
      },
      flush: stop,
      // Annulla and Esc: a detail waiting for its second click goes first.
      undo() {
        if (!waiting) return false;
        stop();
        return true;
      },
    };
  };

  ed.tools = Object.assign(ed.tools || {}, {
    testo: text(),
    richiamo: callout(),
  });
  ed.editText = editText;
  ed.pick = pick;
  ed.offsetOf = offsetOf;
  ed.round = round;
})();
