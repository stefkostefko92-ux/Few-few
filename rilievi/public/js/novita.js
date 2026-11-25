// The popup of the updates (views/partials/novita.ejs): the server sends it open; here it becomes modal
// (focus inside, Esc closes it), and every way of closing it — "Ho capito", Esc, "Tutte le novità" —
// marks the updates as read in the background, without leaving the page (the same form, X-Partial: 204).
// Without this file the dialog stays open on the page and "Ho capito" sends the form.
(() => {
  'use strict';

  const dialog = document.querySelector('[data-novita]');
  if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') return;
  const form = dialog.querySelector('[data-novita-form]');
  if (!(form instanceof HTMLFormElement)) return;

  let sent = false;
  const read = () => {
    if (sent) return;
    sent = true;
    fetch(form.action, {
      method: 'POST',
      body: new URLSearchParams(new FormData(form)),
      headers: { 'x-partial': '1' },
      credentials: 'same-origin',
      keepalive: true,
    }).catch(() => {
      // No network: the popup comes back on the next page.
    });
  };

  // Removing `open` (not close()) does not fire "close": the updates are not read yet.
  dialog.removeAttribute('open');
  dialog.showModal();
  dialog.addEventListener('close', read);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dialog.close();
  });
  const all = dialog.querySelector('[data-novita-tutte]');
  if (all) all.addEventListener('click', read);
})();
