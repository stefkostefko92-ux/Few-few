// fx/drehi.js — „Плат": мрежа, която се вълнува като лен под вятър и се огъва под курсора;
// вертикална лента с колекциите; плочките сменят цвят като „проба на цвят". Модно, тихо, остро.
(function () {
  var A = FX.css.getPropertyValue("--accent").trim() || "#c2492b", N = 26, M = 16;
  FX.canvas(function (ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H); var ox = W > 900 ? W * 0.05 : 0, w = W * 0.55, h = H * 0.9, px = FX.P.x * W, py = FX.P.y * H;
    ctx.strokeStyle = "rgba(22,20,18,.10)"; ctx.lineWidth = 1;
    var pts = [];
    for (var i = 0; i <= N; i++) { pts[i] = []; for (var j = 0; j <= M; j++) { var x = ox + i / N * w, y = H * 0.05 + j / M * h; var wave = Math.sin(i * 0.5 + t * 1.2 + j * 0.3) * 9 + FX.noise(i * 0.4, j * 0.4, t * 0.6) * 10; var dx = x - px, dy = y - py, d = Math.hypot(dx, dy); if (FX.P.in && d < 180) { var k = (180 - d) / 180 * 24; x += dx / d * k; y += dy / d * k; } pts[i][j] = [x + wave * 0.4, y + wave]; } }
    for (var a = 0; a <= N; a++) { ctx.beginPath(); for (var b = 0; b <= M; b++) b ? ctx.lineTo(pts[a][b][0], pts[a][b][1]) : ctx.moveTo(pts[a][b][0], pts[a][b][1]); ctx.strokeStyle = a % 5 === 0 ? A : "rgba(22,20,18,.10)"; ctx.globalAlpha = a % 5 === 0 ? 0.35 : 1; ctx.stroke(); }
    ctx.globalAlpha = 1; for (var c = 0; c <= M; c++) { ctx.beginPath(); for (var d2 = 0; d2 <= N; d2++) d2 ? ctx.lineTo(pts[d2][c][0], pts[d2][c][1]) : ctx.moveTo(pts[d2][c][0], pts[d2][c][1]); ctx.strokeStyle = "rgba(22,20,18,.08)"; ctx.stroke(); }
  }, { dpr: 1.5 });
  var w = document.querySelector(".hero .word"); if (w && !FX.reduced) w.classList.add("word-run");
  var tiles = document.querySelectorAll(".tile"), pal = ["#c2492b", "#161412", "#6b665e", "#b8a88f", "#2f4858"]; tiles.forEach(function (tl, i) { var art = tl.querySelector(".tile-art"); if (!art) return; var k = i; tl.addEventListener("pointerenter", function () { k = (k + 1) % pal.length; art.style.background = "linear-gradient(135deg," + pal[k] + "," + pal[(k + 1) % pal.length] + ")"; }); });
})();
