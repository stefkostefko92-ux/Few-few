// fx/avtoservis.js — „Диагностичен HUD": въртяща се джанта (wireframe), RPM датчик със стрелка,
// телеметрия като на дилърски тестер; курсорът ускорява двигателя. Оранжев акцент върху графит.
(function () {
  var A = FX.css.getPropertyValue("--accent").trim() || "#ff6a13", rpm = 0.2;
  FX.canvas(function (ctx, W, H, t, dt) {
    ctx.clearRect(0, 0, W, H);
    var cx = W > 900 ? W * 0.72 : W * 0.5, cy = H * 0.5, R = Math.min(W, H) * 0.26;
    var target = FX.P.in ? 0.35 + FX.P.speed * 0.65 : 0.2 + Math.sin(t * 0.6) * 0.05; rpm += (target - rpm) * 0.05;
    var ang = t * (1 + rpm * 6);
    // джанта: 5 спици + два ринга
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.stroke();
    for (var i = 0; i < 5; i++) { var a = i / 5 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.2, Math.sin(a) * R * 0.2); ctx.lineTo(Math.cos(a - 0.18) * R * 0.9, Math.sin(a - 0.18) * R * 0.9); ctx.lineTo(Math.cos(a + 0.18) * R * 0.9, Math.sin(a + 0.18) * R * 0.9); ctx.closePath(); ctx.stroke(); }
    for (var b = 0; b < 5; b++) { var ba = b / 5 * Math.PI * 2 + 0.63; ctx.fillStyle = A; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(Math.cos(ba) * R * 0.3, Math.sin(ba) * R * 0.3, 2, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    ctx.restore();
    // гума: външен дебел ринг с блок-профил
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang * 0.98); ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = R * 0.16; ctx.beginPath(); ctx.arc(0, 0, R * 1.1, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.lineWidth = 2; for (var k = 0; k < 36; k++) { var ka = k / 36 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(ka) * R * 1.03, Math.sin(ka) * R * 1.03); ctx.lineTo(Math.cos(ka) * R * 1.17, Math.sin(ka) * R * 1.17); ctx.stroke(); } ctx.restore();
    // RPM датчик (дъга + стрелка) под джантата
    var gx = cx, gy = cy + R * 1.45, gr = R * 0.55, a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    ctx.strokeStyle = "rgba(255,255,255,.12)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(gx, gy, gr, a0, a1); ctx.stroke();
    ctx.strokeStyle = A; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(gx, gy, gr, a0, a0 + (a1 - a0) * rpm); ctx.stroke(); ctx.globalAlpha = 1;
    var na = a0 + (a1 - a0) * rpm; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * gr * 0.85, gy + Math.sin(na) * gr * 0.85); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.font = "600 11px " + (FX.css.getPropertyValue("--body") || "sans-serif"); ctx.textAlign = "center"; ctx.fillText(Math.round(800 + rpm * 6200) + " RPM", gx, gy + 22); ctx.fillText("OBD · " + (FX.P.in ? "LIVE" : "IDLE") + " · " + (86 + Math.round(rpm * 10)) + "°C", gx, gy + 38);
    // хоризонтален скен през hero
    var sy = (t * 60) % (H + 40) - 20; var g = ctx.createLinearGradient(0, sy - 20, 0, sy + 20); g.addColorStop(0, "rgba(255,106,19,0)"); g.addColorStop(0.5, "rgba(255,106,19,.08)"); g.addColorStop(1, "rgba(255,106,19,0)"); ctx.fillStyle = g; ctx.fillRect(0, sy - 20, W, 40);
  });
  FX.typewriter(".hero .eyebrow", 22);
})();
