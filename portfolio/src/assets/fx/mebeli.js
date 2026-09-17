// fx/mebeli.js — „Пробвайте материал": дъб · орех · лен сменят акцента на цялата страница на живо —
// клиентът „пипа" продукта, преди да поръча. Продуктова функция, не декорация.
(function () {
  var tones = [["Дъб · Oak · Rovere", "#c9a06a", "#a8714a"], ["Орех · Walnut · Noce", "#7a4b2a", "#a8714a"], ["Лен · Linen · Lino", "#b8a88f", "#8a7f6c"]];
  FX.swatches(FX.i18n.tryColor || "Material", tones, function (s) { document.documentElement.style.setProperty("--accent", s[1]); document.documentElement.style.setProperty("--accent2", s[2]); });
})();
