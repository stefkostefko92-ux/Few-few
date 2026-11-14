// The one search of the portal in a window (Ctrl K / ⌘ K, or the search field of the side bar): the same
// results as the page /cerca, as an HTML fragment of our own server (X-Partial: 1). Arrows move through
// the results, Enter in the field opens the first one, Esc or a click outside closes. Without
// JavaScript the field and /cerca are plain forms.
(() => {
  const dialog = document.querySelector('[data-palette]');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const campo = dialog.querySelector('[data-palette-campo]');
  const lista = dialog.querySelector('[data-palette-risultati]');
  const kbd = document.querySelector('[data-cerca-kbd]');
  if (kbd && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
    kbd.textContent = '⌘ K';
  let timer = 0;
  let controller = null;
  let ultimo = null;
  // The query whose results are on screen: Enter never opens a result of an older search.
  let mostrato = null;
  let inCorso = Promise.resolve();

  const carica = () => {
    const q = campo.value.trim();
    if (q === ultimo) return inCorso;
    ultimo = q;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    inCorso = fetch(`/cerca?q=${encodeURIComponent(q)}`, {
      headers: { 'X-Partial': '1' },
      credentials: 'same-origin',
      signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const html = await response.text();
        if (signal.aborted) return;
        // Our own page, rendered and escaped on the server (views/navigazione/_risultati.ejs).
        lista.innerHTML = html;
        mostrato = q;
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          lista.textContent = '';
          mostrato = null;
        }
      });
    return inCorso;
  };

  const apri = (testo = '') => {
    if (dialog.open) return;
    // The side bar open on a phone makes the rest inert: close it first.
    if (document.querySelector('[data-sidenav][data-open]'))
      document.querySelector('.sidenav__close')?.click();
    campo.value = testo;
    ultimo = null;
    mostrato = null;
    dialog.showModal();
    campo.focus();
    campo.select();
    carica();
  };
  const voci = () => Array.from(lista.querySelectorAll('.cerca__voce'));

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      apri();
    }
  });
  campo.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(carica, 150);
  });
  dialog.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && document.activeElement === campo) {
      event.preventDefault();
      clearTimeout(timer);
      if (campo.value.trim() !== mostrato) await carica();
      if (campo.value.trim() === mostrato) voci()[0]?.click();
      return;
    }
    const tutte = voci();
    if (tutte.length === 0) return;
    const i = tutte.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      tutte[Math.min(i + 1, tutte.length - 1)].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (i <= 0) campo.focus();
      else tutte[i - 1].focus();
    }
  });
  dialog.querySelector('[data-palette-chiudi]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  const laterale = document.querySelector('[data-cerca-campo]');
  // Click or the first typed letter opens the window — not focus: Tab through the side bar stays calm.
  laterale?.addEventListener('click', () => apri(laterale.value));
  laterale?.addEventListener('keydown', (event) => {
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    apri(laterale.value + event.key);
  });
})();
