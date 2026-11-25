// Photos and videos of each section (views/schede/_allegati.ejs, src/routes/allegati.ts). Without this
// file every control still works: the upload form posts and comes back to its section, a caption is
// saved by its button, deleting goes through the confirmation page. Here the same requests run in the
// background (X-Partial): the section's gallery is swapped in place, and a gallery with files still
// being compressed refreshes itself until they are ready. The upload itself is carica.js.
(() => {
  'use strict';

  const boxes = Array.from(document.querySelectorAll('[data-galleria]'));
  if (!boxes.length) return;
  const FIRST_WAIT = 3000;
  const LONGEST_WAIT = 20000;

  const boxOf = (sezione) => boxes.find((box) => box.dataset.galleria === sezione) || null;
  // The messages and limits of a section: on its upload fields (only for those who may write).
  const textsOf = (sezione) => {
    const el = document.querySelector(`[data-carica-campi="${sezione}"]`);
    return el ? el.dataset : {};
  };
  const fill = (template, values) =>
    Object.entries(values).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, () => String(value)),
      template || '',
    );

  const notice = (sezione, messages, isError) => {
    const el = document.querySelector(`[data-avvisi="${sezione}"]`);
    if (!el) return;
    el.textContent = messages.filter(Boolean).join('\n');
    el.classList.toggle('allegati__avvisi--errore', Boolean(isError));
  };

  // Polling while something is being compressed: every few seconds at first, then less often.
  const timers = new Map();
  const waits = new Map();
  const asleep = new Set();
  const schedule = (box) => {
    clearTimeout(timers.get(box));
    timers.delete(box);
    if (!box.querySelector('[data-in-corso]')) {
      waits.delete(box);
      return;
    }
    const wait = waits.get(box) || FIRST_WAIT;
    waits.set(box, Math.min(Math.round(wait * 1.5), LONGEST_WAIT));
    timers.set(
      box,
      setTimeout(() => refresh(box), wait),
    );
  };

  // Tiles whose state did not change are kept as they are (a caption being typed stays, a video keeps
  // playing); `force` are the tiles to take from the server anyway (the caption just saved). A tile
  // whose file got compressed meanwhile is the server's, but what was being typed in it goes along.
  // Which files a gallery shows and how far along they are: when it changes, the photos to print at
  // the end of the form come again (stampa-foto.js).
  const tiles = (root) =>
    Array.from(
      root.querySelectorAll('[data-allegato]'),
      (t) => t.dataset.allegato + t.dataset.stato,
    );
  const swap = (box, html, force = []) => {
    const before = tiles(box).join();
    const template = document.createElement('template');
    template.innerHTML = html;
    let focus = null;
    template.content.querySelectorAll('[data-allegato]').forEach((tile) => {
      const id = tile.dataset.allegato;
      const old = box.querySelector(`[data-allegato="${id}"]`);
      if (!old || force.includes(id)) return;
      if (old.dataset.stato === tile.dataset.stato) {
        tile.replaceWith(old);
        return;
      }
      const typed = old.querySelector(`[name="didascalia-${id}"]`);
      const before = old.querySelector(`[name="prima-${id}"]`);
      const field = tile.querySelector(`[name="didascalia-${id}"]`);
      if (!typed || !field) return;
      if (before && typed.value !== before.value) field.value = typed.value;
      if (document.activeElement === typed) focus = field;
    });
    box.replaceChildren(template.content);
    if (focus) {
      focus.focus();
      focus.setSelectionRange(focus.value.length, focus.value.length);
    }
    if (tiles(box).join() !== before) document.dispatchEvent(new CustomEvent('rilievi:galleria'));
    schedule(box);
  };

  const refresh = async (box) => {
    if (document.hidden) {
      asleep.add(box);
      return;
    }
    try {
      const response = await fetch(box.dataset.aggiorna, {
        headers: { 'X-Partial': '1' },
        credentials: 'same-origin',
      });
      // Signed out or the sheet is gone: stop here, the page says the rest on reload.
      if (!response.ok) return;
      swap(box, await response.text());
      // Everything compressed: "the compression is running" is no longer true (errors stay).
      const told = document.querySelector(`[data-avvisi="${box.dataset.galleria}"]`);
      if (
        told &&
        !box.querySelector('[data-in-corso]') &&
        !told.classList.contains('allegati__avvisi--errore')
      )
        told.textContent = '';
    } catch {
      schedule(box);
    }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    asleep.forEach((box) => refresh(box));
    asleep.clear();
  });
  boxes.forEach(schedule);

  // The answer of an action: the section's new gallery, or the message of what went wrong.
  const read = async (response, sezione) => {
    if (response.status === 401) {
      location.reload();
      return null;
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) return response.json();
    const text = type.includes('text/plain') ? await response.text() : '';
    notice(sezione, [text || textsOf(sezione).msgErrore], true);
    return null;
  };

  const post = async (url, params, sezione) => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: params,
        headers: { 'X-Partial': '1' },
        credentials: 'same-origin',
      });
      return await read(response, sezione);
    } catch {
      notice(sezione, [textsOf(sezione).msgRete], true);
      return null;
    }
  };

  // The upload (carica.js, loaded next) answers with the same gallery and messages.
  window.rilieviAllegati = {
    boxOf,
    textsOf,
    fill,
    notice,
    read,
    show: (box, html) => {
      waits.delete(box);
      swap(box, html);
    },
  };

  // Captions and deleting: one shared form outside the sheet's form (`allegati-azione`).
  const azione = document.getElementById('allegati-azione');
  if (!azione) return;
  const common = () => {
    const params = new URLSearchParams();
    params.set('_csrf', azione.elements.namedItem('_csrf').value);
    params.set('ritorno', azione.elements.namedItem('ritorno').value);
    return params;
  };

  // A caption is saved by its own button, Enter included (the browser would press the first one).
  document.addEventListener('keydown', (event) => {
    const field = event.target;
    if (event.key !== 'Enter' || event.isComposing) return;
    if (!(field instanceof HTMLInputElement) || !field.matches('[data-allegato] input[form]'))
      return;
    const own = field.closest('[data-allegato]').querySelector('[data-salva]');
    if (!own) return;
    event.preventDefault();
    own.click();
  });
  azione.addEventListener('submit', async (event) => {
    const button = event.submitter;
    if (!button || !button.dataset.salva) return;
    event.preventDefault();
    const id = button.dataset.salva;
    const tile = button.closest('[data-allegato]');
    const box = button.closest('[data-galleria]');
    if (!tile || !box) return;
    const sezione = box.dataset.galleria;
    const params = common();
    tile.querySelectorAll('input[form]').forEach((el) => params.set(el.name, el.value));
    button.disabled = true;
    const result = await post(button.formAction, params, sezione);
    button.disabled = false;
    if (!result) return;
    swap(box, result.html, [id]);
    notice(sezione, [result.ok]);
    const field = document.getElementById(`d-${id}`);
    if (field) field.focus();
  });

  document.addEventListener('click', async (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[data-elimina]') : null;
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    const box = link.closest('[data-galleria]');
    if (!box || !window.confirm(link.dataset.conferma)) return;
    const sezione = box.dataset.galleria;
    const result = await post(new URL(link.href).pathname, common(), sezione);
    if (!result) return;
    swap(box, result.html);
    notice(sezione, [result.ok]);
    box.focus();
  });
})();
