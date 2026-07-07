// Vizitka — клиентска логика (CSP-safe, без inline скриптове).
(function () {
  'use strict';

  // Бутон „Копирай линка“.
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const input = document.querySelector(btn.getAttribute('data-copy'));
      if (!input) return;
      const done = function () {
        const original = btn.textContent;
        btn.textContent = 'Копирано ✓';
        setTimeout(function () {
          btn.textContent = original;
        }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(input.value).then(done);
      } else {
        input.select();
        document.execCommand('copy');
        done();
      }
    });
  });
})();
