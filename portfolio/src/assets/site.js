// site.js — хъб/цени: меню, reveal, запомняне на езика, живи прегледи на демотата (само десктоп).
document.documentElement.classList.add("js");
(function () {
  var b = document.querySelector(".burger"), m = document.getElementById("menu");
  if (b && m) b.addEventListener("click", function () { var o = m.classList.toggle("open"); b.setAttribute("aria-expanded", String(o)); });
  if (m) m.addEventListener("click", function (e) { if (e.target.tagName === "A") { m.classList.remove("open"); b && b.setAttribute("aria-expanded", "false"); } });
})();
(function () {
  try { localStorage.setItem("cs-lang", document.documentElement.lang); } catch (e) {}
})();
(function () {
  var els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) { els.forEach(function (e) { e.classList.add("in"); }); return; }
  var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  els.forEach(function (e) { io.observe(e); });
  // Предпазна мрежа: каквото и да се случи с наблюдателя, нищо не остава скрито задълго.
  setTimeout(function () { els.forEach(function (e) { e.classList.add("in"); }); }, 2500);
})();
(function () {
  // Живи прегледи: истинската демо страница в мащабиран iframe — само на широк екран, само когато
  // картата влезе във viewport, и никога при Save-Data. На телефон остава леката корица.
  if (!("IntersectionObserver" in window) || !matchMedia("(min-width: 981px)").matches) return;
  if (navigator.connection && navigator.connection.saveData) return;
  var covers = document.querySelectorAll(".demo-cover[data-preview]");
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (x) {
      if (!x.isIntersecting) return;
      io.unobserve(x.target);
      var c = x.target, f = document.createElement("iframe");
      f.src = c.dataset.preview; f.loading = "lazy"; f.tabIndex = -1; f.setAttribute("aria-hidden", "true"); f.title = "";
      f.style.setProperty("--s", (c.clientWidth / 1440).toFixed(4));
      f.addEventListener("load", function () { f.classList.add("ready"); });
      c.appendChild(f);
    });
  }, { rootMargin: "200px 0px" });
  covers.forEach(function (c) { io.observe(c); });
  addEventListener("resize", function () { covers.forEach(function (c) { var f = c.querySelector("iframe"); if (f) f.style.setProperty("--s", (c.clientWidth / 1440).toFixed(4)); }); }, { passive: true });
})();
