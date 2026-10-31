// The photos for the print at the end of the sheet form (views/schede/_foto-stampa.ejs). Without this
// file the icons are plain ticks saved with the sheet. Here: "select all" and "none", the count, the mark
// of a section that is not on the sheet (it follows the section ticks and the conditions while they
// change), and after an upload or a deletion in a section (allegati.js tells) the icons come again from
// the server — what was ticked here and not saved yet stays ticked.
(() => {
  'use strict';

  const form = document.querySelector('[data-scheda-form]');
  let box = document.querySelector('[data-foto-stampa]');
  if (!form || !box) return;

  const ticks = () => Array.from(box.querySelectorAll('input[name="fotoStampa"]'));

  const count = () => {
    const el = box.querySelector('[data-foto-conteggio]');
    if (!el) return;
    const all = ticks();
    el.textContent = (box.dataset.msgConteggio || '')
      .replace('{n}', () => String(all.filter((tick) => tick.checked).length))
      .replace('{totale}', () => String(all.length));
  };

  // On the sheet: the section is shown (its condition holds) and ticked in the sections to print
  // ("Impianto" has no tick: always on the sheet, in its head).
  const marks = () => {
    box.querySelectorAll('[data-sezione]').forEach((group) => {
      const key = group.dataset.sezione;
      const section = document.getElementById(`s-${key}`);
      const tick = form.querySelector(`input[name="stampa"][value="${key}"]`);
      const shown = !section || !section.hasAttribute('data-off');
      group.toggleAttribute('data-esclusa', !(shown && (!tick || tick.checked)));
    });
  };

  const ready = () => {
    const actions = box.querySelector('[data-foto-azioni]');
    if (actions) actions.hidden = false;
    count();
    marks();
  };

  // "All" and "none": one event for the page (unsaved changes), not one per photo.
  const setAll = (on) => {
    const changed = ticks().filter((tick) => tick.checked !== on);
    changed.forEach((tick) => {
      tick.checked = on;
    });
    if (changed.length) changed[0].dispatchEvent(new Event('change', { bubbles: true }));
    count();
  };
  form.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button || !box.contains(button)) return;
    if (button.hasAttribute('data-foto-tutte')) setAll(true);
    if (button.hasAttribute('data-foto-nessuna')) setAll(false);
  });

  // After app.js (its listener comes first): a section shown or hidden by a condition is settled.
  document.addEventListener('change', () => {
    count();
    marks();
  });

  let timer = 0;
  const refresh = async () => {
    try {
      const response = await fetch(box.dataset.fotoStampa, {
        headers: { 'X-Partial': '1' },
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const template = document.createElement('template');
      template.innerHTML = (await response.text()).trim();
      const fresh = template.content.firstElementChild;
      if (!fresh || !fresh.hasAttribute('data-foto-stampa')) return;
      const kept = new Map(ticks().map((tick) => [tick.value, tick.checked]));
      const focused = document.activeElement;
      const focusedValue =
        box.contains(focused) && focused.name === 'fotoStampa' ? focused.value : '';
      fresh.querySelectorAll('input[name="fotoStampa"]').forEach((tick) => {
        if (kept.has(tick.value)) tick.checked = kept.get(tick.value);
      });
      box.replaceWith(fresh);
      box = fresh;
      ready();
      if (focusedValue) {
        const again = box.querySelector(`input[name="fotoStampa"][value="${focusedValue}"]`);
        if (again) again.focus();
      }
    } catch {
      // The network dropped: the icons stay as they are until the next change in a gallery.
    }
  };
  document.addEventListener('rilievi:galleria', () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 400);
  });

  ready();
})();
