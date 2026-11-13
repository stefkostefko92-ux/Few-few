// Dragging the handles of the constructor's front view with a mouse, a pen or a finger: the move in millimetres of
// the drawing (the SVG is re-drawn while it moves, so the pointer is held by the view, not by the handle).
// start(handle) → a state or null (nothing to drag); move(state, mm, first); end().
export function bindDrag(host, { start, move, end }) {
  let drag = null;
  host.addEventListener('pointerdown', (ev) => {
    const el = ev.target.closest?.('.c-handle');
    if (!el || ev.button !== 0) return;
    const m = el.ownerSVGElement?.getScreenCTM();
    const state = m && start(el);
    if (!state) return;
    ev.preventDefault();
    host.setPointerCapture(ev.pointerId);
    drag = {
      state,
      id: ev.pointerId,
      axis: el.dataset.axis,
      x: ev.clientX,
      y: ev.clientY,
      sx: m.a,
      sy: m.d,
      last: 0,
      first: true,
    };
  });
  host.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    // the drawing's y goes down, the furniture's up
    const mm = Math.round(
      drag.axis === 'x' ? (ev.clientX - drag.x) / drag.sx : (drag.y - ev.clientY) / drag.sy,
    );
    if (mm === drag.last) return;
    drag.last = mm;
    move(drag.state, mm, drag.first);
    drag.first = false;
  });
  const stop = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    drag = null;
    end();
  };
  host.addEventListener('pointerup', stop);
  host.addEventListener('pointercancel', stop);
}
