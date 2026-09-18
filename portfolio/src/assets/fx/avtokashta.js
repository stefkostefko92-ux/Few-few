// fx/avtokashta.js — калкулатор за лизинг (цена · самоучастие · месеци → месечна вноска).
// Ориентировъчен, с бележка, че точната оферта е от лизинговата компания. Нула декорации.
(function () {
  var w = document.querySelector('[data-widget="tiles"]'); if (!w) return; var L = JSON.parse(w.dataset.calc || "{}"); if (!L.price) return;
  var calc = document.createElement("div"); calc.className = "calc";
  calc.innerHTML = '<label><span>' + L.price + ' <b data-v>24 500 €</b></span><input type="range" min="5000" max="60000" step="500" value="24500" name="price"></label><label><span>' + L.deposit + ' <b data-v>20%</b></span><input type="range" min="10" max="50" step="5" value="20" name="dep"></label><label><span>' + L.months + ' <b data-v>48</b></span><input type="range" min="12" max="84" step="12" value="48" name="m"></label><div class="calc-out"><span>' + L.monthly + '</span><strong data-out></strong></div><p class="tiny">' + L.note + '</p>';
  var out = calc.querySelector("[data-out]"), inp = calc.querySelectorAll("input"), fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
  function upd() { var P = +inp[0].value, d = +inp[1].value, m = +inp[2].value, r = 0.07 / 12, loan = P * (1 - d / 100), pay = loan * r / (1 - Math.pow(1 + r, -m)); inp[0].previousElementSibling.querySelector("b").textContent = fmt(P) + " €"; inp[1].previousElementSibling.querySelector("b").textContent = d + "%"; inp[2].previousElementSibling.querySelector("b").textContent = m; out.textContent = fmt(pay) + " € / " + L.mo; }
  inp.forEach(function (i) { i.addEventListener("input", upd); }); upd(); w.appendChild(calc);
})();
