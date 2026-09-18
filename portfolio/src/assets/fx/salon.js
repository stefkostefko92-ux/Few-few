// fx/salon.js — „Пробвайте цвят": нюанси за коса; акцентът на сайта се сменя на живо — клиентката
// вижда как би изглеждал сайтът (и косата ѝ) в своя нюанс. Продуктова функция, не декорация.
(function () {
  var shades = [["Rosé", "#b4585f", "#d58a8f"], ["Copper", "#7a3b2e", "#c46a52"], ["Honey", "#c99a5b", "#e7c58e"], ["Espresso", "#3b2a2a", "#6e4f4f"], ["Mauve", "#a05a7a", "#d69ab5"]];
  FX.swatches(FX.i18n.tryColor || "Shade", shades, function (s) { document.documentElement.style.setProperty("--accent", s[1]); document.documentElement.style.setProperty("--accent2", s[2]); });
})();
