// The buono di lavoro form (views/buoni/form.ejs): "Aggiungi una sequenza" adds an empty work row from the
// <template> (the place in the form is the next free index; the number shown is the row's position), up to
// the sheet's maximum. Without JavaScript the server always gives a few empty rows and saving adds more.
(() => {
  const righe = document.querySelector('[data-buono-righe]');
  const aggiungi = document.querySelector('[data-buono-aggiungi]');
  const modello = document.querySelector('[data-buono-modello]');
  if (!righe || !aggiungi || !modello) return;
  const max = Number(righe.dataset.max) || 30;
  let prossimo = Number(righe.dataset.prossimo) || 0;
  const conta = () => righe.querySelectorAll('[data-buono-riga]').length;
  const aggiorna = () => {
    aggiungi.disabled = conta() >= max;
  };

  for (const hint of document.querySelectorAll('[data-buono-senza-js]')) hint.hidden = true;
  aggiungi.hidden = false;
  aggiorna();

  aggiungi.addEventListener('click', () => {
    if (conta() >= max) return;
    const html = modello.innerHTML
      .replaceAll('__i__', String(prossimo))
      .replaceAll('__n__', String(conta() + 1));
    prossimo += 1;
    const box = document.createElement('div');
    box.innerHTML = html.trim();
    const riga = box.firstElementChild;
    if (!riga) return;
    righe.append(riga);
    riga.dispatchEvent(new CustomEvent('rilievi:firma', { bubbles: true }));
    riga.querySelector('textarea')?.focus();
    aggiorna();
  });
})();
