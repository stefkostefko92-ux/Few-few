// The signature of the terms (views/legale/firma.ejs). The specific approval is ticked by the person, never
// for them. Without the tick the form is not sent: the message appears under the box and the code already
// typed stays in its field; once the box is ticked the message goes (the owner, 13 November 2026 — the page
// kept saying "spunta l'approvazione" next to a ticked box). Without this file the server answers the same.
(() => {
  'use strict';

  const form = document.querySelector('form[data-firma-condizioni]');
  if (!(form instanceof HTMLFormElement)) return;
  const box = form.querySelector('#f-clausole');
  const message = form.querySelector('[data-errore-clausole]');
  if (!(box instanceof HTMLInputElement) || !(message instanceof HTMLElement)) return;

  const show = (on) => {
    message.hidden = !on;
    if (on) {
      box.setAttribute('aria-invalid', 'true');
      box.setAttribute('aria-describedby', message.id);
    } else {
      box.removeAttribute('aria-invalid');
      box.removeAttribute('aria-describedby');
    }
  };

  box.addEventListener('change', () => {
    if (box.checked) show(false);
  });
  form.addEventListener('submit', (event) => {
    if (box.checked) return;
    event.preventDefault();
    show(true);
    box.focus();
  });
})();
