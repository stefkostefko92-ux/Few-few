// The controls of the sketch editor: the tools (six in the row, the shapes and the symbols in their
// menus), the bar under them — the style, snapping, undo, redo and the view while nothing is selected;
// the actions on the selection; "Fine" and "Chiudi" of a polyline —, the hint line, the keyboard, and
// opening and closing the editor (schizzi.js hands the sheet over and takes it back); the menus —
// schizzo-menu.js. Annulla, Esc and "back" first undo what is half done — an open menu (Esc), the value
// bar, the last point of a polyline, the selection — and only then the sheet; a dialog the browser
// closes anyway keeps what was drawn, and "Fatto" takes the value being typed.
(() => {
  'use strict';

  const ed = window.rilieviSchizzoEditor;
  if (!ed || !ed.tools || !ed.actions || !ed.menus) return;
  const { dialog, texts, vista } = ed;
  const q = (selector) => dialog.querySelector(selector);
  const undoButton = q('[data-schizzo-annulla]');
  const redoButton = q('[data-schizzo-ripeti]');
  const groups = Array.from(dialog.querySelectorAll('[data-schizzo-contesto]'));
  const menus = ed.menus.list;
  const snapLabel = q('[data-schizzo-tipo-aggancio]');
  const title = q('#schizzo-titolo');
  let initial = '';
  let closed = null;

  const toolName = () => q('input[name="schizzo-strumento"]:checked').value;
  ed.symbolName = () => (q('input[name="schizzo-simbolo"]:checked') || {}).value;
  ed.snapKind = (kind) => {
    snapLabel.textContent = kind ? texts.aggancio[kind] : '';
  };

  // The bar under the tools: one group at a time.
  let polylineOpen = false;
  // A start set by a first click, its second click awaited (schizzo-strumenti.js): Annulla drops it.
  let startWaiting = false;
  const showGroup = () => {
    const name =
      ed.valueBar && ed.valueBar.isOpen
        ? null
        : polylineOpen
          ? 'polilinea'
          : ed.selection.get().length
            ? 'selezione'
            : 'base';
    groups.forEach((g) => {
      g.hidden = g.dataset.schizzoContesto !== name;
    });
  };
  const buttons = () => {
    undoButton.disabled = !(ed.canUndo() || polylineOpen || startWaiting);
    redoButton.disabled = !ed.canRedo();
    const can = ed.actions.available();
    dialog.querySelectorAll('[data-schizzo-azione]').forEach((b) => {
      b.disabled = !can[b.dataset.schizzoAzione];
    });
  };
  ed.onChange = () => {
    ed.selection.sync();
    buttons();
  };
  ed.selectionChanged = () => {
    showGroup();
    buttons();
  };
  ed.barChanged = showGroup;
  ed.waiting = (active) => {
    startWaiting = active;
    buttons();
  };
  ed.polyline = (active, canClose) => {
    polylineOpen = active;
    q('[data-schizzo-poli="chiudi"]').disabled = !canClose;
    showGroup();
    buttons();
  };

  const switchTool = () => {
    const name = toolName();
    if (ed.tool && ed.tool.flush) ed.tool.flush();
    if (ed.tool && ed.tool.cancel) ed.tool.cancel();
    if (ed.valueBar.isOpen) ed.valueBar.close();
    if (name !== 'seleziona') ed.selection.clear();
    ed.tool = ed.tools[name];
    ed.setDecor(null);
    ed.setPreview([]);
    ed.snapKind(null);
    ed.canvas.dataset.strumento = name;
    ed.hint(ed.tool.hint);
    ed.menus.sync();
    showGroup();
  };
  ed.selectNew = (list) => {
    q('#schizzo-strumento-seleziona').checked = true;
    switchTool();
    ed.selection.set(list);
  };

  // A symbol chosen takes the symbol tool; the one already checked fires no "change", only "click".
  const chooseSymbol = () => {
    if (toolName() === 'simbolo') return ed.menus.sync();
    q('#schizzo-strumento-simbolo').checked = true;
    return switchTool();
  };
  dialog.addEventListener('click', (event) => {
    if (event.target.name === 'schizzo-simbolo') chooseSymbol();
  });
  dialog.addEventListener('change', (event) => {
    const { name } = event.target;
    if (name === 'schizzo-strumento') switchTool();
    else if (name === 'schizzo-simbolo') chooseSymbol();
    else if (
      (name === 'schizzo-colore' ||
        name === 'schizzo-spessore' ||
        event.target.id === 'schizzo-tratteggio') &&
      ed.selection.get().length
    ) {
      ed.actions.restyle();
    }
  });

  // Undo: what is half done first, then the sheet.
  const undo = () => {
    if (ed.valueBar.isOpen) return ed.valueBar.close();
    if (ed.tool && ed.tool.undo && ed.tool.undo()) return undefined;
    return ed.step(-1);
  };
  dialog.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    const data = button.dataset;
    if (button.hasAttribute('data-schizzo-fatto')) close(true);
    else if (button.hasAttribute('data-schizzo-scarta')) discard();
    else if (button === undoButton) undo();
    else if (button === redoButton) ed.step(1);
    else if (data.schizzoAzione) ed.actions[data.schizzoAzione]();
    else if (data.schizzoZoom === 'piu') vista.zoomCentre(1.5);
    else if (data.schizzoZoom === 'meno') vista.zoomCentre(1 / 1.5);
    else if (data.schizzoZoom === 'adatta') vista.reset();
    else if (data.schizzoPoli) ed.tools.polilinea.end(data.schizzoPoli === 'chiudi');
    else if (button.hasAttribute('data-schizzo-pulisci')) {
      if (ed.elements.length && window.confirm(texts.pulisciConferma)) ed.commit([]);
    }
    if (button.closest('details[data-schizzo-menu]') === null)
      menus.forEach((m) => (m.open = false));
  });

  const changed = () => JSON.stringify(ed.elements) !== initial;
  const close = (keep) => {
    // A complete operation is not lost: a polyline of two points, a text or a number being typed (taken
    // as OK takes it); what is half done goes.
    if (ed.valueBar.isOpen) {
      if (keep) ed.valueBar.ok();
      else ed.valueBar.close();
    }
    if (ed.tool && ed.tool.flush) ed.tool.flush(keep);
    const done = closed;
    closed = null;
    if (dialog.open) dialog.close();
    if (done) done(keep && changed() ? { e: ed.elements } : null);
  };
  const discard = () => {
    if (!changed() || window.confirm(texts.scartaConferma)) close(false);
  };
  // Esc or "back": the value bar, a half-done tool, the selection — then the question about the sheet.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    const menu = menus.find((m) => m.open);
    if (menu) {
      menu.open = false;
      return ed.menus.summaryOf(menu).focus();
    }
    if (ed.valueBar.isOpen) return ed.valueBar.close();
    // A tool half way: the last point of a polyline, the points of a dimension.
    if (ed.tool && ed.tool.undo && ed.tool.undo()) return undefined;
    if (ed.selection.get().length) return ed.selection.clear();
    return discard();
  });
  dialog.addEventListener('close', () => close(true));

  dialog.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement && event.target.type === 'text') return;
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    const step = event.shiftKey ? 25 : 5;
    const moves = {
      arrowleft: [-step, 0],
      arrowright: [step, 0],
      arrowup: [0, -step],
      arrowdown: [0, step],
    };
    if (mod && (key === 'z' || key === 'y')) {
      event.preventDefault();
      if (key === 'y' || event.shiftKey) ed.step(1);
      else undo();
    } else if (mod && key === 'd') {
      event.preventDefault();
      ed.actions.duplica();
    } else if (mod && key === 'c') ed.actions.copy();
    else if (mod && key === 'v') ed.actions.paste();
    else if ((key === 'delete' || key === 'backspace') && ed.selection.get().length) {
      event.preventDefault();
      ed.actions.elimina();
    } else if (moves[key] && ed.selection.get().length && event.target === ed.canvas) {
      event.preventDefault();
      ed.actions.nudge(...moves[key]);
    } else if (key === 'enter' && polylineOpen) {
      event.preventDefault();
      ed.tools.polilinea.end(false);
    } else if (!mod && (key === '+' || key === '=')) vista.zoomCentre(1.5);
    else if (!mod && key === '-') vista.zoomCentre(1 / 1.5);
    else if (!mod && key === '0') vista.reset();
    else if (key === ' ' && event.target === ed.canvas) {
      event.preventDefault();
      ed.spaceHeld = true;
    }
  });
  dialog.addEventListener('keyup', (event) => {
    if (event.key === ' ') ed.spaceHeld = false;
  });

  // The soft keyboard shrinks the visual viewport: the editor follows it (the view keeps its middle).
  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', () => {
      dialog.style.setProperty('--vvh', `${viewport.height}px`);
    });
  }
  // A font that arrives after the first drawing: the texts are measured and painted again.
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => ed.refresh());

  document.addEventListener('rilievi:schizzo-apri', async (event) => {
    const { foglio, n, chiuso } = event.detail;
    const list = Array.isArray(foglio.e) ? foglio.e.filter((el) => ed.regole.valido(el)) : [];
    ed.reset(list);
    // Nothing of the sheet before: the selection, a tool half way (switchTool below).
    ed.selection.clear();
    ed.resetPointers();
    initial = JSON.stringify(list);
    closed = chiuso;
    polylineOpen = false;
    startWaiting = false;
    title.textContent = (texts.titolo || '').replace('{n}', () => String(n));
    ed.error('');
    dialog.showModal();
    switchTool();
    // Start on the tool in use (on its menu when it is a shape or a symbol) — never on "Discard", the
    // first button of the dialog.
    const tool = q('input[name="schizzo-strumento"]:checked');
    const menu = tool.closest('details');
    (menu ? menu.querySelector('summary') : tool).focus();
    vista.reset();
    vista.fit();
    buttons();
    if (document.fonts) {
      try {
        await document.fonts.load('500 32px "Fira Sans"', '1600 Ø R');
      } catch {
        // Without the font the system one draws; nothing to do.
      }
      ed.refresh();
    }
  });
})();
