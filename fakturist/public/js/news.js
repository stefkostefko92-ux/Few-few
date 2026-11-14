// „Какво ново“ (views/partials/news-popup.ejs): сървърът го праща отворен; тук става модален (фокусът вътре,
// Esc затваря), а всяко затваряне — „Разбрах“, Esc, „Всички новости“ — отбелязва новините като прочетени
// във фонов режим, без да напуска страницата (същата форма, x-partial → 204). Без този файл прозорецът
// стои на страницата и „Разбрах“ праща формата.
(() => {
  'use strict';

  const dialog = document.querySelector('[data-news]');
  if (!(dialog instanceof HTMLDialogElement) || typeof dialog.showModal !== 'function') return;
  const form = dialog.querySelector('[data-news-form]');
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
      // Без мрежа: прозорецът се връща на следващата страница.
    });
  };

  // Махането на `open` (не close()) не пуска „close“: новините още не са прочетени.
  dialog.removeAttribute('open');
  dialog.showModal();
  dialog.addEventListener('close', read);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dialog.close();
  });
  const all = dialog.querySelector('[data-news-all]');
  if (all) all.addEventListener('click', read);
})();
