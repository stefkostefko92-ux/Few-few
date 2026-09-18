// demo.js — клиентска логика на демотата: меню, reveal, прогрес, count-up, sticky/totop, lightbox,
// и „живите" hero карти (резервация · график · кошница). Няма backend — потвържденията са демо.
// Уважава prefers-reduced-motion (клиентските сайтове са „сериозни"). Нула зависимости.
document.documentElement.classList.add("js");
var REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
// LITE: слаба машина по Navigator API → premium.css спира Ken Burns/blend/blur (съдържанието е същото)
if ((navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4) || (navigator.connection && navigator.connection.saveData) || matchMedia("(update: slow)").matches) document.documentElement.classList.add("lite");
(function () {
  var b = document.querySelector(".burger"), m = document.getElementById("menu");
  if (b && m) b.addEventListener("click", function () { var o = m.classList.toggle("open"); b.setAttribute("aria-expanded", String(o)); });
  if (m) m.addEventListener("click", function (e) { if (e.target.tagName === "A") { m.classList.remove("open"); b && b.setAttribute("aria-expanded", "false"); } });
})();
(function () {
  var els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || REDUCED) { els.forEach(function (e) { e.classList.add("in"); }); return; }
  var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  els.forEach(function (e) { if (e.getBoundingClientRect().top < innerHeight) e.classList.add("in"); else io.observe(e); });
  setTimeout(function () { els.forEach(function (e) { e.classList.add("in"); }); }, 2500);
})();
// прогрес на четенето + „нагоре"
(function () {
  var bar = document.querySelector(".progress i"), top = document.querySelector(".totop");
  function on() { var h = document.documentElement, p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1); if (bar) bar.style.transform = "scaleX(" + p.toFixed(4) + ")"; if (top) top.classList.toggle("show", h.scrollTop > 600); }
  addEventListener("scroll", on, { passive: true }); on();
})();
// count-up на числата (само цифровата част; „4 800+" → 0…4 800+)
(function () {
  var els = document.querySelectorAll("[data-countup]");
  if (REDUCED || !("IntersectionObserver" in window)) return;
  var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (!x.isIntersecting) return; io.unobserve(x.target); var el = x.target, raw = el.textContent, m = raw.match(/^([^\d]*)([\d\s., ]+)(.*)$/); if (!m) return; var digits = m[2].replace(/[^\d]/g, ""), target = parseInt(digits, 10); if (!target || digits.length > 6) return; var sep = m[2].replace(/\d/g, "").replace(/\s| /g, "").slice(-1), t0 = performance.now(); (function tick(now) { var k = Math.min(1, (now - t0) / 1200), v = Math.round(target * (1 - Math.pow(1 - k, 3))), str = String(v); if (digits.length > 3 && /[\s ]/.test(m[2])) str = str.replace(/\B(?=(\d{3})+(?!\d))/g, " "); else if (sep === "." && digits.length > 3) str = str.replace(/\B(?=(\d{3})+(?!\d))/g, "."); el.textContent = m[1] + str + m[3]; if (k < 1) requestAnimationFrame(tick); else el.textContent = raw; })(t0); }); }, { threshold: 0.5 });
  els.forEach(function (e) { io.observe(e); });
})();
// демо форма за контакт
document.querySelectorAll(".demo-form").forEach(function (f) { f.addEventListener("submit", function (e) { e.preventDefault(); var o = f.querySelector(".sent"); if (o) o.textContent = o.dataset.msg; f.reset(); }); });
// резервация: услуга → цена; submit → потвърждение с резюме
document.querySelectorAll('[data-widget="booking"]').forEach(function (f) {
  var sel = f.querySelector('select[name="service"]'), out = f.querySelector("[data-price-out]"), date = f.querySelector('input[name="date"]'), done = f.querySelector(".w-done");
  if (date) date.min = new Date().toISOString().slice(0, 10);
  sel.addEventListener("change", function () { var o = sel.selectedOptions[0]; if (o && o.dataset.price) out.textContent = o.dataset.price; });
  f.addEventListener("submit", function (e) { e.preventDefault(); if (!f.checkValidity()) { f.reportValidity(); return; } done.textContent = done.dataset.msg + " — " + sel.value + " · " + (date.value || "") + " " + (f.querySelector('select[name="time"]') || {}).value; });
});
// график: ред → избран; бутонът потвърждава
document.querySelectorAll('[data-widget="schedule"]').forEach(function (w) {
  var rows = w.querySelectorAll("tr"), cta = w.querySelector("[data-cta]"), base = cta && cta.textContent, done = w.querySelector(".w-done"), pick = null;
  function choose(r) { rows.forEach(function (x) { x.setAttribute("aria-pressed", String(x === r)); }); pick = r; if (cta) cta.textContent = base + ": " + r.cells[0].textContent + " " + r.cells[1].textContent + " · " + r.cells[2].textContent; }
  rows.forEach(function (r) { r.addEventListener("click", function () { choose(r); }); r.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(r); } }); });
  var btn = w.querySelector(".w-cta"); if (btn) btn.addEventListener("click", function () { if (!pick) { choose(rows[0]); } done.textContent = done.dataset.msg; });
});
// плочки: избор + брояч + сума (цената се парсва от текста „8,90 €" / „€8.90" / „27 900 €")
document.querySelectorAll('[data-widget="tiles"]').forEach(function (w) {
  var tiles = w.querySelectorAll(".tile"), cart = w.querySelector(".w-cart"), cnt = w.querySelector("[data-count]"), tot = w.querySelector("[data-total]");
  function num(s) { var m = String(s).replace(/[\s ]/g, "").match(/(\d+(?:[.,]\d+)?)/); if (!m) return 0; var v = m[1]; return parseFloat(v.indexOf(",") >= 0 && v.indexOf(".") < 0 ? v.replace(",", ".") : v.replace(/,/g, "")); }
  function upd() { var sel = w.querySelectorAll('.tile[aria-pressed="true"]'), sum = 0; sel.forEach(function (t) { sum += num(t.dataset.price); }); cart.hidden = !sel.length; cnt.textContent = sel.length; var sample = tiles[0].dataset.price, dec = /[.,]\d{2}\b/.test(sample); tot.textContent = sample.indexOf("€") === 0 ? "€" + (dec ? sum.toFixed(2) : Math.round(sum).toLocaleString("en")) : (dec ? sum.toFixed(2).replace(".", ",") : Math.round(sum).toLocaleString("de").replace(/\./g, " ")) + " €"; }
  tiles.forEach(function (t) { t.addEventListener("click", function () { t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") !== "true"); upd(); }); });
  var clr = w.querySelector(".w-clear"); if (clr) clr.addEventListener("click", function () { tiles.forEach(function (t) { t.setAttribute("aria-pressed", "false"); }); upd(); });
});
// lightbox за галерията
(function () {
  var lb = document.getElementById("lightbox"), items = Array.prototype.slice.call(document.querySelectorAll("[data-lightbox]")); if (!lb || !items.length) return;
  var img = lb.querySelector("img"), i = 0;
  var cap = lb.querySelector(".lb-cap"), cnt = lb.querySelector(".lb-count");
  function show(n) { i = (n + items.length) % items.length; img.src = items[i].getAttribute("href"); img.alt = items[i].querySelector("img").alt; if (cap) cap.textContent = items[i].dataset.cap || ""; if (cnt) cnt.textContent = (i + 1) + " / " + items.length; lb.hidden = false; document.body.style.overflow = "hidden"; }
  function hide() { lb.hidden = true; document.body.style.overflow = ""; }
  items.forEach(function (a, n) { a.addEventListener("click", function (e) { e.preventDefault(); show(n); }); });
  lb.querySelector(".lb-close").addEventListener("click", hide); lb.querySelector(".lb-prev").addEventListener("click", function () { show(i - 1); }); lb.querySelector(".lb-next").addEventListener("click", function () { show(i + 1); });
  lb.addEventListener("click", function (e) { if (e.target === lb) hide(); });
  var sx = null; lb.addEventListener("pointerdown", function (e) { sx = e.clientX; }); lb.addEventListener("pointerup", function (e) { if (sx === null) return; var dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 50) show(dx < 0 ? i + 1 : i - 1); });
  addEventListener("keydown", function (e) { if (lb.hidden) return; if (e.key === "Escape") hide(); if (e.key === "ArrowLeft") show(i - 1); if (e.key === "ArrowRight") show(i + 1); });
})();
