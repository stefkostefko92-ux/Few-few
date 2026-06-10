// Reloads the page to reconnect when the session drops.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { State, Storage, Logger, I18n, Scheduler } = TB;

  let attempts = 0;
  let lastReload = 0;
  let domCheck = { at: 0, val: false };

  function cfg() { return Storage.section('autologin') || {}; }

  function looksLoggedOut() {
    // Strongest signal: the API reported a session fault recently.
    const lost = State.get().sessionLost || 0;
    if (lost && Date.now() - lost < 120000) return true;
    if (/login|signin|account\.gameforge/i.test(location.href)) return true;
    // innerText forces a reflow, so cache it (tick can run every ~120ms).
    if (Date.now() - domCheck.at < 5000) return domCheck.val;
    const txt = document.body ? document.body.innerText.slice(0, 4000).toLowerCase() : '';
    domCheck = { at: Date.now(), val: /session (expired|timed out)|please log in|log in to continue/.test(txt) };
    return domCheck.val;
  }

  Scheduler.register({
    id: 'autologin',
    priority: 100,
    async tick() {
      const c = cfg();
      if (!c.enabled || !c.reloadOnDisconnect) return null;

      if (looksLoggedOut()) {
        if (attempts >= (c.maxReloadAttempts || 5)) {
          Scheduler.stop(I18n.t('reasonLoginFailed'));
          return null;
        }
        // Throttle reloads to at most once a minute.
        if (Date.now() - lastReload < 60000) return null;
        return async () => {
          attempts++;
          lastReload = Date.now();
          Logger.warn(I18n.t('logReconnect', [String(attempts)]));
          location.reload();
        };
      }

      // Logged in and healthy - reset the counter.
      if (State.get().loggedIn) attempts = 0;
      return null;
    }
  });
})();
