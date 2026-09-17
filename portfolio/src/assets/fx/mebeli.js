// fx/mebeli.js — „Дървесни влакна": генеративни линии на орех/дъб, които дишат и следват курсора
// като светлина по масив; превключвател на материал (дъб · орех · лен) сменя акцента на цялата
// страница на живо — клиентът „пипа" продукта.
(function () {
  var tones = { oak: ["#c9a06a", "#7a4b2a", "#a8714a"], walnut: ["#7a4b2a", "#3f2413", "#a8714a"], linen: ["#d9cfbf", "#8a7f6c", "#b8a88f"] }, cur = "oak", lines = [];
  for (var i = 0; i < 46; i++) lines.push({ y: i / 46, a: Math.random() * 6.28, f: 0.6 + Math.random() * 1.2, w: 0.6 + Math.random() * 1.4 });
  FX.canvas(function (ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H); var c = tones[cur];
    var lx = FX.P.in ? FX.P.x * W : W * 0.62, ly = FX.P.in ? FX.P.y * H : H * 0.4;
    lines.forEach(function (l, i) { ctx.beginPath(); for (var x = 0; x <= W; x += 14) { var n = FX.noise(x / 260 + l.a, l.y * 4, t * 0.25) * 22 + Math.sin(x / 90 + l.a + t * 0.4) * 6; var y = l.y * H + n; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } var d = Math.abs(l.y * H - ly) / H; ctx.strokeStyle = i % 7 === 0 ? c[1] : c[0]; ctx.globalAlpha = 0.07 + Math.max(0, 0.22 - d * 0.5); ctx.lineWidth = l.w; ctx.stroke(); });
    ctx.globalAlpha = 1; var g = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.35); g.addColorStop(0, "rgba(255,240,215,.35)"); g.addColorStop(1, "rgba(255,240,215,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }, { dpr: 1.5 });
  // материали
  var sw = document.createElement("div"); sw.className = "mat-switch"; sw.setAttribute("role", "group"); sw.setAttribute("aria-label", "material");
  [["oak", "Дъб · Oak · Rovere"], ["walnut", "Орех · Walnut · Noce"], ["linen", "Лен · Linen · Lino"]].forEach(function (m) { var b = document.createElement("button"); b.type = "button"; b.className = "mat" + (m[0] === cur ? " on" : ""); b.style.setProperty("--m", tones[m[0]][0]); b.title = m[1]; b.setAttribute("aria-label", m[1]); b.addEventListener("click", function () { cur = m[0]; sw.querySelectorAll(".mat").forEach(function (x) { x.classList.toggle("on", x === b); }); document.documentElement.style.setProperty("--accent", tones[cur][1]); document.documentElement.style.setProperty("--accent2", tones[cur][2]); }); sw.appendChild(b); });
  var cta = document.querySelector(".hero .cta-row"); if (cta) cta.after(sw);
  FX.tilt(".tile", 10);
})();
