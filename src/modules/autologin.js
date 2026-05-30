/**
 * Auto-login / session keep-alive module (highest priority).
 *
 * Detects a dropped session (the game shows a login screen or the API starts
 * returning auth errors) and reloads the page to re-establish it, with a capped
 * number of attempts so a genuinely logged-out account doesn't reload forever.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { State, Storage, Logger, I18n, Scheduler } = TB;

  let attempts = 0;
  let lastReload = 0;

  function cfg() { return Storage.section('autologin') || {}; }

  function looksLoggedOut() {
    // Heuristics that work across Tanoth's HTML5 client and any login redirect.
    if (/login|signin|account\.gameforge/i.test(location.href)) return true;
    const txt = document.body ? document.body.innerText.slice(0, 4000).toLowerCase() : '';
    if (/session (expired|timed out)|please log in|log in to continue/.test(txt)) return true;
    return false;
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

      // Logged in and healthy — reset the counter.
      if (State.get().loggedIn) attempts = 0;
      return null;
    }
  });
})();
