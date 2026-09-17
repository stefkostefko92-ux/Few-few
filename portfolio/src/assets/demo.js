// demo.js — минимална клиентска логика за демотата: меню, reveal, демо форма. Без зависимости.
document.documentElement.classList.add("js");
(function () {
  var b = document.querySelector(".burger"), m = document.getElementById("menu");
  if (b && m) b.addEventListener("click", function () { var o = m.classList.toggle("open"); b.setAttribute("aria-expanded", String(o)); });
  if (m) m.addEventListener("click", function (e) { if (e.target.tagName === "A") { m.classList.remove("open"); b && b.setAttribute("aria-expanded", "false"); } });
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
  // Демо формата не изпраща нищо (няма backend в портфолиото) — показва какво би се случило.
  document.querySelectorAll(".demo-form").forEach(function (f) {
    f.addEventListener("submit", function (e) { e.preventDefault(); var o = f.querySelector(".sent"); if (o) o.textContent = o.dataset.msg; f.reset(); });
  });
})();
