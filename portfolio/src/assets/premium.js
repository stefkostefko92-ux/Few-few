// premium.js — поведението на демотата отвъд demo.js: навигация, която се скрива при скрол надолу и
// маркира активната секция; плавно отваряне на FAQ. Уважава prefers-reduced-motion. Fail-open — без
// този файл всичко е четимо и работи (обикновен <details>, обикновена sticky навигация).
(function () {
  var R = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nav = document.querySelector(".nav"), menu = document.getElementById("menu"), last = scrollY;
  addEventListener("scroll", function () { var y = scrollY; if (nav) nav.classList.toggle("hide", y > last && y > 320 && !(menu && menu.classList.contains("open"))); last = y; }, { passive: true });
  var links = Array.prototype.slice.call(document.querySelectorAll('.menu a[href^="#"]')), secs = links.map(function (a) { return document.querySelector(a.getAttribute("href")); }).filter(Boolean);
  if ("IntersectionObserver" in window && secs.length) { var spy = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + x.target.id); }); }); }, { rootMargin: "-40% 0px -55% 0px" }); secs.forEach(function (s) { spy.observe(s); }); }
  document.querySelectorAll("details.faq").forEach(function (d) {
    var s = d.querySelector("summary"), body = d.querySelector(".fa"); if (!s || !body) return;
    if (d.open) d.classList.add("show");
    s.addEventListener("click", function (e) {
      if (R) return; e.preventDefault();
      if (d.open) { d.classList.remove("show"); var done = false; function fin() { if (done) return; done = true; d.open = false; } body.addEventListener("transitionend", fin, { once: true }); setTimeout(fin, 450); }
      else { d.open = true; requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add("show"); }); }); }
    });
  });
})();
