// Supplier forms in the sheet (src/ordini/): when one opens — its brand chosen and its question
// answered "Sì" — the empty fields nobody has touched take what the survey already says (date, lift
// number, door operator...). The server fills what it knows on its own (the company, the person
// writing). Same rules as src/ordini/prefill.ts; the plant data that sits in more than one place
// (stops, speed, load...) is collegati.js. Loaded after app.js: its conditions are synced first.
(() => {
  'use strict';

  const boxes = Array.from(document.querySelectorAll('[data-modulo]'));
  if (!boxes.length) return;

  // A hidden field of the sheet says nothing (the door operator with manual doors).
  const shown = (el) => !el.closest('[data-off]');
  const surveyValue = (id) => {
    const el = document.getElementById(`f-${id}`);
    return el && shown(el) ? el.value.trim() : '';
  };
  // Ticked boxes of the sheet as words ("Automatiche, Manuali"), as their labels read.
  const surveyTicks = (name) =>
    Array.from(document.querySelectorAll(`input[name="${name}"]:checked`), (input) => {
      const label = input.closest('label');
      return label ? label.textContent.trim() : input.value;
    }).join(', ');
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
      const select = document.getElementById('f-azienda');
      return select && select.value ? select.options[select.selectedIndex].text.trim() : '';
    }
    if (['tipoImpianto', 'tipoPorte', 'ubicazioneMacchina'].includes(token))
      return surveyTicks(token);
    return surveyValue(token);
  };

  // The option of a list for a text of the sheet: the same word ("Selcom" → "SELCOM"), otherwise the
  // only option with the same numbers ("24 V DC" → "24Vcc"). Same as opzioneDi() in prefill.ts.
  const compact = (value) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
  const numbersIn = (value) =>
    (value.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  const optionFor = (select, value) => {
    const options = Array.from(select.options, (option) => option.value).filter(Boolean);
    const wanted = compact(value);
    if (!wanted) return '';
    const same = options.find((option) => compact(option) === wanted);
    if (same) return same;
    const target = numbersIn(value);
    if (!target.length) return '';
    const matching = options.filter((option) => {
      const own = numbersIn(option);
      return own.length === target.length && own.every((n, i) => n === target[i]);
    });
    return matching.length === 1 ? matching[0] : '';
  };

  const prefill = (box) => {
    box.querySelectorAll('[data-prefill]').forEach((input) => {
      if (input.dataset.touched) return;
      const token = input.dataset.prefill;
      if (input.type === 'checkbox') {
        const [name, value] = token.split('=');
        const source = document.querySelector(`input[name="${name}"][value="${value}"]:checked`);
        if (source && shown(source)) input.checked = true;
      } else if (input instanceof HTMLSelectElement) {
        if (!input.value) input.value = optionFor(input, surveyText(token));
      } else if (!input.value) {
        const text = surveyText(token);
        input.value = input.maxLength > 0 ? text.slice(0, input.maxLength) : text;
      }
    });
  };

  const touch = (event) => {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('[data-modulo]')) {
      target.dataset.touched = '1';
    }
  };
  // Open on load means the server already filled it; a form that opens later is filled here.
  const open = new Map(boxes.map((box) => [box, shown(box)]));
  document.addEventListener('input', touch);
  document.addEventListener('change', (event) => {
    touch(event);
    boxes.forEach((box) => {
      const now = shown(box);
      if (now && !open.get(box)) prefill(box);
      open.set(box, now);
    });
  });
})();
