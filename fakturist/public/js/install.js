// "Install the app" (views/app/install.ejs). Chrome and Edge offer the install themselves
// (beforeinstallprompt): the button asks them. Safari has no such call — its steps are on the page. The
// steps of this device stay open, the others close; when the page already runs as the installed app,
// it says so. Without this file every step is open and the browser's own menu installs.
(() => {
  'use strict';

  const root = document.querySelector('.install');
  if (!root) return;
  const show = (selector, on) => {
    const el = root.querySelector(selector);
    if (el) el.hidden = !on;
  };

  const installed =
    window.matchMedia(
      '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)',
    ).matches || window.navigator.standalone === true;
  show('[data-install-installed]', installed);

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
    const badge = details.querySelector('.install-yours');
    if (badge) badge.hidden = !mine;
  });

  // iPhone/iPad have no install call: the button opens the Share steps and moves to them.
  show('[data-install-ios]', os === 'ios' && !installed);
  const guide = root.querySelector('[data-install-ios-steps]');
  if (guide) {
    guide.addEventListener('click', () => {
      const steps = root.querySelector('details[data-os="ios"]');
      if (!steps) return;
      steps.open = true;
      steps.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const summary = steps.querySelector('summary');
      if (summary) summary.focus({ preventScroll: true });
    });
  }

  // Samsung Internet: what it installs Android marks as unsafe — no install button there.
  const samsung = /SamsungBrowser\//.test(ua);
  let offer = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    offer = event;
    if (!installed && !samsung) show('[data-install-ready]', true);
  });
  window.addEventListener('appinstalled', () => {
    offer = null;
    show('[data-install-ready]', false);
    show('[data-install-done]', true);
  });
  const button = root.querySelector('[data-install-now]');
  if (button) {
    button.addEventListener('click', async () => {
      if (!offer) return;
      const asked = offer;
      offer = null;
      asked.prompt();
      const { outcome } = await asked.userChoice;
      show('[data-install-ready]', false);
      if (outcome === 'accepted') show('[data-install-done]', true);
    });
  }
})();
