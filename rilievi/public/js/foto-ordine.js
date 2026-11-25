// The order and the size of the photos in the print, with a preview (the owner, 10 November 2026:
// "facciamo scegliere all'utente nelle impostazioni di stampa con un'anteprima la dimensione e l'ordine
// delle foto") — in "Stampa e PDF" at the end of the sheet form (views/schede/_foto-stampa.ejs). Without
// this file the size is chosen with its radios and the order stays as saved. Here: the ticked photos
// as a list with "before" and "after" buttons, the hidden `fotoOrdine` kept in that order, and the pages
// of the photos drawn with the rows of the PDF (foto-righe.js) at the chosen size. The box comes again
// from the server after an upload (stampa-foto.js): everything is looked up at every change.
(() => {
  'use strict';

  const form = document.querySelector('[data-scheda-form]');
  const righe = window.rilieviFotoRighe;
  if (!form || !righe) return;

  const box = () => document.querySelector('[data-foto-stampa]');
  const fill = (text, params) => text.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? ''));

  // The ticked photos, from their icons (the label carries the shape and the words of the caption):
  // id, shape, words, the thumbnails.
  const ticks = (root) => Array.from(root.querySelectorAll('input[name="fotoStampa"]'));
  const fotoDi = (tick) => {
    const label = tick.parentElement;
    const img = label.querySelector('img');
    const tile = img ? img.getAttribute('src') : '';
    return {
      id: tick.value,
      rapporto: Number(label.dataset.rapporto) || 4 / 3,
      titolo: label.dataset.titolo || '',
      tile,
      mini: tile.replace('?riquadro=1', '?mini=1'),
    };
  };

  // The order: the saved or moved one, without what is no longer ticked, then the newly ticked.
  const ordineDi = (root) => {
    const hidden = root.querySelector('input[name="fotoOrdine"]');
    const ticked = ticks(root).filter((tick) => tick.checked);
    const ids = new Set(ticked.map((tick) => tick.value));
    const kept = (hidden ? hidden.value.split(/\s+/) : []).filter((id) => ids.has(id));
    const order = [...new Set(kept)];
    for (const tick of ticked) if (!order.includes(tick.value)) order.push(tick.value);
    const byId = new Map(ticked.map((tick) => [tick.value, fotoDi(tick)]));
    return order.map((id) => byId.get(id));
  };

  const dimensioneDi = (root) => {
    const radio = root.querySelector('input[name="fotoDimensione"]:checked');
    return radio ? radio.value : 'MEDIE';
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const pct = (value, total) => `${((value / total) * 100).toFixed(3)}%`;

  const anteprima = (root, foto) => {
    const target = root.querySelector('[data-foto-anteprima]');
    if (!target) return;
    target.replaceChildren();
    const { PAGINA } = righe;
    const { posti, pagine } = righe.pagine(
      foto.map((f) => f.rapporto),
      dimensioneDi(root),
    );
    const fogli = Array.from({ length: pagine }, (_, n) => {
      const pagina = el('div', 'foto-anteprima__pagina');
      pagina.append(el('span', 'foto-anteprima__numero', String(n + 1)));
      if (n === 0) {
        const titolo = el('span', 'foto-anteprima__titolo');
        titolo.style.left = pct(PAGINA.margine, PAGINA.larghezza);
        titolo.style.right = pct(PAGINA.margine, PAGINA.larghezza);
        titolo.style.top = pct(PAGINA.margine + 16, PAGINA.altezza);
        pagina.append(titolo);
      }
      target.append(pagina);
      return pagina;
    });
    foto.forEach((f, i) => {
      const posto = posti[i];
      if (!posto) return;
      const riquadro = el('span', 'foto-anteprima__foto');
      riquadro.style.left = pct(posto.x, PAGINA.larghezza);
      riquadro.style.top = pct(posto.y, PAGINA.altezza);
      riquadro.style.width = pct(posto.larghezza, PAGINA.larghezza);
      riquadro.style.height = pct(posto.altezza, PAGINA.altezza);
      const img = el('img');
      img.src = f.mini;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      riquadro.append(img, el('span', 'foto-anteprima__posto', String(i + 1)));
      fogli[posto.pagina].append(riquadro);
    });
  };

  const lista = (root, foto, focus) => {
    const target = root.querySelector('[data-foto-ordine]');
    const block = root.querySelector('[data-foto-ordine-blocco]');
    if (!target || !block) return;
    block.hidden = false;
    target.replaceChildren();
    const empty = root.querySelector('[data-foto-ordine-vuoto]');
    if (empty) empty.hidden = foto.length > 0;
    const texts = block.dataset;
    foto.forEach((f, i) => {
      const item = el('li', 'foto-ordine__voce');
      const img = el('img');
      img.src = f.tile;
      img.alt = '';
      img.width = 64;
      img.height = 48;
      img.loading = 'lazy';
      const label = el('span', 'foto-ordine__testo');
      label.append(el('strong', 'foto-ordine__n', `${i + 1}.`), ` ${f.titolo}`);
      const button = (dir, icon, text, off) => {
        const b = el('button', 'btn btn--sm btn--ghost foto-ordine__sposta', icon);
        b.type = 'button';
        b.dataset.sposta = String(dir);
        b.dataset.id = f.id;
        b.setAttribute('aria-label', fill(text, { titolo: f.titolo, n: i + 1 }));
        b.disabled = off;
        return b;
      };
      const actions = el('span', 'foto-ordine__azioni');
      actions.append(
        button(-1, '↑', texts.msgPrima, i === 0),
        button(1, '↓', texts.msgDopo, i === foto.length - 1),
      );
      item.append(img, label, actions);
      target.append(item);
    });
    if (focus) {
      const again =
        target.querySelector(
          `button[data-id="${focus.id}"][data-sposta="${focus.dir}"]:not(:disabled)`,
        ) || target.querySelector(`button[data-id="${focus.id}"]:not(:disabled)`);
      if (again) again.focus();
    }
  };

  const render = (focus) => {
    const root = box();
    if (!root) return;
    const foto = ordineDi(root);
    const hidden = root.querySelector('input[name="fotoOrdine"]');
    if (hidden) hidden.value = foto.map((f) => f.id).join(' ');
    lista(root, foto, focus);
    anteprima(root, foto);
  };

  form.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-sposta]') : null;
    const root = box();
    if (!button || !root || !root.contains(button)) return;
    const foto = ordineDi(root);
    const from = foto.findIndex((f) => f.id === button.dataset.id);
    const to = from + Number(button.dataset.sposta);
    if (from < 0 || to < 0 || to >= foto.length) return;
    [foto[from], foto[to]] = [foto[to], foto[from]];
    const hidden = root.querySelector('input[name="fotoOrdine"]');
    if (hidden) {
      hidden.value = foto.map((f) => f.id).join(' ');
      // The page has unsaved changes (app.js listens to changes in the form).
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
    render({ id: button.dataset.id, dir: button.dataset.sposta });
    const voice = root.querySelector('[data-foto-annuncio]');
    const block = root.querySelector('[data-foto-ordine-blocco]');
    if (voice && block)
      voice.textContent = fill(block.dataset.msgSpostata, {
        titolo: foto[to].titolo,
        n: to + 1,
        totale: foto.length,
      });
  });

  // A photo ticked or not, another size: the list and the preview follow.
  document.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.name === 'fotoStampa' || target.name === 'fotoDimensione') render();
  });
  // The icons came again from the server (stampa-foto.js).
  document.addEventListener('rilievi:foto-stampa', () => render());

  render();
})();
