// premium.js — „премиум" поведението на демотата (върху demo.js + fx/core.js): заглавия дума по дума,
// завеса при вход (веднъж на страница за сесия), скриваща се навигация + активна секция, курсор в цвета
// на бранда, магнитни бутони, плавно отваряне на FAQ. Уважава prefers-reduced-motion и Save-Data.
// Fail-open: без този файл страницата е напълно четима (CSS-ът не крие нищо без класове оттук).
(function () {
  var R = matchMedia("(prefers-reduced-motion: reduce)").matches, FINE = matchMedia("(pointer: fine)").matches;
  // --- заглавия дума по дума (hero: CSS анимация при зареждане; .h2: при поява) ---
  function split(el, cls) {
    var i = 0;
    (function walk(n) { Array.prototype.slice.call(n.childNodes).forEach(function (c) { if (c.nodeType === 3) { var f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach(function (p) { if (!p) return; if (/^\s+$/.test(p)) { f.appendChild(document.createTextNode(" ")); return; } var w = document.createElement("span"); w.className = "wd"; var s = document.createElement("span"); s.textContent = p; s.style.setProperty("--i", i++); w.appendChild(s); f.appendChild(w); }); n.replaceChild(f, c); } else if (c.nodeType === 1 && c.tagName !== "svg") walk(c); }); })(el);
    el.classList.add("sp", cls);
  }
  if (!R) {
    document.querySelectorAll(".hero h1").forEach(function (h) { split(h, "sp-load"); });
    var h2 = document.querySelectorAll("main .h2"); h2.forEach(function (h) { split(h, "sp-io"); });
    if ("IntersectionObserver" in window) { var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: 0.2 }); h2.forEach(function (h) { if (h.getBoundingClientRect().top < innerHeight) h.classList.add("in"); else io.observe(h); }); }
    setTimeout(function () { h2.forEach(function (h) { h.classList.add("in"); }); }, 3000);
  }
  // --- завеса: веднъж на страница за сесия; никога при reduced-motion / Save-Data ---
  var cur = document.querySelector(".curtain");
  if (cur) {
    var skip = R || (navigator.connection && navigator.connection.saveData);
    try { var k = "cs-curtain:" + location.pathname; if (sessionStorage.getItem(k)) skip = true; else sessionStorage.setItem(k, "1"); } catch (e) {}
    if (skip) cur.remove(); else setTimeout(function () { cur.remove(); }, 1700);
  }
  // --- навигация: скрива се при скрол надолу, показва се нагоре; активна секция в менюто ---
  var nav = document.querySelector(".nav"), menu = document.getElementById("menu"), last = scrollY;
  addEventListener("scroll", function () { var y = scrollY; if (nav) nav.classList.toggle("hide", y > last && y > 320 && !(menu && menu.classList.contains("open"))); last = y; }, { passive: true });
  var links = Array.prototype.slice.call(document.querySelectorAll('.menu a[href^="#"]')), secs = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
  if ("IntersectionObserver" in window && secs.length) { var spy = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + x.target.id); }); }); }, { rootMargin: "-40% 0px -55% 0px" }); secs.forEach(function (s) { spy.observe(s); }); }
  // --- курсор в цвета на бранда + магнитни бутони (само fine pointer) ---
  if (FINE && !R) {
    document.body.classList.add("cur-on");
    var ring = document.createElement("div"); ring.className = "cur"; var dot = document.createElement("div"); dot.className = "cur-dot"; document.body.append(ring, dot);
    var x = innerWidth / 2, y = innerHeight / 2, rx = x, ry = y;
    addEventListener("pointermove", function (e) { x = e.clientX; y = e.clientY; dot.style.transform = "translate(" + x + "px," + y + "px)"; }, { passive: true });
    addEventListener("pointerover", function (e) { var t = e.target.closest && e.target.closest("a, button, summary, input, select, textarea, .tile, [role=button]"); ring.classList.toggle("on", !!t); }, { passive: true });
    document.documentElement.addEventListener("mouseleave", function () { ring.style.opacity = "0"; dot.style.opacity = "0"; });
    document.documentElement.addEventListener("mouseenter", function () { ring.style.opacity = "1"; dot.style.opacity = "1"; });
    (function loop() { rx += (x - rx) * 0.2; ry += (y - ry) * 0.2; ring.style.transform = "translate(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px) translate(-50%,-50%)"; requestAnimationFrame(loop); })();
    document.querySelectorAll(".btn-primary, .btn-ghost, .btn-nav").forEach(function (b) { b.addEventListener("pointermove", function (e) { var r = b.getBoundingClientRect(); b.style.transform = "translate(" + ((e.clientX - r.left - r.width / 2) * 0.25).toFixed(1) + "px," + ((e.clientY - r.top - r.height / 2) * 0.25).toFixed(1) + "px)"; }, { passive: true }); b.addEventListener("pointerleave", function () { b.style.transform = ""; }); });
  }
  // --- FAQ: плавно отваряне/затваряне (grid-template-rows), без JS — обикновен <details> ---
  document.querySelectorAll("details.faq").forEach(function (d) {
    var s = d.querySelector("summary"), body = d.querySelector(".fa"); if (!s || !body) return;
    if (d.open) d.classList.add("show");
    s.addEventListener("click", function (e) {
      if (R) return; e.preventDefault();
      if (d.open) { d.classList.remove("show"); var done = false; function fin() { if (done) return; done = true; d.open = false; } body.addEventListener("transitionend", fin, { once: true }); setTimeout(fin, 500); }
      else { d.open = true; requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add("show"); }); }); }
    });
  });
})();
