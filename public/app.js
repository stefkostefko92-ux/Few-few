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

  // Копиране в клипборда: <button data-copy="#селектор">.
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const el = document.querySelector(btn.getAttribute('data-copy'));
      if (!el) return;
      try {
        await navigator.clipboard.writeText(el.textContent.trim());
        const old = btn.textContent;
        btn.textContent = 'Копирано ✓';
        setTimeout(() => (btn.textContent = old), 1500);
      } catch {
        /* без клипборд достъп */
      }
    });
  });

  // Запис на NFC таг (Web NFC — Android/Chrome). Прогресивно подобрение.
  const nfcBtn = document.getElementById('nfc-write');
  const urlEl = document.getElementById('emergency-url');
  if (nfcBtn && urlEl && 'NDEFReader' in window) {
    nfcBtn.hidden = false;
    const status = document.getElementById('nfc-status');
    const hint = document.getElementById('nfc-hint');
    if (hint) hint.hidden = true;
    nfcBtn.addEventListener('click', async () => {
      if (status) status.textContent = 'Допрете таг до телефона…';
      try {
        const ndef = new window.NDEFReader();
        await ndef.write({ records: [{ recordType: 'url', data: urlEl.textContent.trim() }] });
        if (status) status.textContent = 'Готово! Профилът е записан на тага.';
      } catch (e) {
        if (status)
          status.textContent = 'Записът не успя: ' + (e && e.message ? e.message : 'опитайте пак');
      }
    });
  }
});
