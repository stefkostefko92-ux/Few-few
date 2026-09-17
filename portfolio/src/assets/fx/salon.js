// fx/salon.js — „Коприна и бокè": меки розови петна и листенца, които се носят и се отдръпват от
// курсора; палитра от нюанси за коса (клиентката „пробва" цвят — акцентът на сайта се сменя на живо).
(function () {
  var petals = []; for (var i = 0; i < 60; i++) petals.push({ x: Math.random(), y: Math.random(), r: 6 + Math.random() * 26, v: 0.01 + Math.random() * 0.03, p: Math.random() * 6.28, h: Math.random() });
  var shades = [["#b4585f", "#d58a8f"], ["#7a3b2e", "#c46a52"], ["#c99a5b", "#e7c58e"], ["#3b2a2a", "#6e4f4f"], ["#a05a7a", "#d69ab5"]];
  FX.canvas(function (ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H); var A = FX.css.getPropertyValue("--accent").trim() || "#b4585f";
    var px = FX.P.x * W, py = FX.P.y * H;
    petals.forEach(function (o) { var y = (o.y + t * o.v) % 1.2 - 0.1, x = o.x + Math.sin(t * 0.6 + o.p) * 0.03; var X = x * W, Y = y * H; if (FX.P.in) { var dx = X - px, dy = Y - py, d = Math.hypot(dx, dy); if (d < 160) { X += dx / d * (160 - d) * 0.6; Y += dy / d * (160 - d) * 0.6; } } var g = ctx.createRadialGradient(X, Y, 0, X, Y, o.r); g.addColorStop(0, A); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.globalAlpha = 0.10 + o.h * 0.12; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, o.r, 0, Math.PI * 2); ctx.fill(); });
    ctx.globalAlpha = 1;
  }, { dpr: 1.5 });
  var sw = document.createElement("div"); sw.className = "mat-switch"; sw.setAttribute("aria-label", "hair shade");
  shades.forEach(function (s, i) { var b = document.createElement("button"); b.type = "button"; b.className = "mat" + (i === 0 ? " on" : ""); b.style.setProperty("--m", s[0]); b.setAttribute("aria-label", "shade " + (i + 1)); b.addEventListener("click", function () { sw.querySelectorAll(".mat").forEach(function (x) { x.classList.toggle("on", x === b); }); document.documentElement.style.setProperty("--accent", s[0]); document.documentElement.style.setProperty("--accent2", s[1]); }); sw.appendChild(b); });
  var cta = document.querySelector(".hero .cta-row"); if (cta) cta.after(sw);
})();
