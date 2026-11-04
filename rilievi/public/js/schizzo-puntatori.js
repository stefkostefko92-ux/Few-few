// Which pointer does what in the sketch editor (schizzo-editor.js): the active tool gets one pointer at a
// time and every gesture stays tentative until it is let go; a second finger undoes what the first one
// started (the tool's `cancel`) and the two pinch the view, and nothing draws again until both are up;
// the middle button or Space with the mouse moves the view. Once a stylus has touched the sheet, a finger
// is the hand: ignored while the stylus is down or a moment after it, a palm (wider or taller than 40 CSS
// pixels) always — and a single finger moves the view instead of drawing.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed) return;
  const { canvas, vista, TOLERANCES } = ed;
  const pointers = new Map();
  let mode = 'idle';
  let active = null;
  let penSeen = false;
  let penDown = false;
  let lastPen = 0;
  const pointOf = (event) => vista.toSheet(event.clientX, event.clientY);
  const touches = () => Array.from(pointers.values()).filter((p) => p.type === 'touch');
  const typeOf = (event) => (event.pointerType in TOLERANCES ? event.pointerType : 'mouse');

  // A new sheet in the editor: no stylus yet, nothing held.
  ed.resetPointers = () => {
    pointers.clear();
    mode = 'idle';
    active = null;
    penSeen = false;
    penDown = false;
  };

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const now = performance.now();
    if (event.pointerType === 'pen') {
      penSeen = true;
      penDown = true;
      lastPen = now;
    }
    if (event.pointerType === 'touch') {
      if (penSeen && (penDown || now - lastPen < 500)) return;
      if (event.width > 40 || event.height > 40) return;
    }
    pointers.set(event.pointerId, { type: event.pointerType, x: event.clientX, y: event.clientY });
    canvas.setPointerCapture(event.pointerId);
    if (mode === 'pinch' || mode === 'blocked') return;
    if (event.pointerType === 'touch' && touches().length === 2) {
      if (mode === 'tool' && ed.tool) ed.tool.cancel();
      mode = 'pinch';
      const [a, b] = touches();
      vista.pinchStart(a, b);
      return;
    }
    const panning =
      (event.pointerType === 'touch' && penSeen) ||
      (event.pointerType === 'mouse' && (event.button === 1 || ed.spaceHeld));
    if (panning) {
      mode = 'pan';
      active = event.pointerId;
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    ed.pointerType = typeOf(event);
    mode = 'tool';
    active = event.pointerId;
    if (ed.tool) ed.tool.down(pointOf(event), event);
  });

  canvas.addEventListener('pointermove', (event) => {
    const known = pointers.get(event.pointerId);
    if (mode === 'pinch' && known) {
      known.x = event.clientX;
      known.y = event.clientY;
      const [a, b] = touches();
      if (a && b) vista.pinchMove(a, b);
      return;
    }
    if (mode === 'pan' && event.pointerId === active && known) {
      vista.panBy(event.clientX - known.x, event.clientY - known.y);
      known.x = event.clientX;
      known.y = event.clientY;
      return;
    }
    if (mode === 'tool' && event.pointerId === active && ed.tool) {
      const moves = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      (moves.length ? moves : [event]).forEach((move) => ed.tool.move(pointOf(move), move));
      return;
    }
    if (mode === 'idle' && event.pointerType !== 'touch' && ed.tool && ed.tool.hover) {
      ed.pointerType = typeOf(event);
      ed.tool.hover(pointOf(event), event);
    }
  });

  const finish = (event) => {
    if (event.pointerType === 'pen') {
      penDown = false;
      lastPen = performance.now();
    }
    if (!pointers.delete(event.pointerId)) return;
    if (mode === 'tool' && event.pointerId === active) {
      mode = 'idle';
      active = null;
      if (!ed.tool) return;
      if (event.type === 'pointercancel') ed.tool.cancel();
      else ed.tool.up(pointOf(event), event);
    } else if (mode === 'pan' && event.pointerId === active) {
      mode = 'idle';
      active = null;
    } else if (mode === 'pinch' || mode === 'blocked') {
      vista.pinchEnd();
      // Until every finger of the pinch is up, nothing draws.
      mode = pointers.size ? 'blocked' : 'idle';
    }
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('pointerleave', () => {
    if (mode === 'idle' && ed.tool && ed.tool.leave) ed.tool.leave();
  });
})();
