// fx/core.js — общото ядро на ефектите в демотата (нула зависимости). Дава: canvas в hero-то с DPR
// и пауза извън екрана, pointer в координати на hero-то, reduced-motion режим (един статичен кадър),
// и общите „премиум" похвати за всички демота: spotlight карти (следят курсора), 3D tilt, parallax на
// hero снимката, typewriter, marquee ленти, SVG draw-on. Всеки демо модул (fx/<id>.js) ползва FX.
window.FX = (function () {
  var reduced = matchMedia("(prefers-reduced-motion: reduce)").matches, fine = matchMedia("(pointer: fine)").matches;
  var hero = document.querySelector(".hero");
  var P = { x: 0.5, y: 0.5, vx: 0, vy: 0, in: false, speed: 0 };
  if (hero) hero.addEventListener("pointermove", function (e) { var r = hero.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height; P.vx = nx - P.x; P.vy = ny - P.y; P.speed = Math.min(1, Math.hypot(P.vx, P.vy) * 20); P.x = nx; P.y = ny; P.in = true; }, { passive: true });
  if (hero) hero.addEventListener("pointerleave", function () { P.in = false; });

  /** Canvas на цял hero под текста. draw(ctx, W, H, t, dt) се вика на кадър; при reduced-motion — веднъж. */
  function canvas(draw, opts) {
    if (!hero) return null;
    var cv = document.createElement("canvas"); cv.className = "fx"; cv.setAttribute("aria-hidden", "true");
    hero.insertBefore(cv, hero.querySelector(".word") || hero.firstChild);
    var ctx = cv.getContext("2d"), DPR = Math.min(devicePixelRatio || 1, (opts && opts.dpr) || 2), W = 0, H = 0;
    function size() { var r = hero.getBoundingClientRect(); W = r.width; H = r.height; cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
    size(); addEventListener("resize", size, { passive: true });
    var visible = true, t0 = performance.now(), last = t0;
    if ("IntersectionObserver" in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(cv);
    var api = { cv: cv, ctx: ctx, get W() { return W; }, get H() { return H; }, once: reduced };
    if (reduced) { draw(ctx, W, H, 0, 0, api); return api; }
    (function frame(now) { requestAnimationFrame(frame); if (!visible || document.hidden) return; var dt = Math.min(0.05, (now - last) / 1000); last = now; draw(ctx, W, H, (now - t0) / 1000, dt, api); })(t0);
    return api;
  }

  /** Spotlight: радиален блик, който следва курсора по карти/плочки (CSS vars --mx/--my). */
  function spotlight(sel) {
    if (!fine) return;
    document.querySelectorAll(sel).forEach(function (el) { el.classList.add("spot"); el.addEventListener("pointermove", function (e) { var r = el.getBoundingClientRect(); el.style.setProperty("--mx", (e.clientX - r.left) + "px"); el.style.setProperty("--my", (e.clientY - r.top) + "px"); }, { passive: true }); });
  }
  /** 3D tilt при hover (перспектива, лек, без „люлеене"). */
  function tilt(sel, max) {
    if (!fine || reduced) return; max = max || 6;
    document.querySelectorAll(sel).forEach(function (el) { el.classList.add("tilt"); el.addEventListener("pointermove", function (e) { var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; el.style.transform = "perspective(900px) rotateX(" + (-y * max).toFixed(2) + "deg) rotateY(" + (x * max).toFixed(2) + "deg) translateY(-3px)"; }, { passive: true }); el.addEventListener("pointerleave", function () { el.style.transform = ""; }); });
  }
  /** Parallax на hero снимката/декорацията спрямо скрола и курсора. */
  function parallax(sel, k) {
    if (reduced) return; var els = document.querySelectorAll(sel); if (!els.length) return; k = k || 0.25;
    (function loop() { var y = scrollY; els.forEach(function (el) { el.style.transform = "translate3d(" + ((P.x - 0.5) * -14 * k * 4).toFixed(1) + "px," + (y * k).toFixed(1) + "px,0) scale(1.06)"; }); requestAnimationFrame(loop); })();
  }
  /** Typewriter: пише текста на елемента символ по символ при поява. */
  function typewriter(sel, speed) {
    document.querySelectorAll(sel).forEach(function (el) { var text = el.textContent; if (reduced) return; el.textContent = ""; el.style.minHeight = "1em"; var io = new IntersectionObserver(function (en) { if (!en[0].isIntersecting) return; io.disconnect(); var i = 0; (function tick() { el.textContent = text.slice(0, ++i) + (i < text.length ? "▍" : ""); if (i < text.length) setTimeout(tick, speed || 28); })(); }); io.observe(el); });
  }
  /** Marquee: безкрайна лента (data-marquee="текст · текст"). Пауза при hover (WCAG 2.2.2). */
  function marquee() {
    document.querySelectorAll("[data-marquee]").forEach(function (el) { var t = el.dataset.marquee; el.innerHTML = '<div class="mq-track"><span>' + t + '</span><span aria-hidden="true">' + t + "</span></div>"; });
  }
  /** SVG draw-on: пътища с stroke-dasharray се „рисуват" при поява. */
  function drawOn(sel) {
    document.querySelectorAll(sel + " path, " + sel + " circle, " + sel + " line, " + sel + " polyline").forEach(function (p) { var L = p.getTotalLength ? p.getTotalLength() : 0; if (!L) return; p.style.strokeDasharray = L; p.style.strokeDashoffset = reduced ? 0 : L; });
    if (reduced) return;
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("drawn"); io.unobserve(x.target); } }); }, { threshold: 0.3 });
    document.querySelectorAll(sel).forEach(function (s) { io.observe(s); });
  }
  /** Малка детерминистична „шум" функция за генеративни фонове. */
  function noise(x, y, t) { return (Math.sin(x * 1.7 + t) * Math.cos(y * 1.3 - t * 0.7) + Math.sin((x + y) * 0.9 + t * 0.5)) * 0.5; }
  var api = { reduced: reduced, fine: fine, P: P, hero: hero, canvas: canvas, spotlight: spotlight, tilt: tilt, parallax: parallax, typewriter: typewriter, marquee: marquee, drawOn: drawOn, noise: noise, css: getComputedStyle(document.documentElement) };
  // Общи за всички демота
  spotlight(".card, .tile, .review, .fact, .pl-group"); tilt(".card, .review"); parallax(".hero-bg img", 0.18); marquee();
  return api;
})();
