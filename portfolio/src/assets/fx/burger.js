// fx/burger.js — „Кухня": съставки (домат · сирене · кюфте · салата), които падат и подскачат с
// проста физика и се разбягват от курсора; конфети при добавяне в кошницата; демо таймер „30:00".
(function () {
  var cols = ["#e0301e", "#ffb703", "#7a3b1e", "#5aa02c", "#f5deb0"], items = [], W0 = 0;
  for (var i = 0; i < 26; i++) items.push({ x: Math.random(), y: -Math.random() * 1.5, r: 10 + Math.random() * 18, vy: 0, vx: 0, c: cols[i % cols.length], sh: i % 3, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.04 });
  var confetti = [];
  FX.canvas(function (ctx, W, H, t, dt) {
    ctx.clearRect(0, 0, W, H); W0 = W; var floor = H * 0.96, px = FX.P.x * W, py = FX.P.y * H;
    items.forEach(function (o) { var X = o.x * W, Y = o.y * H; o.vy += 900 * dt; Y += o.vy * dt; X += o.vx * dt; o.vx *= 0.98; if (Y > floor - o.r) { Y = floor - o.r; o.vy *= -0.55; if (Math.abs(o.vy) < 40) o.vy = 0; } if (X < o.r) { X = o.r; o.vx = Math.abs(o.vx); } if (X > W - o.r) { X = W - o.r; o.vx = -Math.abs(o.vx); } if (FX.P.in) { var dx = X - px, dy = Y - py, d = Math.hypot(dx, dy); if (d < 120) { o.vx += dx / d * 700 * dt * 4; o.vy -= 300 * dt * 4; } } o.rot += o.vr; o.x = X / W; o.y = Y / H;
      ctx.save(); ctx.translate(X, Y); ctx.rotate(o.rot); ctx.fillStyle = o.c; ctx.globalAlpha = 0.85; if (o.sh === 0) { ctx.beginPath(); ctx.arc(0, 0, o.r, 0, Math.PI * 2); ctx.fill(); } else if (o.sh === 1) { ctx.fillRect(-o.r, -o.r * 0.7, o.r * 2, o.r * 1.4); } else { ctx.beginPath(); ctx.ellipse(0, 0, o.r * 1.3, o.r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); });
    for (var k = confetti.length - 1; k >= 0; k--) { var c = confetti[k]; c.vy += 500 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.l -= dt; if (c.l <= 0) { confetti.splice(k, 1); continue; } ctx.globalAlpha = Math.min(1, c.l); ctx.fillStyle = c.c; ctx.fillRect(c.x, c.y, 6, 4); }
    ctx.globalAlpha = 1;
  }, { dpr: 1.5 });
  document.querySelectorAll(".tile").forEach(function (t) { t.addEventListener("click", function (e) { if (t.getAttribute("aria-pressed") !== "true") return; var r = FX.hero.getBoundingClientRect(); for (var i = 0; i < 40; i++) confetti.push({ x: e.clientX - r.left, y: e.clientY - r.top, vx: (Math.random() - 0.5) * 500, vy: -Math.random() * 500, c: cols[i % cols.length], l: 1.2 }); }); });
  // демо таймер за доставка
  var w = document.querySelector('[data-widget="tiles"]'); if (w) { var tm = document.createElement("div"); tm.className = "timer"; var s = 30 * 60; function fm(n) { return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0"); } tm.innerHTML = '<span>⏱ <b>' + fm(s) + "</b></span>"; w.querySelector(".w-title").after(tm); if (!FX.reduced) setInterval(function () { s = s > 0 ? s - 1 : 30 * 60; tm.querySelector("b").textContent = fm(s); }, 1000); }
})();
