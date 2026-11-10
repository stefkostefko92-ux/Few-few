// A sketch sheet on the whole screen (views/schede/show.ejs): a tap on its preview shows it in a
// full-window dialog, as large as the screen allows; "Chiudi" or Esc goes back to the preview.
(() => {
  'use strict';

  const dialog = document.querySelector('[data-schizzo-intero-vista]');
  if (!dialog) return;
  const title = dialog.querySelector('#schizzo-intero-titolo');
  const body = dialog.querySelector('[data-schizzo-intero-corpo]');

  document.addEventListener('click', (event) => {
    const button =
      event.target instanceof Element ? event.target.closest('[data-schizzo-intero]') : null;
    if (!button) return;
    const svg = button.querySelector('svg.schizzo');
    if (!svg) return;
    title.textContent = svg.getAttribute('aria-label') || '';
    body.replaceChildren(svg.cloneNode(true));
    dialog.showModal();
  });
  dialog
    .querySelector('[data-schizzo-intero-chiudi]')
    .addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => body.replaceChildren());
})();
