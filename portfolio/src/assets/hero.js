// hero.js — „THE FORGE CORE" в чист 2D canvas (псевдо-3D проекция, без WebGL и без библиотеки):
// fresnel-кристал (икосаедър с вътрешно ядро), два орбитални пръстена и частици по сферични
// обвивки с отблъскване от курсора, адитивно смесване. Степенува по капацитет на устройството.
(function () {
  var cv = document.getElementById("hero-canvas"); if (!cv) return;
  var ctx = cv.getContext("2d", { alpha: false }); if (!ctx) return; // непрозрачен canvas = по-евтин композит
  var coarse = matchMedia("(pointer: coarse)").matches, small = innerWidth < 820;
  var lite = document.documentElement.classList.contains("lite");
  // Бюджет: 1800 частици @DPR2 на 1440×800 = 2880×1600 адитивен canvas — на iGPU/стар лаптоп не стига 60 FPS.
  // Старт: 1100 @DPR≤1.5; LITE: 450 @DPR1 + всеки втори кадър. Адаптивно: 3 поредни бавни секунди → степен надолу.
  var N = lite ? 450 : coarse || small ? 600 : 1100, NMAX = N, DPR = Math.min(devicePixelRatio || 1, lite ? 1 : 1.5), skip = lite;
  var W, H, CX, CY, S;
  function size() { var r = cv.parentElement.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); CX = W * (W > 900 ? 0.68 : 0.5); CY = H * 0.5; S = Math.min(W, H) * 0.19; }
  size(); addEventListener("resize", size, { passive: true });
  function degrade() { if (skip) return; if (DPR > 1) { DPR = 1; size(); } else if (N > 500) N = Math.round(N * 0.6); else skip = true; }
  addEventListener("cs-lite", function () { DPR = 1; size(); N = Math.min(N, 450); skip = true; });
  // икосаедър
  var phi = (1 + Math.sqrt(5)) / 2, V = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]].map(function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  var E = []; for (var i = 0; i < 12; i++) for (var j = i + 1; j < 12; j++) { var d = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]); if (d < 1.1) E.push([i, j]); }
  // частици: сферични обвивки r 1.9–3.5
  var Pt = new Float32Array(NMAX * 6); // x y z seed cos(seed*.4) sin(seed*.4)
  for (var k = 0; k < NMAX; k++) { var r = 1.9 + Math.random() * 1.6, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), sd = Math.random(); Pt[k * 6] = r * Math.sin(p) * Math.cos(t); Pt[k * 6 + 1] = r * Math.cos(p); Pt[k * 6 + 2] = r * Math.sin(p) * Math.sin(t); Pt[k * 6 + 3] = sd; Pt[k * 6 + 4] = Math.cos(sd * 0.4); Pt[k * 6 + 5] = Math.sin(sd * 0.4); }
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener("pointermove", function (e) { var r = cv.getBoundingClientRect(); tmx = (e.clientX - r.left) / W * 2 - 1; tmy = -((e.clientY - r.top) / H * 2 - 1); }, { passive: true });
  function rot(v, ax, ay) { var x = v[0], y = v[1], z = v[2]; var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax); var x1 = x * cy - z * sy, z1 = x * sy + z * cy; var y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx; return [x1, y1, z2]; }
  function proj(v, scale) { var z = v[2] + 4.4, f = 4.4 / z; return [CX + v[0] * scale * f + mx * 18, CY - v[1] * scale * f - my * 12, f]; }
  var t0 = performance.now(), visible = true, hidden = false, odd = false, fSlow = 0, fAll = 0, secStart = performance.now();
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(cv);
  document.addEventListener("visibilitychange", function () { hidden = document.hidden; });
  function frame(now) {
    requestAnimationFrame(frame); if (!visible || hidden) return;
    odd = !odd; if (skip && odd) return; // LITE/деградирал: 30 FPS вместо 60
    var t = (now - t0) / 1000; mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    var fStart = performance.now();
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    // фоново течно поле
    var g = ctx.createRadialGradient(CX + mx * 40, CY - my * 30, 0, CX, CY, S * 4.2); g.addColorStop(0, "rgba(0,229,255,.10)"); g.addColorStop(0.5, "rgba(0,229,255,.025)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    // частици
    var ay = t * 0.08, ax = Math.sin(t * 0.13) * 0.3, pmx = CX + mx * W * 0.5, pmy = CY - my * H * 0.5;
    var cA = Math.cos(ay), sA = Math.sin(ay), cX = Math.cos(ax), sX = Math.sin(ax), wob = t * 0.9, ox = mx * 18, oy = my * 12;
    for (var k = 0; k < N; k++) {
      var o = k * 6, seed = Pt[o + 3], cy = cA * Pt[o + 4] - sA * Pt[o + 5], sy = sA * Pt[o + 4] + cA * Pt[o + 5]; // cos/sin(ay + seed*.4)
      var x = Pt[o], y = Pt[o + 1] + Math.sin(wob + seed * 6.28) * 0.08, z = Pt[o + 2];
      var x1 = x * cy - z * sy, z1 = x * sy + z * cy, y1 = y * cX - z1 * sX, z2 = y * sX + z1 * cX;
      var f = 4.4 / (z2 + 4.4), qx = CX + x1 * S * f + ox, qy = CY - y1 * S * f - oy;
      var dx = qx - pmx, dy = qy - pmy, d2 = dx * dx + dy * dy; if (d2 < 25600) { var d = Math.sqrt(d2) || 1, push = (1 - d / 160) * 40; qx += dx / d * push; qy += dy / d * push; }
      var a = (0.25 + f * 0.45).toFixed(2), sz = (0.6 + seed * 1.4) * f;
      ctx.fillStyle = seed > 0.92 ? "rgba(0,255,136," + a + ")" : "rgba(0,229,255," + a + ")"; ctx.fillRect(qx, qy, sz, sz);
    }
    // пръстени
    for (var ring = 0; ring < 2; ring++) { ctx.beginPath(); ctx.strokeStyle = "rgba(0,229,255," + (ring ? .22 : .32) + ")"; ctx.lineWidth = 1; for (var s = 0; s <= 120; s++) { var th = s / 120 * Math.PI * 2, rv = rot([Math.cos(th) * 2.1, 0, Math.sin(th) * 2.1], ring ? 1.1 + t * 0.15 : 0.5 - t * 0.1, ring ? t * 0.2 : -t * 0.25), rq = proj(rv, S); s ? ctx.lineTo(rq[0], rq[1]) : ctx.moveTo(rq[0], rq[1]); } ctx.stroke(); }
    // кристал: wireframe обвивка + вътрешно ядро
    var pts = V.map(function (v) { return proj(rot(v, t * 0.05, t * 0.12), S * 1.6); });
    ctx.strokeStyle = "rgba(0,229,255,.22)"; ctx.lineWidth = 1; ctx.beginPath(); E.forEach(function (e) { ctx.moveTo(pts[e[0]][0], pts[e[0]][1]); ctx.lineTo(pts[e[1]][0], pts[e[1]][1]); }); ctx.stroke();
    var core = V.map(function (v) { return proj(rot(v, -t * 0.1, t * 0.2), S * (0.95 + Math.sin(t * 1.3) * 0.05)); });
    ctx.strokeStyle = "rgba(0,229,255,.55)"; ctx.beginPath(); E.forEach(function (e) { ctx.moveTo(core[e[0]][0], core[e[0]][1]); ctx.lineTo(core[e[1]][0], core[e[1]][1]); }); ctx.stroke();
    core.forEach(function (p) { ctx.fillStyle = "rgba(0,229,255," + (0.5 + p[2] * 0.4) + ")"; ctx.fillRect(p[0] - 1, p[1] - 1, 2, 2); });
    var cg = ctx.createRadialGradient(CX + mx * 18, CY - my * 12, 0, CX + mx * 18, CY - my * 12, S * 1.1); cg.addColorStop(0, "rgba(0,229,255,.35)"); cg.addColorStop(0.4, "rgba(0,229,255,.08)"); cg.addColorStop(1, "rgba(0,229,255,0)"); ctx.fillStyle = cg; ctx.fillRect(CX - S * 1.2 + mx * 18, CY - S * 1.2 - my * 12, S * 2.4, S * 2.4);
    // самоизмерване: кадър >9 ms чиста работа в ≥40% от кадрите три секунди подред → степен надолу
    fAll++; if (performance.now() - fStart > 9) fSlow++;
    if (now - secStart >= 1000) { if (fAll > 10 && fSlow / fAll > 0.4) { if (++slowSec >= 3) { degrade(); slowSec = 0; } } else slowSec = 0; fAll = fSlow = 0; secStart = now; }
  }
  var slowSec = 0;
  requestAnimationFrame(frame);
})();
