// The survey fields of the supplier forms (`prefill` in the form's map, src/ordini/prefill.ts): the
// date, the reference of the lift, the company and the person writing, the ticked boxes of the sheet as
// words. Each follows the sheet in real time while nobody has typed in it — empty, or still holding what
// was put there for it (data-auto); fields of one kind follow the first one typed in when the sheet says
// nothing. The server fills them when a form first opens; one emptied by someone in a saved form stays
// empty (data-scritto, src/ordini/form.ts). The plant data that sits in more than one
// place (stops, address, speed...) is collegati.js. Loaded after app.js: its conditions are synced first.
(() => {
  'use strict';

  const form = document.querySelector('[data-scheda-form]');
  const fields = Array.from(document.querySelectorAll('[data-modulo] [data-prefill]'));
  if (!form || !fields.length || !window.rilieviValori) return;
  // The option of a list for a text of the sheet (valori.js).
  const { optionFor } = window.rilieviValori;
  // The company and the person writing (src/ordini/collegati-browser.ts).
  let context = {};
  try {
    context =
      JSON.parse(document.getElementById('collegati-dati').textContent || '').contesto || {};
  } catch {
    // Without it the fields keep what the server put there.
  }

  // A hidden field of the sheet says nothing (the door operator with manual doors).
  const shown = (el) => !el.closest('[data-off]');
  const surveyValue = (id) => {
    const el = document.getElementById(`f-${id}`);
    return el && shown(el) ? el.value.trim() : '';
  };
  // The boxes of a field of the sheet, looked up once: this runs on every key typed in the form.
  const boxes = new Map();
  const boxesOf = (name) => {
    if (!boxes.has(name))
      boxes.set(name, Array.from(document.querySelectorAll(`input[name="${name}"]`)));
    return boxes.get(name);
  };
  // Ticked boxes of the sheet as words ("Automatiche, Manuali"), as their labels read.
  const surveyTicks = (name) =>
    boxesOf(name)
      .filter((input) => input.checked && shown(input))
      .map((input) => {
        const label = input.closest('label');
        return label ? label.textContent.trim() : input.value;
      })
      .join(', ');
  // Same as textToken() in src/ordini/prefill.ts.
  const surveyText = (token) => {
    if (token === 'data') {
      const day = surveyValue('data');
      return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day.split('-').reverse().join('/') : '';
    }
    if (token === 'rif') {
      const numero = surveyValue('numeroImpianto');
      const matricola = surveyValue('matricola');
      return [numero && `N° ${numero}`, matricola && `Matr. ${matricola}`, surveyValue('indirizzo')]
        .filter(Boolean)
        .join(' — ');
    }
    if (token === 'azienda') {
      // A new sheet of someone in several companies: the company chosen above the form.
      const select = document.getElementById('f-azienda');
      if (select) return select.value ? select.options[select.selectedIndex].text.trim() : '';
    }
    if (['azienda', 'utente', 'ruolo', 'email'].includes(token)) {
      return typeof context[token] === 'string' ? context[token] : '';
    }
    if (['tipoImpianto', 'tipoPorte', 'ubicazioneMacchina'].includes(token))
      return surveyTicks(token);
    return surveyValue(token);
  };
  // A tick of the sheet ("pattinoRetrattile=si").
  const surveyTick = (token) => {
    const [name, value] = token.split('=');
    const box = boxesOf(name).find((input) => input.getAttribute('value') === value);
    return Boolean(box && box.checked && shown(box));
  };

  const touched = (el) => el.dataset.touched === '1' || 'scritto' in el.dataset;
  const follows = (el) =>
    !touched(el) &&
    (el.type === 'checkbox'
      ? !el.checked || el.dataset.auto === 'si'
      : el.value === '' || el.value === el.dataset.auto);
  const put = (el, value) => {
    if (el.type === 'checkbox') {
      el.checked = value === 'si';
      el.dataset.auto = value;
      return;
    }
    const text = el instanceof HTMLSelectElement ? optionFor(el, value) : value;
    el.value = el.maxLength > 0 ? text.slice(0, el.maxLength) : text;
    el.dataset.auto = el.value;
  };

  // Fields of one kind, in page order: the sheet speaks first; with nothing there, the first field of the
  // kind someone typed in that is on screen.
  const kinds = new Map();
  fields.forEach((el) =>
    kinds.set(el.dataset.prefill, [...(kinds.get(el.dataset.prefill) || []), el]),
  );
  const fill = () => {
    kinds.forEach((list, token) => {
      let value;
      if (token.includes('=')) {
        value = surveyTick(token) ? 'si' : '';
      } else {
        const typed = list.find((el) => !follows(el) && shown(el) && el.value.trim());
        value = surveyText(token) || (typed ? typed.value.trim() : '');
      }
      list.filter(follows).forEach((el) => put(el, value));
    });
  };

  // What someone types in a form is theirs: it stops following. The sheet changing — typed, or filled
  // from a form by collegati.js — refills the rest.
  const update = (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[data-modulo]')) {
      target.dataset.touched = '1';
    }
    fill();
  };
  document.addEventListener('input', update);
  document.addEventListener('change', update);
  fill();
})();
