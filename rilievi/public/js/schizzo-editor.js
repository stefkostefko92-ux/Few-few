// The full-screen editor of one sketch sheet (views/schede/_schizzo-editor.ejs, opened by schizzi.js):
// pen, straight line, rectangle, text and eraser; three colours and two thicknesses; undo, redo and
// "clear all", on squared paper. A sheet is a list of elements in the units of src/schizzi/model.ts —
// paths and texts, the same the print and the PDF draw (schizzo-tratti.js). Finger, stylus and mouse
// (pointer events); once a stylus has touched the sheet, fingers no longer draw (the palm on a tablet).
(() => {
  'use strict';

  const dialog = document.querySelector('[data-schizzo-editor]');
  const shared = window.rilieviSchizzo;
  if (!dialog || !shared || typeof dialog.showModal !== 'function') return;
  const { view, paint, paintMark, simplify, strokesOf, shapeOf, hitOf, pointOn, cleanText } =
    shared;
  const W = view.larghezza;
  const H = view.altezza;
  const canvas = dialog.querySelector('[data-schizzo-tela]');
  const area = dialog.querySelector('[data-schizzo-area]');
  const title = dialog.querySelector('#schizzo-titolo');
  const status = dialog.querySelector('[data-schizzo-avviso]');
  const textBox = dialog.querySelector('[data-schizzo-testo]');
  const textInput = dialog.querySelector('#schizzo-testo');
  const undoButton = dialog.querySelector('[data-schizzo-annulla]');
  const redoButton = dialog.querySelector('[data-schizzo-ripeti]');
  const ctx = canvas.getContext('2d');
  // The committed elements, painted again only when they change; what is being drawn goes on top.
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d');
  const grid = new Path2D(view.griglia);
  const ERASER = 14;
  const SIMPLIFY = 1.2;

  let elements = [];
  let history = [];
  let at = 0;
  let initial = '';
  let closed = null;
  let current = null;
  let points = [];
  let start = null;
  let anchor = null;
  let erased = null;
  let showing = null;
  let active = null;
  let penSeen = false;
  let scale = 1;
  let frame = 0;

  const choice = (name) => dialog.querySelector(`input[name="schizzo-${name}"]:checked`).value;
  const tool = () => choice('strumento');
  const colour = () => choice('colore');
  const size = () => Number(choice('spessore'));

  const draw = () => {
    frame = 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (current) paint(ctx, current);
    if (anchor) paintMark(ctx, anchor, colour());
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const paintBase = () => {
    baseCtx.setTransform(scale, 0, 0, scale, 0, 0);
    baseCtx.fillStyle = '#ffffff';
    baseCtx.fillRect(0, 0, W, H);
    baseCtx.lineWidth = 1;
    baseCtx.strokeStyle = view.coloreGriglia;
    baseCtx.stroke(grid);
    (showing || elements).forEach((el) => paint(baseCtx, el));
    draw();
  };

  // The biggest sheet that fits the free space (inside the area's padding), sharp on the screen's pixels.
  const fit = () => {
    const style = getComputedStyle(area);
    const free = (size, a, b) => size - parseFloat(style[a]) - parseFloat(style[b]);
    const room = free(area.clientWidth, 'paddingLeft', 'paddingRight');
    const tall = free(area.clientHeight, 'paddingTop', 'paddingBottom');
    const width = Math.max(1, Math.min(room, tall * (W / H)));
    const ratio = window.devicePixelRatio || 1;
    canvas.style.width = `${Math.floor(width)}px`;
    canvas.style.height = `${Math.floor(width * (H / W))}px`;
    canvas.width = base.width = Math.round(width * ratio);
    canvas.height = base.height = Math.round(width * (H / W) * ratio);
    scale = canvas.width / W;
    paintBase();
  };

  const buttons = () => {
    undoButton.disabled = at === 0;
    redoButton.disabled = at >= history.length - 1;
  };
  // A new state of the sheet, if it still fits what the server takes; undo goes back 200 steps.
  const commit = (next) => {
    if (next.length > view.maxElementi || JSON.stringify({ e: next }).length > view.maxJson) {
      status.textContent = dialog.dataset.msgPieno;
      paintBase();
      return false;
    }
    history = history
      .slice(0, at + 1)
      .concat([next])
      .slice(-200);
    at = history.length - 1;
    elements = next;
    status.textContent = '';
    paintBase();
    buttons();
    return true;
  };
  const step = (delta) => {
    const next = at + delta;
    if (next < 0 || next >= history.length) return;
    at = next;
    elements = history[at];
    paintBase();
    buttons();
  };

  const rub = (p) => {
    const took = elements.filter((el) => !erased.has(el) && hitOf(el, p, ERASER));
    if (!took.length) return;
    took.forEach((el) => erased.add(el));
    showing = elements.filter((el) => !erased.has(el));
    paintBase();
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'pen') penSeen = true;
    if (!event.isPrimary || (penSeen && event.pointerType === 'touch')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    const p = pointOn(canvas, event);
    const kind = tool();
    if (kind === 'testo') {
      anchor = p;
      textInput.focus();
      schedule();
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    active = event.pointerId;
    if (kind === 'penna') {
      points = [p];
      current = { t: 'p', c: colour(), s: size(), raw: points };
    } else if (kind === 'gomma') {
      erased = new Set();
      rub(p);
    } else {
      start = p;
    }
    schedule();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== active) return;
    const kind = tool();
    const moves = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
    for (const move of moves.length ? moves : [event]) {
      const p = pointOn(canvas, move);
      if (kind === 'penna') {
        const last = points[points.length - 1];
        if (p.x !== last.x || p.y !== last.y) points.push(p);
      } else if (kind === 'gomma') {
        rub(p);
      }
    }
    if (start) {
      current = { t: 'p', c: colour(), s: size(), d: shapeOf(kind, start, pointOn(canvas, event)) };
    }
    schedule();
  });

  const finish = (event) => {
    if (event.pointerId !== active) return;
    active = null;
    if (points.length) {
      const { c, s } = current;
      const strokes = strokesOf(simplify(points, SIMPLIFY)).map((d) => ({ t: 'p', c, s, d }));
      current = null;
      points = [];
      commit(elements.concat(strokes));
    } else if (start) {
      const shape = current;
      current = null;
      start = null;
      // A tap without dragging draws nothing.
      if (shape && !/^M\d+ \d+l0 0(l0 0l0 0z)?$/.test(shape.d)) commit(elements.concat([shape]));
      else schedule();
    } else if (erased) {
      const next = showing;
      showing = null;
      erased = null;
      if (next) commit(next);
    }
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  const insertText = () => {
    const value = cleanText(textInput.value);
    if (!value || !anchor) {
      textInput.focus();
      return;
    }
    const text = { t: 'x', c: colour(), s: size(), x: anchor.x, y: anchor.y, v: value };
    if (commit(elements.concat([text]))) {
      textInput.value = '';
      anchor = null;
      schedule();
    }
  };

  const syncTool = () => {
    canvas.dataset.strumento = tool();
    textBox.hidden = tool() !== 'testo';
    if (textBox.hidden) anchor = null;
    schedule();
  };
  dialog.addEventListener('change', (event) => {
    if (event.target.name === 'schizzo-strumento') syncTool();
    else schedule();
  });

  const changed = () => JSON.stringify(elements) !== initial;
  const close = (keep) => {
    const done = closed;
    closed = null;
    if (dialog.open) dialog.close();
    if (done) done(keep && changed() ? { e: elements } : null);
  };
  const discard = () => {
    if (!changed() || window.confirm(dialog.dataset.msgScarta)) close(false);
  };
  dialog.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    if (button.hasAttribute('data-schizzo-fatto')) close(true);
    else if (button.hasAttribute('data-schizzo-scarta')) discard();
    else if (button === undoButton) step(-1);
    else if (button === redoButton) step(1);
    else if (button.hasAttribute('data-schizzo-inserisci')) insertText();
    else if (button.hasAttribute('data-schizzo-pulisci')) {
      if (elements.length && window.confirm(dialog.dataset.msgPulisci)) commit([]);
    }
  });
  // Esc asks like "Discard"; a dialog the browser closes anyway leaves the sheet as it was.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    discard();
  });
  dialog.addEventListener('close', () => close(false));
  dialog.addEventListener('keydown', (event) => {
    if (event.target === textInput) {
      if (event.key === 'Enter') {
        event.preventDefault();
        insertText();
      }
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') {
      event.preventDefault();
      step(key === 'y' || event.shiftKey ? 1 : -1);
    }
  });

  new ResizeObserver(() => {
    if (dialog.open) fit();
  }).observe(area);

  document.addEventListener('rilievi:schizzo-apri', (event) => {
    const { foglio, n, chiuso } = event.detail;
    elements = Array.isArray(foglio.e) ? foglio.e.slice() : [];
    history = [elements];
    at = 0;
    initial = JSON.stringify(elements);
    closed = chiuso;
    current = null;
    points = [];
    start = null;
    anchor = null;
    erased = null;
    showing = null;
    penSeen = false;
    textInput.value = '';
    title.textContent = (dialog.dataset.msgTitolo || '').replace('{n}', () => String(n));
    status.textContent = '';
    buttons();
    dialog.showModal();
    // Start on the tool in use — never on "Discard", the first button of the dialog.
    dialog.querySelector('input[name="schizzo-strumento"]:checked').focus();
    syncTool();
    fit();
  });
})();
