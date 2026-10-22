// The sketch sheets at the end of the sheet form (views/schede/form.ejs, src/schizzi/): the list of
// sheets with their previews, "New sheet" and "Delete sheet". Each sheet is JSON in a hidden field and is
// saved with the sheet; drawing happens in the full-screen editor (schizzo-editor.js), which hands the
// sheet back here. On a new sheet with a choice of company, the block follows the chosen company
// (data-schizzi-per). Without this file the sheets stay as they are and are saved unchanged.
(() => {
  'use strict';

  const block = document.querySelector('[data-schizzi]');
  const shared = window.rilieviSchizzo;
  if (!block || !shared) return;
  const { view, svgOf } = shared;
  const list = block.querySelector('[data-schizzi-fogli]');
  const model = block.querySelector('template[data-foglio-modello]');
  const add = block.querySelector('[data-schizzi-nuovo]');
  const empty = block.querySelector('[data-schizzi-vuoto]');
  const limit = block.querySelector('[data-schizzi-massimo]');
  const mark = block.querySelector('[data-schizzi-segno]');
  const nameOf = (n) => (block.dataset.msgFoglio || '').replace('{n}', () => String(n));
  const sheets = () => Array.from(list.querySelectorAll('[data-foglio]'));

  const sheetOf = (item) => {
    try {
      const sheet = JSON.parse(item.querySelector('[data-foglio-dati]').value);
      return sheet && Array.isArray(sheet.e) ? sheet : { e: [] };
    } catch {
      return { e: [] };
    }
  };

  // Names in order, "New sheet" up to the maximum; one change event for the page (unsaved changes).
  const refresh = () => {
    const all = sheets();
    all.forEach((item, i) => {
      item.querySelector('[data-foglio-nome]').textContent = nameOf(i + 1);
      const svg = item.querySelector('svg');
      if (svg) svg.setAttribute('aria-label', nameOf(i + 1));
    });
    empty.hidden = all.length > 0;
    add.disabled = all.length >= view.maxFogli;
    limit.hidden = all.length < view.maxFogli;
  };
  const touched = () => mark.dispatchEvent(new Event('change', { bubbles: true }));

  const store = (item, sheet) => {
    item.querySelector('[data-foglio-dati]').value = JSON.stringify(sheet);
    const preview = item.querySelector('[data-foglio-anteprima]');
    preview.replaceChildren(svgOf(sheet, nameOf(sheets().indexOf(item) + 1)));
  };

  const open = (item, fresh) => {
    document.dispatchEvent(
      new CustomEvent('rilievi:schizzo-apri', {
        detail: {
          foglio: sheetOf(item),
          n: sheets().indexOf(item) + 1,
          // `null`: closed without keeping the changes. A new sheet left empty goes away.
          chiuso: (sheet) => {
            if (sheet) {
              store(item, sheet);
              touched();
            }
            if (fresh && !(sheet && sheet.e.length)) {
              item.remove();
              refresh();
              add.focus();
              return;
            }
            item.querySelector('[data-foglio-disegna]').focus();
          },
        },
      }),
    );
  };

  block.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    const item = button.closest('[data-foglio]');
    if (button.hasAttribute('data-schizzi-nuovo')) {
      if (sheets().length >= view.maxFogli) return;
      const fresh = model.content.firstElementChild.cloneNode(true);
      fresh.querySelector('[data-foglio-azioni]').hidden = false;
      list.appendChild(fresh);
      refresh();
      open(fresh, true);
    } else if (item && button.hasAttribute('data-foglio-disegna')) {
      open(item, false);
    } else if (item && button.hasAttribute('data-foglio-elimina')) {
      const n = sheets().indexOf(item) + 1;
      if (!window.confirm((block.dataset.msgElimina || '').replace('{n}', () => String(n)))) return;
      const next = item.nextElementSibling || item.previousElementSibling;
      item.remove();
      refresh();
      touched();
      const target = next ? next.querySelector('[data-foglio-disegna]') : add;
      if (target) target.focus();
    }
  });

  // A new sheet with a choice of company: the block (its index entry and the print choice too) shows
  // only for a company that has the sketches.
  const select = document.getElementById('f-azienda');
  if (block.dataset.schizziPer !== undefined && select) {
    const ids = block.dataset.schizziPer.split(' ');
    const follow = () => {
      document.querySelectorAll('[data-schizzi-per]').forEach((el) => {
        el.hidden = !ids.includes(select.value);
      });
    };
    select.addEventListener('change', follow);
    follow();
  }

  block.querySelectorAll('[data-foglio-azioni], [data-schizzi-azioni]').forEach((el) => {
    el.hidden = false;
  });
  block.querySelector('[data-schizzi-nojs]').hidden = true;
  refresh();
})();
