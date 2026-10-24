// Единственият скрипт на панела — прогресивно подобрение: потвърждение преди необратимо действие
// (бан, рестарт, триене). Текстът е в `data-confirm` на бутона или на формата. Без JavaScript
// формите работят както са; правата и CSRF се проверяват на сървъра всеки път.
(() => {
  for (const form of document.querySelectorAll('form')) {
    form.addEventListener('submit', (event) => {
      const button = event.submitter;
      const text = (button && button.dataset.confirm) || form.dataset.confirm || '';
      if (text && !window.confirm(text)) event.preventDefault();
    });
  }
})();
