// The dimension tool of the sketch editor: drag between the two points — or click one and then the other —;
// then drag to pull the line out (a tap — 50 units away from the drawing, or in line with the previous
// dimension of a chain; a mouse or a stylus keeps what it hovered); then the number in the value bar
// (empty — "?", measured later). A tap on a dimension edits its number. Text and callout —
// schizzo-testi.js.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed || !ed.pick) return;
  const { regole, pick, editText, offsetOf } = ed;
  const far = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) > ed.tol('slop');
  const OFFSET = 50;

  // The dimension: `phase` 1 — the two points, 2 — the offset, 3 — the number in the value bar.
  const dimension = () => {
    let phase = 0;
    let a = null;
    let b = null;
    let o = 0;
    let downAt = null;
    let moved = false;
    let last = null;
    // Phase 1 with the first point set by a click: the second one is clicked next.
    let waiting = false;
    const shape = () => ({ t: 'q', ...ed.style(), x1: a.x, y1: a.y, x2: b.x, y2: b.y, o, v: '?' });
    const show = () => ed.setPreview(a && b && (a.x !== b.x || a.y !== b.y) ? [shape()] : []);
    const wait = (on) => {
      if (on !== waiting) ed.waitFor(on, 'quota');
      waiting = on;
    };
    const follow = (p) => {
      const snapped = ed.snap(p, { from: a });
      b = snapped.p;
      ed.ring(snapped, a);
      show();
    };
    const drop = () => {
      wait(false);
      phase = 0;
      a = b = null;
      ed.setPreview([]);
      ed.ring(null);
      ed.hint('quota');
    };
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
        } else if (waiting) follow(p);
        else if (phase < 2) ed.ring(ed.snap(p));
      },
      down(p) {
        downAt = p;
        moved = false;
        if (phase === 0) {
          a = ed.snap(p).p;
          b = a;
          phase = 1;
        } else if (waiting) follow(p);
      },
      move(p) {
        if (far(p, downAt)) moved = true;
        if (waiting) follow(p);
        else if (phase === 1) {
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
          if (waiting) follow(p);
          else if (!moved) {
            // A tap: on a dimension its number is edited, elsewhere it is the first of two clicks.
            const existing = pick(p, ['q']);
            if (existing) {
              drop();
              editText(existing);
              return;
            }
            wait(true);
            ed.ring(null, a);
            return;
          }
          wait(false);
          ed.ring(null);
          // Two points snapped into one: nothing to measure.
          if (a.x === b.x && a.y === b.y) {
            drop();
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
        if (phase === 1) drop();
      },
      // Another tool or the editor closed: a dimension without its number is dropped (its number
      // being typed is taken or dropped by the value bar).
      flush() {
        if (phase === 1 || phase === 2) drop();
      },
      undo() {
        if (phase === 0) return false;
        ed.valueBar.close();
        drop();
        return true;
      },
    };
    return tool;
  };

  ed.tools = Object.assign(ed.tools || {}, { quota: dimension() });
})();
