// Малки помощници без inline скриптове (за да работи строгата Content-Security-Policy).
document.addEventListener('DOMContentLoaded', () => {
  // Потвърждение преди рискови действия: <form data-confirm="текст">.
  document.querySelectorAll('[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.getAttribute('data-confirm'))) e.preventDefault();
    });
  });
  // Бутон за печат: <button data-print>.
  document.querySelectorAll('[data-print]').forEach((btn) => {
    btn.addEventListener('click', () => window.print());
  });

  // Избор на размер на QR етикета: обновява преглед и връзките за сваляне.
  const sizeButtons = document.querySelectorAll('[data-qr-size]');
  if (sizeButtons.length) {
    const preview = document.getElementById('qr-preview');
    const dlLabel = document.getElementById('dl-label');
    const dlQr = document.getElementById('dl-qr');
    sizeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const size = btn.getAttribute('data-qr-size');
        sizeButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
        if (preview) preview.src = `/label.svg?size=${size}`;
        if (dlLabel) dlLabel.href = `/label.svg?size=${size}`;
        if (dlQr) dlQr.href = `/qr.png?size=${size}`;
      });
    });
  }
});
