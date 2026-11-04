// The core of the full-screen sketch editor (views/schede/_schizzo-editor.ejs): the sheet being drawn and
// its history, and the two layers of the canvas — the committed elements (only those in view, painted
// again only when they change; during a pinch or a pan a picture of the whole sheet, the sharp drawing
// when the gesture rests) and, on top, what a tool is drawing, the selection and the snap ring. Which
// pointer does what — schizzo-puntatori.js; the tools — schizzo-strumenti.js, schizzo-selezione.js; the
// toolbar, the keyboard, the value bar, opening and closing — schizzo-comandi.js.
(() => {
  'use strict';

  const dialog = document.querySelector('[data-schizzo-editor]');
  const shared = window.rilieviSchizzo;
  const textsEl = document.getElementById('schizzi-testi');
  if (!dialog || !shared || !textsEl || typeof dialog.showModal !== 'function') return;
  const { view, forme, paint, paintPaper, fitCanvases, fits, boundsOf } = shared;
  const regole = window.rilieviRegole(view, forme);
  const aggancio = window.rilieviSchizzoAggancio(view, regole);
  const texts = JSON.parse(textsEl.textContent);
  const canvas = dialog.querySelector('[data-schizzo-tela]');
  const area = dialog.querySelector('[data-schizzo-area]');
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const baseCtx = base.getContext('2d');
  const picture = document.createElement('canvas');
  const hintEl = dialog.querySelector('[data-schizzo-suggerimento]');
  const statusEl = dialog.querySelector('[data-schizzo-avviso]');
  // Tolerances in CSS pixels, by pointer: a finger is wide and shakes, a mouse is exact.
  const TOLERANCES = {
    touch: { slop: 10, hit: 22, snap: 24, handle: 22 },
    pen: { slop: 4, hit: 10, snap: 14, handle: 16 },
    mouse: { slop: 3, hit: 6, snap: 10, handle: 10 },
  };
  const { larghezza: W, altezza: H } = view;
  const subGrid = new Path2D(
    Array.from({ length: W / 50 }, (_, i) => `M${i * 50 + 25} 0V${H}`)
      .concat(Array.from({ length: H / 50 }, (_, i) => `M0 ${i * 50 + 25}H${W}`))
      .join(''),
  );

  let elements = [];
  let states = [[]];
  let at = 0;
  let mergeKey = null;
  // What a tool draws over the sheet, moved by (dx, dy): a dragged selection is rebuilt only when let go.
  let preview = { list: [], dx: 0, dy: 0 };
  let hidden = null;
  let decor = null;
  let stale = true;
  let pictureStale = true;
  let quick = false;
  let quickTimer = 0;
  let frame = 0;

  const vista = window.rilieviSchizzoVista({
    canvas,
    base,
    area,
    view,
    fitCanvases,
    onChange: (gesture) => {
      stale = true;
      if (gesture) {
        quick = true;
        clearTimeout(quickTimer);
        quickTimer = setTimeout(() => {
          quick = false;
          stale = true;
          render();
        }, 120);
      }
      render();
    },
  });

  const drawn = (el) => !hidden || !hidden.has(el);
  const paintPicture = () => {
    pictureStale = false;
    const k = 2048 / W;
    picture.width = 2048;
    picture.height = Math.round(H * k);
    const pctx = picture.getContext('2d');
    pctx.setTransform(k, 0, 0, k, 0, 0);
    paintPaper(pctx);
    elements.forEach((el) => drawn(el) && paint(pctx, el));
  };
  const paintBase = () => {
    stale = false;
    baseCtx.setTransform(1, 0, 0, 1, 0, 0);
    baseCtx.clearRect(0, 0, base.width, base.height);
    vista.apply(baseCtx);
    if (quick) {
      if (pictureStale) paintPicture();
      baseCtx.drawImage(picture, 0, 0, W, H);
      return;
    }
    paintPaper(baseCtx);
    if (vista.zoom >= 2) {
      // The half squares — where the grid snaps when the view is close.
      baseCtx.lineWidth = 0.5;
      baseCtx.strokeStyle = view.coloreGriglia;
      baseCtx.stroke(subGrid);
    }
    // Only what the view shows (the boxes are cached: the elements never change).
    const v = vista.shown();
    elements.forEach((el) => {
      if (!drawn(el)) return;
      const box = boundsOf(el);
      if (box.x1 >= v.x0 && box.x0 <= v.x1 && box.y1 >= v.y0 && box.y0 <= v.y1) paint(baseCtx, el);
    });
  };
  const draw = () => {
    frame = 0;
    if (stale) paintBase();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    vista.apply(ctx);
    if (preview.list.length) {
      ctx.save();
      ctx.translate(preview.dx, preview.dy);
      preview.list.forEach((el) => paint(ctx, el));
      ctx.restore();
    }
    if (decor) decor(ctx, vista.unitsPerPx());
  };
  // At most once a frame: a stylus reports far more often than the screen draws.
  const render = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  const changed = () => {
    stale = true;
    pictureStale = true;
    render();
  };

  const choice = (name) => dialog.querySelector(`input[name="schizzo-${name}"]:checked`);
  const say = (el, text) => {
    el.textContent = text || '';
  };

  // A new state of the sheet, if every element is what the server takes and the sheet still fits;
  // `merge` folds steps of the same kind (arrow-key nudges) into one.
  const commit = (next, merge = null) => {
    const weight = next.reduce((sum, el) => sum + regole.pesoDi(el), 0);
    if (!next.every(regole.valido)) return false;
    if (!fits(next) || weight > view.maxPeso) {
      say(statusEl, texts.pieno);
      render();
      return false;
    }
    if (merge && merge === mergeKey && at === states.length - 1) {
      states[at] = next;
    } else {
      states = states
        .slice(0, at + 1)
        .concat([next])
        .slice(-200);
      at = states.length - 1;
    }
    mergeKey = merge;
    elements = next;
    say(statusEl, '');
    changed();
    ed.onChange();
    return true;
  };
  const step = (delta) => {
    if (at + delta < 0 || at + delta >= states.length) return false;
    at += delta;
    mergeKey = null;
    elements = states[at];
    changed();
    ed.onChange();
    return true;
  };

  const ed = {
    view,
    shared,
    regole,
    forme,
    texts,
    dialog,
    canvas,
    vista,
    TOLERANCES,
    pointerType: 'mouse',
    spaceHeld: false,
    tool: null,
    get elements() {
      return elements;
    },
    canUndo: () => at > 0,
    canRedo: () => at < states.length - 1,
    style: () => ({
      c: choice('colore').value,
      s: Number(choice('spessore').value),
      k: dialog.querySelector('#schizzo-tratteggio').checked ? 1 : undefined,
    }),
    // A tolerance of the current pointer, in sheet units.
    tol: (kind) => TOLERANCES[ed.pointerType][kind] * vista.unitsPerPx(),
    snap: (raw, { from = null, skip = null } = {}) =>
      aggancio.snap(raw, {
        on: dialog.querySelector('#schizzo-aggancio').checked,
        elements,
        skip,
        from,
        tolerance: ed.tol('snap'),
        unitsPerPx: vista.unitsPerPx(),
      }),
    commit,
    step,
    reset: (list) => {
      elements = list;
      states = [list];
      at = 0;
      mergeKey = null;
      preview = { list: [], dx: 0, dy: 0 };
      hidden = null;
      decor = null;
      changed();
    },
    setPreview: (list, dx = 0, dy = 0) => {
      preview = { list, dx, dy };
      render();
    },
    setHidden: (set) => {
      hidden = set;
      changed();
    },
    setDecor: (fn) => {
      decor = fn;
      render();
    },
    render,
    // A font that arrives later: the texts are measured and drawn again.
    refresh: () => {
      shared.resetMeasures();
      changed();
    },
    hint: (key) => say(hintEl, texts.suggerimenti[key] || ''),
    error: (text) => say(statusEl, text),
    // The middle of the drawing (where a dimension is pulled away from); null on an empty sheet.
    centre: () => {
      if (!elements.length) return null;
      const boxes = elements.map(boundsOf);
      const x0 = Math.min(...boxes.map((b) => b.x0));
      const x1 = Math.max(...boxes.map((b) => b.x1));
      const y0 = Math.min(...boxes.map((b) => b.y0));
      const y1 = Math.max(...boxes.map((b) => b.y1));
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    },
    // Set by schizzo-comandi.js: the toolbar follows the sheet.
    onChange: () => {},
  };
  window.rilieviSchizzoEditor = ed;

  new ResizeObserver(() => {
    if (dialog.open) vista.fit();
  }).observe(area);
})();
