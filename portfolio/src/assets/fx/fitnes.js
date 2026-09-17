// fx/fitnes.js — „Пулс": ЕКГ линия през целия hero, чийто ритъм расте със скоростта на курсора;
// гигантска кинетична дума-лента; лайм искри при клик. Максимална енергия, без строб.
(function () {
  var A = FX.css.getPropertyValue("--accent").trim() || "#c6ff3d", bpm = 62, phase = 0, pts = [];
  FX.canvas(function (ctx, W, H, t, dt) {
    ctx.clearRect(0, 0, W, H);
    var target = FX.P.in ? 90 + FX.P.speed * 90 : 62; bpm += (target - bpm) * 0.03; phase += dt * bpm / 60;
    // ЕКГ: PQRST по фаза
    var y0 = H * 0.78, amp = H * 0.12, N = 220;
    ctx.beginPath();
    for (var i = 0; i <= N; i++) { var x = i / N * W, p = ((i / N) * 3 - phase) % 1; if (p < 0) p += 1; var v = 0; if (p > 0.2 && p < 0.26) v = Math.sin((p - 0.2) / 0.06 * Math.PI) * 0.15; else if (p > 0.3 && p < 0.33) v = -(p - 0.3) / 0.03 * 0.25; else if (p >= 0.33 && p < 0.37) v = 1 - Math.abs((p - 0.35) / 0.02); else if (p >= 0.37 && p < 0.4) v = -(1 - (p - 0.37) / 0.03) * 0.35; else if (p > 0.55 && p < 0.7) v = Math.sin((p - 0.55) / 0.15 * Math.PI) * 0.25; var y = y0 - v * amp; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.strokeStyle = A; ctx.lineWidth = 2; ctx.shadowColor = A; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
    // сканираща точка + BPM
    var hx = ((phase / 3) % 1) * W; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(hx, y0, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = A; ctx.font = "700 12px Inter, sans-serif"; ctx.textAlign = "left"; ctx.fillText(Math.round(bpm) + " BPM", 24, y0 - amp - 14);
    // решетка на монитор
    ctx.strokeStyle = "rgba(255,255,255,.04)"; ctx.lineWidth = 1; for (var gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, y0 - amp * 1.6); ctx.lineTo(gx, y0 + amp * 0.8); ctx.stroke(); }
    // лайм искри (частици от кликове)
    for (var k = pts.length - 1; k >= 0; k--) { var q = pts[k]; q.x += q.vx; q.y += q.vy; q.vy += 0.25; q.l -= dt; if (q.l <= 0) { pts.splice(k, 1); continue; } ctx.globalAlpha = Math.max(0, q.l); ctx.fillStyle = A; ctx.fillRect(q.x, q.y, 3, 3); ctx.globalAlpha = 1; }
  });
  if (FX.hero) FX.hero.addEventListener("pointerdown", function (e) { var r = FX.hero.getBoundingClientRect(); for (var i = 0; i < 24; i++) pts.push({ x: e.clientX - r.left, y: e.clientY - r.top, vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 8, l: 1 }); });
  // кинетична лента със знаковата дума
  var w = document.querySelector(".hero .word"); if (w && !FX.reduced) { w.classList.add("word-run"); }
})();
