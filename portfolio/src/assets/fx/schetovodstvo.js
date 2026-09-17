// fx/schetovodstvo.js — калкулатор на месечната такса (документи × служители): клиентът вижда
// ориентировъчната си цена на секундата. Точност > шоу; нула декорации.
(function () {
  var w = document.querySelector('[data-widget="stats"]'); if (!w) return;
  var L = JSON.parse(w.dataset.calc || "{}"); if (!L.docs) return;
  var calc = document.createElement("div"); calc.className = "calc";
  calc.innerHTML = '<label><span>' + L.docs + ' <b data-v>60</b></span><input type="range" min="10" max="400" step="10" value="60" name="docs"></label><label><span>' + L.staff + ' <b data-v>4</b></span><input type="range" min="0" max="60" value="4" name="staff"></label><div class="calc-out"><span>' + L.monthly + '</span><strong data-out></strong></div>';
  var out = calc.querySelector("[data-out]"), inputs = calc.querySelectorAll("input");
  function upd() { var d = +inputs[0].value, s = +inputs[1].value; inputs[0].previousElementSibling.querySelector("b").textContent = d; inputs[1].previousElementSibling.querySelector("b").textContent = s; var price = Math.round((90 + Math.max(0, d - 40) * 1.4 + s * 12) / 5) * 5; out.textContent = price + " €"; }
  inputs.forEach(function (i) { i.addEventListener("input", upd); }); upd(); w.appendChild(calc);
})();
