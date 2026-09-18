// fx/core.js — минималното общо за интерактивните добавки в демотата (fx/<id>.js): токените на темата,
// reduced-motion флаг, локализиран етикет от data-i18n на <body>. Никакви декорации — само работещи
// инструменти за клиента (калкулатор, проба на цвят/материал). Нула зависимости.
window.FX = (function () {
  var css = getComputedStyle(document.documentElement), reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var i18n = {}; try { i18n = JSON.parse(document.body.dataset.i18n || "{}"); } catch (e) {}
  /** Група бутони-цветове след CTA реда в hero-то: label + [name, hex, hex2]; onPick(entry). */
  function swatches(label, list, onPick) {
    var wrap = document.createElement("div"); wrap.className = "mat-switch"; wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", label);
    var lab = document.createElement("span"); lab.className = "mat-label"; lab.textContent = label; wrap.appendChild(lab);
    list.forEach(function (s, i) { var b = document.createElement("button"); b.type = "button"; b.className = "mat" + (i === 0 ? " on" : ""); b.style.setProperty("--m", s[1]); b.title = s[0]; b.setAttribute("aria-label", s[0]); b.addEventListener("click", function () { wrap.querySelectorAll(".mat").forEach(function (x) { x.classList.toggle("on", x === b); }); onPick(s); }); wrap.appendChild(b); });
    var cta = document.querySelector(".hero .cta-row"); if (cta) cta.after(wrap);
    return wrap;
  }
  return { css: css, reduced: reduced, i18n: i18n, swatches: swatches };
})();
