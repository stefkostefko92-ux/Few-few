// Applies chrome.i18n messages to the extension's own pages (popup/options).
// Markup opts in with data-i18n="key" (textContent), data-i18n-title="key"
// (title attribute) and data-i18n-placeholder="key". Missing messages leave the
// bundled English text untouched, so a half-translated locale never blanks UI.
(function () {
  function t(key, subs) {
    try { return chrome.i18n.getMessage(key, subs) || ""; } catch (e) { return ""; }
  }
  function apply(root) {
    root.querySelectorAll("[data-i18n]").forEach(function (el) {
      var m = t(el.getAttribute("data-i18n"));
      if (m) el.textContent = m;
    });
    root.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var m = t(el.getAttribute("data-i18n-title"));
      if (m) el.setAttribute("title", m);
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
      var m = t(el.getAttribute("data-i18n-placeholder"));
      if (m) el.setAttribute("placeholder", m);
    });
    try { document.documentElement.lang = chrome.i18n.getUILanguage().slice(0, 2); } catch (e) {}
  }
  window.saI18n = { t: t, apply: apply };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { apply(document); });
  else apply(document);
})();
