// "Installa l'app" (views/app/installa.ejs). Chrome and Edge offer the install themselves
// (beforeinstallprompt): the button asks them. Safari has no such call — its steps are on the page. The
// steps of this device stay open, the others close; when the page already runs as the installed app,
// it says so. Without this file every step is open and the browser's own menu installs.
(() => {
  'use strict';

  const root = document.querySelector('.installa');
  if (!root) return;
  const show = (selector, on) => {
    const el = root.querySelector(selector);
    if (el) el.hidden = !on;
  };

  const installed =
    window.matchMedia(
      '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)',
    ).matches || window.navigator.standalone === true;
  show('[data-installa-installata]', installed);

  // The device, from what the browser says of itself (an iPad with a desktop user agent has touch).
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const os = ios
    ? 'ios'
    : /Android/i.test(ua)
      ? 'android'
      : /Macintosh/.test(ua) &&
          /Safari\//.test(ua) &&
          !/Chrome\/|Chromium\/|Edg\/|Firefox\//.test(ua)
        ? 'mac'
        : 'pc';
  root.querySelectorAll('details[data-os]').forEach((details) => {
    const mine = details.dataset.os === os;
    details.open = mine;
    const badge = details.querySelector('.installa__tuo');
    if (badge) badge.hidden = !mine;
  });

  // iPhone/iPad have no install call (no beforeinstallprompt): the button opens the steps through
  // "Condividi" and moves to them; once installed the note is gone.
  show('[data-installa-ios]', os === 'ios' && !installed);
  const guida = root.querySelector('[data-installa-ios-passi]');
  if (guida) {
    guida.addEventListener('click', () => {
      const passi = root.querySelector('details[data-os="ios"]');
      if (!passi) return;
      passi.open = true;
      passi.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const summary = passi.querySelector('summary');
      if (summary) summary.focus({ preventScroll: true });
    });
  }

  // Samsung Internet: what it installs Android marks as "non sicura" — no install button there, the page
  // sends to Chrome instead (data-installa-samsung).
  const samsung = /SamsungBrowser\//.test(ua);
  let offer = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event;
    if (!installed && !samsung) show('[data-installa-pronta]', true);
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    show('[data-installa-pronta]', false);
    show('[data-installa-fatta]', true);
  });
  const button = root.querySelector('[data-installa-ora]');
  if (button) {
    button.addEventListener('click', async () => {
      if (!offer) return;
      const asked = offer;
      offer = null;
      asked.prompt();
      const { outcome } = await asked.userChoice;
      show('[data-installa-pronta]', false);
      if (outcome === 'accepted') show('[data-installa-fatta]', true);
    });
  }
})();
