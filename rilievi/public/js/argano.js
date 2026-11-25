// The ropes of the machine calculation (views/argano/calcolo.ejs). The card under the rope choice shows
// the data of the rope chosen from the tables (each option carries them as data-*), and the fields typed
// by hand show only for "Altra fune" and "Altra misura" (`data-solo`). Without this file every field
// stays visible and the card shows the rope of the page as it came from the server.
(() => {
  'use strict';

  const fune = document.getElementById('f-fune');
  const misura = document.getElementById('f-compMisura');
  const scheda = document.querySelector('[data-scheda-fune]');
  if (!fune) return;

  const solo = (select) => {
    document.querySelectorAll(`[data-solo="${select.name}"]`).forEach((el) => {
      el.toggleAttribute('data-off', select.value !== el.dataset.soloValore);
    });
  };

  const mostraScheda = () => {
    if (!scheda) return;
    const option = fune.selectedOptions[0];
    const dati = option && option.dataset.formazione ? option.dataset : null;
    scheda.hidden = !dati;
    if (!dati) return;
    scheda.querySelectorAll('[data-dato]').forEach((dd) => {
      dd.textContent = dati[dd.dataset.dato] || '';
    });
  };

  fune.addEventListener('change', () => {
    solo(fune);
    mostraScheda();
  });
  if (misura) misura.addEventListener('change', () => solo(misura));
})();
