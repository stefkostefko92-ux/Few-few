// fx/schetovodstvo.js — „Жива графика": приходи по месеци растат като барове, линия на маржа,
// решетка като в отчет; плюс калкулатор на месечната такса (документи × служители) — клиентът
// вижда цената си на секундата. Точност > шоу.
(function () {
  var A = FX.css.getPropertyValue("--accent").trim() || "#1d4ed8", bars = []; for (var i = 0; i < 12; i++) bars.push(0.35 + Math.abs(Math.sin(i * 1.3)) * 0.55);
  FX.canvas(function (ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H); var x0 = W > 900 ? W * 0.55 : W * 0.1, w = (W > 900 ? W * 0.4 : W * 0.8), y0 = H * 0.82, h = H * 0.42, bw = w / 12;
    ctx.strokeStyle = "rgba(15,27,51,.08)"; ctx.lineWidth = 1; for (var g = 0; g <= 4; g++) { var gy = y0 - h * g / 4; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + w, gy); ctx.stroke(); }
    var grow = Math.min(1, t / 1.6);
    bars.forEach(function (v, i) { var k = Math.min(1, Math.max(0, grow * 1.4 - i * 0.05)), bh = h * v * k * (1 + Math.sin(t * 0.8 + i) * 0.02); var hov = FX.P.in && Math.abs(FX.P.x * W - (x0 + bw * i + bw / 2)) < bw / 2; ctx.fillStyle = hov ? A : "rgba(29,78,216,.28)"; ctx.fillRect(x0 + bw * i + bw * 0.2, y0 - bh, bw * 0.6, bh); if (hov) { ctx.fillStyle = "#0f1b33"; ctx.font = "600 12px sans-serif"; ctx.textAlign = "center"; ctx.fillText(Math.round(v * 24) + "k €", x0 + bw * i + bw / 2, y0 - bh - 8); } });
    ctx.beginPath(); bars.forEach(function (v, i) { var y = y0 - h * (0.25 + v * 0.5) * grow; var x = x0 + bw * i + bw / 2; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.strokeStyle = A; ctx.lineWidth = 2; ctx.stroke();
    var lx = ((t * 0.12) % 1) * w; ctx.strokeStyle = "rgba(29,78,216,.25)"; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(x0 + lx, y0 - h); ctx.lineTo(x0 + lx, y0); ctx.stroke(); ctx.setLineDash([]);
  }, { dpr: 1.5 });
  // калкулатор
  var w = document.querySelector('[data-widget="stats"]'); if (!w) return;
  var L = JSON.parse(w.dataset.calc || "{}"); if (!L.docs) return;
  var calc = document.createElement("div"); calc.className = "calc";
  calc.innerHTML = '<label><span>' + L.docs + ' <b data-v>60</b></span><input type="range" min="10" max="400" step="10" value="60" name="docs"></label><label><span>' + L.staff + ' <b data-v>4</b></span><input type="range" min="0" max="60" value="4" name="staff"></label><div class="calc-out"><span>' + L.monthly + '</span><strong data-out></strong></div>';
  var out = calc.querySelector("[data-out]"), inputs = calc.querySelectorAll("input");
  function upd() { var d = +inputs[0].value, s = +inputs[1].value; inputs[0].previousElementSibling.querySelector("b").textContent = d; inputs[1].previousElementSibling.querySelector("b").textContent = s; var price = Math.round((90 + Math.max(0, d - 40) * 1.4 + s * 12) / 5) * 5; out.textContent = price + " €"; }
  inputs.forEach(function (i) { i.addEventListener("input", upd); }); upd(); w.appendChild(calc);
})();
