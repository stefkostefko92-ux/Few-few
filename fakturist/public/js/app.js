// Fakturist — progressive enhancement for the app pages. Every page works without this file.
(() => {
  'use strict';
  // The installed app (src/pwa/manifest.ts): its service worker keeps nothing and only answers a page
  // that cannot load because the device is offline (public/js/sw.js, served as /sw.js).
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  // Links to the install page hide once the page already runs as the installed app.
  const installed =
    window.matchMedia(
      '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)',
    ).matches || window.navigator.standalone === true;
  if (installed) {
    document.querySelectorAll('[data-install-link]').forEach((el) => {
      el.hidden = true;
    });
  }
  // File fields (views/partials/file-pick.ejs): the chosen file's name next to our own button.
  document.querySelectorAll('.file-pick').forEach((pick) => {
    const input = pick.querySelector('input[type="file"]');
    const name = pick.querySelector('[data-file-name]');
    if (!input || !name) return;
    const empty = name.textContent;
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      name.textContent = file ? file.name : empty;
    });
  });
})();
