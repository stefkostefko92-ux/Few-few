// The company of a new quote or customer, chosen by the MASTER (views/preventivi/_scelta-azienda.ejs): a company
// with quotes off sits in its own group of the list. Choosing it shows the note under the field and points the
// "Attiva i preventivi" switch (the form f-attiva-offerte after the main form) at that company; any other choice
// hides them again. Without JavaScript the server says the same after "Salva" (422 with the note and the switch).
(() => {
  const scelta = document.querySelector('[data-scelta-azienda]');
  const nota = document.querySelector('[data-offerte-spente]');
  const attiva = document.querySelector('[data-attiva-offerte]');
  if (!scelta || !nota || !attiva) return;
  const errore = document.getElementById('err-azienda');

  const aggiorna = () => {
    const opzione = scelta.selectedOptions[0];
    const spenta = Boolean(opzione && opzione.value && opzione.hasAttribute('data-spenta'));
    nota.hidden = !spenta;
    // The note names the company the switch is for (the template has {azienda}); textContent, never HTML.
    const testo = nota.querySelector('[data-nota-testo]');
    if (testo && spenta)
      testo.textContent = testo.dataset.notaTesto.replace('{azienda}', () =>
        opzione.textContent.trim(),
      );
    attiva.action = spenta ? `/aziende/${encodeURIComponent(opzione.value)}/preventivi` : '';
    const descritto = [errore && !errore.hidden ? errore.id : '', spenta ? nota.id : ''].filter(
      Boolean,
    );
    if (descritto.length) scelta.setAttribute('aria-describedby', descritto.join(' '));
    else scelta.removeAttribute('aria-describedby');
  };

  scelta.addEventListener('change', aggiorna);
  aggiorna();
})();
