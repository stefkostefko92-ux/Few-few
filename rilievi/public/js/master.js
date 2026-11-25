// The master console pages (views/master/): a confirmation before irreversible actions (forms with
// data-conferma) and, on "Comunicazioni", the list of companies only when "Solo le aziende scelte" is picked.
// Without this file the forms are sent without confirmation and the list is always visible.
(() => {
  'use strict';

  for (const form of document.querySelectorAll('form[data-conferma]')) {
    form.addEventListener('submit', (event) => {
      if (!window.confirm(form.dataset.conferma || '')) event.preventDefault();
    });
  }

  const group = document.querySelector('[data-destinatari]');
  const list = document.querySelector('[data-elenco-aziende]');
  if (group && list) {
    const sync = () => {
      const chosen = group.querySelector('input[name="destinatari"]:checked');
      list.hidden = !chosen || chosen.value !== 'scelte';
    };
    group.addEventListener('change', sync);
    sync();
  }

  const result = document.querySelector('[data-esito]');
  if (result instanceof HTMLElement) result.focus();
})();
