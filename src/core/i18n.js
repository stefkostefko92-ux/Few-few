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

  const I18n = {
    t(key, substitutions) {
      const msg = chrome.i18n.getMessage(key, substitutions);
      return msg || key;
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
