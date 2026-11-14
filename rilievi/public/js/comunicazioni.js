// The portal notices above the page (views/partials/comunicazioni.ejs): "Chiudi" sends its form in the
// background (X-Partial: 204) and removes the notice, moving the focus to the next one or to the page.
// Without this file the form is sent normally and the server returns to the same page.
(() => {
  'use strict';

  for (const form of document.querySelectorAll('[data-avviso-chiudi]')) {
    if (!(form instanceof HTMLFormElement)) continue;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const notice = form.closest('[data-avviso]');
      fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        headers: { 'x-partial': '1' },
        credentials: 'same-origin',
      })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          const box = notice ? notice.parentElement : null;
          if (notice) notice.remove();
          const next = box ? box.querySelector('[data-avviso] button') : null;
          if (box && !box.querySelector('[data-avviso]')) box.remove();
          const main = document.getElementById('main');
          if (next instanceof HTMLElement) next.focus();
          else if (main) main.focus();
        })
        .catch(() => form.submit());
    });
  }
})();
