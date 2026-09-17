// fx/avtokashta.js — „Шоурум": светлинни лъчи, които метат по пода, силует на автомобил, който се
// рисува сам, скорост-линии след курсора; калкулатор за лизинг (цена · самоучастие · месеци).
(function () {
  var A = FX.css.getPropertyValue("--accent").trim() || "#e11d2e", trail = [];
  FX.canvas(function (ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H);
    for (var i = 0; i < 3; i++) { var x = ((t * 0.08 + i / 3) % 1) * W * 1.4 - W * 0.2; var g = ctx.createLinearGradient(x - 120, 0, x + 120, 0); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,.05)"); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.save(); ctx.transform(1, 0, -0.35, 1, 0, 0); ctx.fillRect(x - 120, 0, 240, H); ctx.restore(); }
    var fy = H * 0.86; var fg = ctx.createLinearGradient(0, fy - 80, 0, H); fg.addColorStop(0, "rgba(255,255,255,0)"); fg.addColorStop(1, "rgba(255,255,255,.06)"); ctx.fillStyle = fg; ctx.fillRect(0, fy - 80, W, H);
    ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1; for (var k = -10; k < 10; k++) { ctx.beginPath(); ctx.moveTo(W / 2 + k * 40, fy); ctx.lineTo(W / 2 + k * 260, H); ctx.stroke(); }
    if (FX.P.in) trail.push({ x: FX.P.x * W, y: FX.P.y * H, l: 1 }); for (var j = trail.length - 1; j >= 0; j--) { var p = trail[j]; p.l -= 0.03; p.x -= 6; if (p.l <= 0) { trail.splice(j, 1); continue; } ctx.globalAlpha = p.l * 0.5; ctx.strokeStyle = A; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 40 * p.l, p.y); ctx.stroke(); } ctx.globalAlpha = 1;
    var gl = ctx.createRadialGradient(W * 0.5, fy, 0, W * 0.5, fy, W * 0.35); gl.addColorStop(0, "rgba(225,29,46,.10)"); gl.addColorStop(1, "rgba(225,29,46,0)"); ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  }, { dpr: 1.5 });
  var v = document.querySelector(".hero-visual"); if (v) { var s = document.createElement("div"); s.className = "carline"; s.innerHTML = '<svg viewBox="0 0 320 120" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 82h20l18-30c6-10 14-14 26-14h100c14 0 24 4 34 12l22 18 44 6c10 2 16 8 16 16v10h-30"/><path d="M116 82h100M60 82h-8"/><circle cx="82" cy="86" r="14"/><circle cx="238" cy="86" r="14"/><path d="M92 52h36l-4 22h-42zM134 52h60l14 22h-70z"/></svg>'; v.prepend(s); FX.drawOn(".carline svg"); }
  var w = document.querySelector('[data-widget="tiles"]'); if (!w) return; var L = JSON.parse(w.dataset.calc || "{}"); if (!L.price) return;
  var calc = document.createElement("div"); calc.className = "calc";
  calc.innerHTML = '<label><span>' + L.price + ' <b data-v>24 500 €</b></span><input type="range" min="5000" max="60000" step="500" value="24500" name="price"></label><label><span>' + L.deposit + ' <b data-v>20%</b></span><input type="range" min="10" max="50" step="5" value="20" name="dep"></label><label><span>' + L.months + ' <b data-v>48</b></span><input type="range" min="12" max="84" step="12" value="48" name="m"></label><div class="calc-out"><span>' + L.monthly + '</span><strong data-out></strong></div><p class="tiny">' + L.note + '</p>';
  var out = calc.querySelector("[data-out]"), inp = calc.querySelectorAll("input"), fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); };
  function upd() { var P = +inp[0].value, d = +inp[1].value, m = +inp[2].value, r = 0.07 / 12, loan = P * (1 - d / 100), pay = loan * r / (1 - Math.pow(1 + r, -m)); inp[0].previousElementSibling.querySelector("b").textContent = fmt(P) + " €"; inp[1].previousElementSibling.querySelector("b").textContent = d + "%"; inp[2].previousElementSibling.querySelector("b").textContent = m; out.textContent = fmt(pay) + " € / " + L.mo; }
  inp.forEach(function (i) { i.addEventListener("input", upd); }); upd(); w.appendChild(calc);
})();
