/**
 * Thin wrapper over chrome.i18n with a DOM localiser.
 *
 * Static UI strings live in _locales/<lang>/messages.json and are resolved by
 * the browser according to the user's locale (en, es, pl, tr, pt, bg). This
 * helper adds substitution support and a `localizeDom` pass that fills any
 * element carrying a `data-i18n` / `data-i18n-title` / `data-i18n-ph` attribute.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;

  // Cache resolved strings so the UI keeps working after the extension is
  // reloaded/updated: an orphaned content script's chrome.* calls throw
  // "Extension context invalidated", which would otherwise crash renders.
  const cache = new Map();

  const I18n = {
    t(key, substitutions) {
      try {
        const msg = chrome.i18n.getMessage(key, substitutions);
        if (msg) { if (!substitutions) cache.set(key, msg); return msg; }
        return cache.get(key) || key;
      } catch (_) {
        // Context invalidated (or chrome.i18n gone) - fall back to cache/key.
        return cache.get(key) || key;
      }
    },

    localizeDom(root = document) {
      root.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = I18n.t(el.getAttribute('data-i18n'));
      });
      root.querySelectorAll('[data-i18n-title]').forEach((el) => {
        el.title = I18n.t(el.getAttribute('data-i18n-title'));
      });
      root.querySelectorAll('[data-i18n-ph]').forEach((el) => {
        el.placeholder = I18n.t(el.getAttribute('data-i18n-ph'));
      });
    }
  };

  TB.I18n = I18n;
})();
