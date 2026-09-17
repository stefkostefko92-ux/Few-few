// fx/advokati.js — „Гравюра": фини гравирани концентрични линии, бавен златен прах и везни на
// правосъдието, които се рисуват сами при зареждане; пишеща машина в горния ред. Тихо, скъпо.
(function () {
  var G = "#b08d3c", dust = []; for (var i = 0; i < 90; i++) dust.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.5, v: 0.02 + Math.random() * 0.05, p: Math.random() * 6.28 });
  FX.canvas(function (ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H); var cx = W > 900 ? W * 0.74 : W * 0.5, cy = H * 0.52;
    ctx.strokeStyle = "rgba(15,42,90,.10)"; ctx.lineWidth = 1;
    for (var r = 40; r < Math.max(W, H); r += 26) { ctx.beginPath(); ctx.arc(cx, cy, r + Math.sin(t * 0.3 + r * 0.02) * 3, 0, Math.PI * 2); ctx.stroke(); }
    for (var a = 0; a < 24; a++) { var an = a / 24 * Math.PI * 2 + t * 0.02; ctx.beginPath(); ctx.moveTo(cx + Math.cos(an) * 60, cy + Math.sin(an) * 60); ctx.lineTo(cx + Math.cos(an) * W, cy + Math.sin(an) * W); ctx.strokeStyle = "rgba(15,42,90,.05)"; ctx.stroke(); }
    dust.forEach(function (d) { var y = (d.y - t * d.v) % 1; if (y < 0) y += 1; var x = d.x + Math.sin(t * 0.5 + d.p) * 0.01; ctx.globalAlpha = 0.25 + Math.sin(t * 2 + d.p) * 0.2; ctx.fillStyle = G; ctx.beginPath(); ctx.arc(x * W, y * H, d.s, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }, { dpr: 1.5 });
  // везни (SVG draw-on) в hero визуала
  var v = document.querySelector(".hero-visual"); if (v) { var s = document.createElement("div"); s.className = "scales"; s.innerHTML = '<svg viewBox="0 0 200 200" fill="none" stroke="' + G + '" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M100 30v140M60 170h80"/><path d="M100 50c-20 0-40 4-58 12M100 50c20 0 40 4 58 12"/><path d="M42 62l-22 50a22 22 0 0 0 44 0zM158 62l-22 50a22 22 0 0 0 44 0z"/><circle cx="100" cy="30" r="6"/></svg>'; v.prepend(s); FX.drawOn(".scales svg"); }
  FX.typewriter(".hero .eyebrow", 26);
})();
