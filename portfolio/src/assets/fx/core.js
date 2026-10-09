// fx/core.js — минималното общо за интерактивните добавки в демотата (fx/<id>.js): токените на темата,
// reduced-motion флаг, локализиран етикет от data-i18n на <body>. Никакви декорации — само работещи
// инструменти за клиента (калкулатор, проба на цвят/материал). Нула зависимости.
window.FX = (function () {
  var css = getComputedStyle(document.documentElement), reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var i18n = {}; try { i18n = JSON.parse(document.body.dataset.i18n || "{}"); } catch (e) {}
  // Контраст по WCAG — клиентското копие на src/lib/color.mjs: акцентът, сменен на живо, минава през същата
  // гаранция ≥4.5:1 като при билда (иначе светъл нюанс като „Honey“ #c99a5b даваше 2,5:1 върху бялото).
  function rgb(hex) { var h = String(hex).trim().replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) || 0; }); }
  function hex(c) { return "#" + c.map(function (v) { return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"); }).join(""); }
  function lum(c) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function contrast(a, b) { var x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function readable(color, bgs) {
    var dark = lum(rgb(bgs[0])) < 0.4, target = dark ? [255, 255, 255] : [0, 0, 0], base = rgb(color);
    for (var k = 0; k <= 1.0001; k += 0.02) { var c = hex(base.map(function (v, i) { return v + (target[i] - v) * k; })); if (bgs.every(function (b) { return contrast(c, b) >= 4.5; })) return c; }
    return hex(target);
  }
  var root = document.documentElement;
  /** Сменя акцента на живо с гаранция за контраст: акцентът спрямо фоновете, текстът върху него — черен или бял. */
  function setAccent(a, a2) {
    var bgs = ["--bg", "--surface", "--surface2"].map(function (v) { return css.getPropertyValue(v).trim(); }).filter(Boolean);
    var acc = readable(a, bgs), on = contrast("#ffffff", acc) >= contrast("#111111", acc) ? "#ffffff" : "#111111";
    root.style.setProperty("--accent", acc); root.style.setProperty("--accent2", a2); root.style.setProperty("--on-accent", on);
  }
  /** Група бутони-цветове след CTA реда в hero-то: label + [name, hex, hex2]; onPick(entry). Маркиран е нюансът,
   *  най-близък до текущия акцент на темата (не просто първият), с aria-pressed. */
  function swatches(label, list, onPick) {
    var wrap = document.createElement("div"); wrap.className = "mat-switch"; wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", label);
    var lab = document.createElement("span"); lab.className = "mat-label"; lab.textContent = label; wrap.appendChild(lab);
    var cur = rgb(css.getPropertyValue("--accent")), best = 0, bestD = Infinity;
    list.forEach(function (s, i) { var c = rgb(s[1]), d = Math.pow(c[0] - cur[0], 2) + Math.pow(c[1] - cur[1], 2) + Math.pow(c[2] - cur[2], 2); if (d < bestD) { bestD = d; best = i; } });
    list.forEach(function (s, i) {
      var b = document.createElement("button"); b.type = "button"; b.className = "mat" + (i === best ? " on" : ""); b.setAttribute("aria-pressed", String(i === best));
      b.style.setProperty("--m", s[1]); b.title = s[0]; b.setAttribute("aria-label", s[0]);
      b.addEventListener("click", function () { wrap.querySelectorAll(".mat").forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", String(x === b)); }); onPick(s); });
      wrap.appendChild(b);
    });
    var cta = document.querySelector(".hero .cta-row"); if (cta) cta.after(wrap);
    return wrap;
  }
  return { css: css, reduced: reduced, i18n: i18n, swatches: swatches, setAccent: setAccent, contrast: contrast };
})();
