// fx/hotel.js — „Планинска нощ": три слоя планини с parallax по скрол и курсор, снеговалеж, звезди
// и превключвател ден/нощ, който сменя цялото небе. Тишината на Пирин, в браузъра.
(function () {
  var night = true, flakes = [], stars = []; for (var i = 0; i < 160; i++) flakes.push({ x: Math.random(), y: Math.random(), r: 0.6 + Math.random() * 2.2, v: 0.03 + Math.random() * 0.06, p: Math.random() * 6.28 }); for (var j = 0; j < 90; j++) stars.push({ x: Math.random(), y: Math.random() * 0.6, s: Math.random() });
  function ridge(ctx, W, H, base, amp, seed, color, shift) { ctx.beginPath(); ctx.moveTo(0, H); for (var x = 0; x <= W; x += 10) { var y = base - Math.abs(FX.noise(x / 420 + seed, seed, 0)) * amp - Math.abs(Math.sin(x / 130 + seed * 3)) * amp * 0.25; ctx.lineTo(x + shift, y); } ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }
  FX.canvas(function (ctx, W, H, t) {
    var sky = ctx.createLinearGradient(0, 0, 0, H); if (night) { sky.addColorStop(0, "#0b1512"); sky.addColorStop(1, "#16241f"); } else { sky.addColorStop(0, "#f0e6d4"); sky.addColorStop(1, "#d8b47a"); } ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    if (night) stars.forEach(function (s) { ctx.globalAlpha = 0.3 + Math.sin(t * 1.5 + s.s * 10) * 0.3; ctx.fillStyle = "#fff"; ctx.fillRect(s.x * W, s.y * H, 1.2, 1.2); }); else { var sun = ctx.createRadialGradient(W * 0.8, H * 0.25, 0, W * 0.8, H * 0.25, 160); sun.addColorStop(0, "rgba(255,244,214,.9)"); sun.addColorStop(1, "rgba(255,244,214,0)"); ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H); }
    ctx.globalAlpha = 1; var mx = (FX.P.x - 0.5) * 30, sy = Math.min(scrollY, H) * 0.15;
    ridge(ctx, W, H, H * 0.72 + sy * 0.2, H * 0.32, 1.3, night ? "#0f1a16" : "#c9b48c", -mx * 0.3);
    ridge(ctx, W, H, H * 0.82 + sy * 0.4, H * 0.26, 2.7, night ? "#0a120f" : "#a89164", -mx * 0.6);
    ridge(ctx, W, H, H * 0.92 + sy * 0.6, H * 0.18, 4.1, night ? "#060b09" : "#7e6a45", -mx);
    flakes.forEach(function (f) { var y = (f.y + t * f.v) % 1.05, x = f.x + Math.sin(t * 0.7 + f.p) * 0.02 + mx / W * 0.5; ctx.globalAlpha = night ? 0.7 : 0.9; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x * W, y * H, f.r, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
  }, { dpr: 1.5 });
  var b = document.createElement("button"); b.type = "button"; b.className = "daynight"; b.setAttribute("aria-label", "day / night"); b.textContent = "☾";
  b.addEventListener("click", function () { night = !night; b.textContent = night ? "☾" : "☀"; document.body.classList.toggle("day", !night); });
  var cta = document.querySelector(".hero .cta-row"); if (cta) cta.appendChild(b);
})();
