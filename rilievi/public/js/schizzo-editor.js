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
  const { view, paint, paintMark, paintPaper, fitCanvases, simplify, strokesOf } = shared;
  const { shapeOf, hitOf, pointOn, cleanText, fits, historyOf } = shared;
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
  const ERASER = 14;
  const SIMPLIFY = 1.2;

  let elements = [];
  let history = historyOf([]);
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
  let stale = false;

  const choice = (name) => dialog.querySelector(`input[name="schizzo-${name}"]:checked`).value;
  const tool = () => choice('strumento');
  const colour = () => choice('colore');
  const size = () => Number(choice('spessore'));

  const draw = () => {
    frame = 0;
    if (stale) paintLayer();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    if (current) paint(ctx, current);
    if (anchor) paintMark(ctx, anchor, colour());
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const paintLayer = () => {
    stale = false;
    baseCtx.setTransform(scale, 0, 0, scale, 0, 0);
    paintPaper(baseCtx);
    (showing || elements).forEach((el) => paint(baseCtx, el));
  };
  const paintBase = () => {
    paintLayer();
    draw();
  };

  const fit = () => {
    scale = fitCanvases(area, [canvas, base]);
    paintBase();
  };

  const buttons = () => {
    undoButton.disabled = !history.canUndo();
    redoButton.disabled = !history.canRedo();
  };
  // A new state of the sheet, if it still fits what the server takes.
  const commit = (next) => {
    if (!fits(next)) {
      status.textContent = dialog.dataset.msgPieno;
      paintBase();
      return false;
    }
    elements = history.push(next);
    status.textContent = '';
    paintBase();
    buttons();
    return true;
  };
  const step = (delta) => {
    const state = history.step(delta);
    if (!state) return;
    elements = state;
    paintBase();
    buttons();
  };

  const rub = (p) => {
    const took = elements.filter((el) => !erased.has(el) && hitOf(el, p, ERASER));
    if (!took.length) return;
    took.forEach((el) => erased.add(el));
    showing = elements.filter((el) => !erased.has(el));
    // At most once a frame: a stylus reports far more often than the screen draws.
    stale = true;
    schedule();
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
  // Esc asks like "Discard". A dialog the browser closes anyway (a second Esc or "back" right after)
  // keeps what was drawn: it is saved only with the sheet, and "Discard" stays the way to drop it.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    discard();
  });
  dialog.addEventListener('close', () => close(true));
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
    history = historyOf(elements);
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
