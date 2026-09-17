// hero.js — „THE FORGE CORE" в чист 2D canvas (псевдо-3D проекция, без WebGL и без библиотеки):
// fresnel-кристал (икосаедър с вътрешно ядро), два орбитални пръстена и частици по сферични
// обвивки с отблъскване от курсора, адитивно смесване. Степенува по капацитет на устройството.
(function () {
  var cv = document.getElementById("hero-canvas"); if (!cv) return;
  var ctx = cv.getContext("2d"); if (!ctx) return;
  var coarse = matchMedia("(pointer: coarse)").matches, small = innerWidth < 820;
  var lowMem = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
  var N = coarse || small || lowMem ? 700 : 1800, DPR = Math.min(devicePixelRatio || 1, coarse ? 1.5 : 2);
  var W, H, CX, CY, S;
  function size() { var r = cv.parentElement.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); CX = W * (W > 900 ? 0.68 : 0.5); CY = H * 0.5; S = Math.min(W, H) * 0.19; }
  size(); addEventListener("resize", size, { passive: true });
  // икосаедър
  var phi = (1 + Math.sqrt(5)) / 2, V = [[-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0], [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi], [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]].map(function (v) { var l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; });
  var E = []; for (var i = 0; i < 12; i++) for (var j = i + 1; j < 12; j++) { var d = Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]); if (d < 1.1) E.push([i, j]); }
  // частици: сферични обвивки r 1.9–3.5
  var Pt = new Float32Array(N * 4);
  for (var k = 0; k < N; k++) { var r = 1.9 + Math.random() * 1.6, t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1); Pt[k * 4] = r * Math.sin(p) * Math.cos(t); Pt[k * 4 + 1] = r * Math.cos(p); Pt[k * 4 + 2] = r * Math.sin(p) * Math.sin(t); Pt[k * 4 + 3] = Math.random(); }
  var mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener("pointermove", function (e) { var r = cv.getBoundingClientRect(); tmx = (e.clientX - r.left) / W * 2 - 1; tmy = -((e.clientY - r.top) / H * 2 - 1); }, { passive: true });
  function rot(v, ax, ay) { var x = v[0], y = v[1], z = v[2]; var cy = Math.cos(ay), sy = Math.sin(ay), cx = Math.cos(ax), sx = Math.sin(ax); var x1 = x * cy - z * sy, z1 = x * sy + z * cy; var y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx; return [x1, y1, z2]; }
  function proj(v, scale) { var z = v[2] + 4.4, f = 4.4 / z; return [CX + v[0] * scale * f + mx * 18, CY - v[1] * scale * f - my * 12, f]; }
  var t0 = performance.now(), visible = true, hidden = false;
  new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(cv);
  document.addEventListener("visibilitychange", function () { hidden = document.hidden; });
  function frame(now) {
    requestAnimationFrame(frame); if (!visible || hidden) return;
    var t = (now - t0) / 1000; mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    // фоново течно поле
    var g = ctx.createRadialGradient(CX + mx * 40, CY - my * 30, 0, CX, CY, S * 4.2); g.addColorStop(0, "rgba(0,229,255,.10)"); g.addColorStop(0.5, "rgba(0,229,255,.025)"); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    // частици
    var ay = t * 0.08, ax = Math.sin(t * 0.13) * 0.3, pmx = CX + mx * W * 0.5, pmy = CY - my * H * 0.5;
    for (var k = 0; k < N; k++) {
      var seed = Pt[k * 4 + 3], v = rot([Pt[k * 4], Pt[k * 4 + 1] + Math.sin(t * 0.9 + seed * 6.28) * 0.08, Pt[k * 4 + 2]], ax, ay + seed * 0.4), q = proj(v, S);
      var dx = q[0] - pmx, dy = q[1] - pmy, d = Math.hypot(dx, dy); if (d < 160) { var push = (1 - d / 160) * 40; q[0] += dx / (d || 1) * push; q[1] += dy / (d || 1) * push; }
      var a = 0.25 + q[2] * 0.45, sz = (0.6 + seed * 1.4) * q[2];
      ctx.fillStyle = seed > 0.92 ? "rgba(0,255,136," + a + ")" : "rgba(0,229,255," + a + ")"; ctx.fillRect(q[0], q[1], sz, sz);
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
  }
  requestAnimationFrame(frame);
})();
