// root.js — коренът „/“ е избор на език (noindex): пренасочва към запомнения (cs-lang от site.js) или към езика на
// браузъра, иначе към /bg/. Външен файл, а не inline: продукционният CSP е script-src 'self' (nginx.conf) и
// блокира inline скриптове — тогава посетителят оставаше на избора. Без JS линковете на страницата вършат същото.
(function () {
  var s = { bg: 1, en: 1, it: 1 }, l;
  try { l = localStorage.getItem("cs-lang"); } catch (e) {}
  l = l || (navigator.language || "bg").slice(0, 2).toLowerCase();
  location.replace("/" + (s[l] ? l : "bg") + "/");
})();
