/* Eternal Touch — GDPR Cookie Consent
 * Stores consent in cookie 'et_consent' as JSON {necessary, analytics, marketing, ts, v}
 * Version bumps re-prompt for consent */
(function () {
  'use strict';

  const COOKIE_NAME = 'et_consent';
  const COOKIE_VERSION = 1;
  const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));

  function readConsent() {
    const m = document.cookie.match(new RegExp('(?:^|; )' + COOKIE_NAME + '=([^;]*)'));
    if (!m) return null;
    try {
      const v = JSON.parse(decodeURIComponent(m[1]));
      if (v.v !== COOKIE_VERSION) return null;
      return v;
    } catch (e) { return null; }
  }

  function writeConsent(consent) {
    const v = {
      v: COOKIE_VERSION,
      necessary: true,
      analytics: !!consent.analytics,
      marketing: !!consent.marketing,
      ts: new Date().toISOString()
    };
    const value = encodeURIComponent(JSON.stringify(v));
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
    document.dispatchEvent(new CustomEvent('et:consent', { detail: v }));
    return v;
  }

  function show() {
    const banner = $('#cookie-banner');
    if (!banner) return;
    banner.hidden = false;
    document.body.classList.add('cookie-banner-open');
  }

  function hide() {
    const banner = $('#cookie-banner');
    if (!banner) return;
    banner.hidden = true;
    document.body.classList.remove('cookie-banner-open');
    // reset to simple view in case it was open in customize
    const customize = $('#cookie-customize');
    const simple = $('#cookie-actions-simple');
    if (customize) customize.hidden = true;
    if (simple) simple.hidden = false;
  }

  function applyToTogglesFromConsent(c) {
    const a = $('#cat-analytics');
    const m = $('#cat-marketing');
    if (a) a.checked = !!(c && c.analytics);
    if (m) m.checked = !!(c && c.marketing);
  }

  function init() {
    const banner = $('#cookie-banner');
    if (!banner) return;

    const existing = readConsent();
    if (!existing) {
      // Pre-fill toggles to off (GDPR: opt-in)
      applyToTogglesFromConsent({});
      show();
    }

    banner.addEventListener('click', function (e) {
      const t = e.target.closest('[data-cookie-action]');
      if (!t) return;
      const action = t.dataset.cookieAction;
      const customize = $('#cookie-customize');
      const simple = $('#cookie-actions-simple');

      if (action === 'accept-all') {
        writeConsent({ analytics: true, marketing: true });
        hide();
      } else if (action === 'reject') {
        writeConsent({ analytics: false, marketing: false });
        hide();
      } else if (action === 'customize') {
        applyToTogglesFromConsent(readConsent() || {});
        if (simple) simple.hidden = true;
        if (customize) customize.hidden = false;
      } else if (action === 'back') {
        if (customize) customize.hidden = true;
        if (simple) simple.hidden = false;
      } else if (action === 'save-selection') {
        const a = $('#cat-analytics');
        const m = $('#cat-marketing');
        writeConsent({ analytics: a && a.checked, marketing: m && m.checked });
        hide();
      }
    });

    // Reopen via [data-reopen-cookies]
    document.addEventListener('click', function (e) {
      const t = e.target.closest('[data-reopen-cookies]');
      if (!t) return;
      e.preventDefault();
      applyToTogglesFromConsent(readConsent() || {});
      const customize = $('#cookie-customize');
      const simple = $('#cookie-actions-simple');
      if (customize) customize.hidden = true;
      if (simple) simple.hidden = false;
      show();
    });
  }

  // Public API
  window.EtConsent = {
    get: readConsent,
    has: function (cat) {
      const c = readConsent();
      return !!(c && c[cat]);
    },
    open: function () {
      applyToTogglesFromConsent(readConsent() || {});
      show();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
