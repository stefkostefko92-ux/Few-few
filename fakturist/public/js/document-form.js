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
    });
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
  }
})();
