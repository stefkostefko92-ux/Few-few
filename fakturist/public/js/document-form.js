// New document form (views/app/document-new.ejs): picking a contact fills the recipient in place, and
// picking an item by name fills unit, price and VAT of that line. Without this file the "Fill in" button
// reloads the form with the contact (server-side) and the item list still suggests names.
(() => {
  'use strict';
  const form = document.querySelector('form.doc-form');
  if (!form) return;
  const set = (name, value) => {
    const field = form.querySelector(`[name="${name}"]`);
    if (field && typeof value === 'string') field.value = value;
  };

  const picker = document.querySelector('[data-party-select]');
  if (picker) {
    const fill = document.querySelector('[data-party-fill]');
    if (fill) fill.hidden = true;
    picker.addEventListener('change', () => {
      const option = picker.selectedOptions[0];
      if (!option || !option.value) return;
      const d = option.dataset;
      set('buyer[name]', d.name);
      set('buyer[legalId]', d.legalId);
      set('buyer[vatId]', d.vatId);
      set('buyer[street]', d.street);
      set('buyer[city]', d.city);
      set('buyer[postalCode]', d.postalCode);
      set('buyer[countryCode]', d.countryCode);
      set('buyer[email]', d.email);
    });
  }

  // Редовете: „+ Добави ред“ клонира последния ред с нов индекс (без таван от 6); таванът е 200 — колкото
  // носи формата (parameterLimit в src/routes/mount.ts).
  const MAX_LINES = 200;
  const body = form.querySelector('[data-lines]');
  const addButton = form.querySelector('[data-add-line]');
  const addLine = () => {
    if (!body || body.rows.length >= MAX_LINES) return null;
    const last = body.rows[body.rows.length - 1];
    const index = body.rows.length;
    const row = last.cloneNode(true);
    row.cells[0].textContent = String(index + 1);
    for (const field of row.querySelectorAll('input, select')) {
      field.name = field.name.replace(/^lines\[\d+\]/, `lines[${index}]`);
      if (field.dataset.line !== undefined) field.dataset.line = String(index);
      const label = field.getAttribute('aria-label');
      if (label) field.setAttribute('aria-label', label.replace(/\d+$/, String(index + 1)));
      if (field instanceof HTMLSelectElement) {
        field.selectedIndex = Math.max(
          0,
          [...field.options].findIndex((o) => o.defaultSelected),
        );
      } else {
        field.value = field.name.endsWith('[rate]') ? '20' : '';
      }
    }
    body.appendChild(row);
    if (body.rows.length >= MAX_LINES && addButton) addButton.disabled = true;
    return row;
  };
  if (body && addButton) {
    addButton.hidden = false;
    addButton.addEventListener('click', () => {
      const row = addLine();
      row?.querySelector('input')?.focus();
    });
  }

  // Чуждестранен получател → двуезичен PDF, докато човекът сам не е избрал езика.
  const language = form.querySelector('[data-pdf-language]');
  const country = form.querySelector('[name="buyer[countryCode]"]');
  if (language && country) {
    let chosen = false;
    language.addEventListener('change', () => {
      chosen = true;
    });
    const suggest = () => {
      if (chosen) return;
      const code = country.value.trim().toUpperCase();
      language.value = code && code !== 'BG' ? 'bg-en' : 'bg';
    };
    country.addEventListener('change', suggest);
    country.addEventListener('input', suggest);
  }

  const list = document.getElementById('catalog-items');
  if (list) {
    const byName = new Map();
    for (const option of list.options) byName.set(option.value, option.dataset);
    form.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !input.dataset.line) return;
      const item = byName.get(input.value);
      if (!item) return;
      const line = input.dataset.line;
      set(`lines[${line}][unitCode]`, item.unit);
      set(`lines[${line}][netPrice]`, item.price);
      set(`lines[${line}][category]`, item.category);
      set(`lines[${line}][rate]`, item.rate);
      const quantity = form.querySelector(`[name="lines[${line}][quantity]"]`);
      if (quantity && !quantity.value) quantity.value = '1';
    });

    // „Добави от артикулите“: попълва първия празен ред (или нов) с името, мярката, цената и ДДС.
    const itemPicker = document.querySelector('[data-item-picker]');
    const itemSelect = document.querySelector('[data-item-select]');
    if (itemPicker && itemSelect && body) {
      itemPicker.hidden = false;
      itemSelect.addEventListener('change', () => {
        const item = byName.get(itemSelect.value);
        if (!item) return;
        const empty = [...body.rows].find((r) => !r.querySelector('input[data-line]')?.value);
        const row = empty ?? addLine();
        const input = row?.querySelector('input[data-line]');
        if (!input) return;
        input.value = itemSelect.value;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        itemSelect.value = '';
      });
    }
  }

  // „Издай“ се изпраща веднъж: вторият клик докато страницата зарежда не прави нищо (сървърът пак пази
  // с еднократния ключ на формата — src/documents/submission.ts).
  for (const form of document.querySelectorAll('form[data-once]')) {
    form.addEventListener('submit', (event) => {
      if (form.dataset.sent === '1') {
        event.preventDefault();
        return;
      }
      form.dataset.sent = '1';
      form.setAttribute('aria-busy', 'true');
    });
  }
})();
