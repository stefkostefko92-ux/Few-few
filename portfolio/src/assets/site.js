// site.js — хъб/цени/правна/блог: меню, „Анимации: стоп", LITE детектор, живи прегледи, формата, преглед на
// устройства. Нула зависимости. Визията е тиха (Рейвънхолд — смелостта е само в бурята на hero.js), затова тук
// няма курсор, глич, scramble, магнити и reveal анимации. ЕДИН rAF цикъл (FRAME[]) носи FPS детектора:
// слаба машина по Navigator API или измерени <40 FPS две секунди подред → LITE (hero.js замръзва, без зърно).
document.documentElement.classList.add("js");
var FINE = matchMedia("(pointer: fine)").matches;
var PAUSED = false; try { PAUSED = localStorage.getItem("cs-lite") === "1"; } catch (e) {} // изборът „Анимации: стоп" (WCAG 2.2.2) се помни
var LITE = PAUSED || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4) || (navigator.connection && navigator.connection.saveData) || matchMedia("(update: slow)").matches;
function goLite() { if (LITE) return; LITE = true; document.documentElement.classList.add("lite"); dispatchEvent(new Event("cs-lite")); }
if (LITE) document.documentElement.classList.add("lite");
var FRAME = []; // задачи за общия rAF цикъл: fn(now) — всяка сама решава дали има работа

// --- FPS детектор: две поредни секунди под 40 FPS (при видим таб) → LITE режим ---
(function () {
  var f = 0, last = performance.now(), slow = 0;
  FRAME.push(function (now) {
    f++; if (now - last < 1000) return;
    if (!document.hidden && now > 4000 && now - last < 1500) { slow = f < 40 ? slow + 1 : 0; if (slow >= 2) goLite(); } // първите 4 s са зареждане, не се броят
    f = 0; last = now;
  });
})();

// --- общият цикъл: един requestAnimationFrame (днес само FPS детекторът) ---
(function loop(now) { for (var i = 0; i < FRAME.length; i++) FRAME[i](now); requestAnimationFrame(loop); })(performance.now());

// --- „Анимации: стоп" — потребителски контрол за движещото се съдържание (WCAG 2.2.2); включва LITE режима и се помни ---
(function () {
  var ts = document.querySelectorAll("[data-fx-toggle]"); if (!ts.length) return;
  function mark() { ts.forEach(function (t) { t.setAttribute("aria-pressed", "true"); t.textContent = t.dataset.on; t.disabled = true; }); }
  if (PAUSED) mark();
  ts.forEach(function (t) { t.addEventListener("click", function () { try { localStorage.setItem("cs-lite", "1"); } catch (e) {} goLite(); mark(); }); });
})();

// --- меню + език ---
(function () {
  var b = document.querySelector(".burger"), m = document.getElementById("menu");
  if (b && m) { b.addEventListener("click", function () { var o = m.classList.toggle("open"); b.setAttribute("aria-expanded", String(o)); b.textContent = o ? "✕" : "≡"; }); m.addEventListener("click", function (e) { if (e.target.tagName === "A") { m.classList.remove("open"); b.textContent = "≡"; } }); }
  try { localStorage.setItem("cs-lang", document.documentElement.lang); } catch (e) {}
})();

// --- живи прегледи на демотата: картата носи статична снимка (img/previews); живият iframe се зарежда
// САМО при hover (fine pointer, ≥901px, не LITE, не Save-Data) и живи са най-много 2 — най-старият се маха.
// Преди: 10 пълни документа с анимации в 10 iframe-а = основният лаг на хъба на слаба машина. ---
(function () {
  if (!FINE || LITE || !matchMedia("(min-width: 901px)").matches) return;
  if (navigator.connection && navigator.connection.saveData) return;
  var covers = document.querySelectorAll(".demo-cover[data-preview]"), alive = [], MAX = 2;
  function scale(c, f) { f.style.setProperty("--s", (c.clientWidth / 1440).toFixed(4)); }
  function mount(c) {
    if (c.querySelector("iframe")) return;
    while (alive.length >= MAX) { var old = alive.shift(); var oldF = old.querySelector("iframe"); if (oldF) oldF.remove(); }
    var f = document.createElement("iframe"); f.src = c.dataset.preview; f.tabIndex = -1; f.setAttribute("aria-hidden", "true"); f.title = "";
    scale(c, f); f.addEventListener("load", function () { f.classList.add("ready"); }); c.appendChild(f); alive.push(c);
  }
  covers.forEach(function (c) { c.addEventListener("pointerenter", function () { mount(c); }, { passive: true }); });
  addEventListener("resize", function () { alive.forEach(function (c) { var f = c.querySelector("iframe"); if (f) scale(c, f); }); }, { passive: true });
  addEventListener("cs-lite", function () { alive.forEach(function (c) { var f = c.querySelector("iframe"); if (f) f.remove(); }); alive = []; });
})();

// --- формата за запитване: POST /api/contact като JSON, съобщение на място; ?demo=<id> избира демото.
// Без JS формата работи като обикновен POST (API-то връща HTML). При мрежова/сървърна грешка — mailto. ---
(function () {
  var f = document.getElementById("cform"); if (!f) return;
  var st = f.querySelector(".c-status"), btn = f.querySelector("button[type=submit]"), T = {};
  try { T = JSON.parse(f.dataset.t || "{}"); } catch (e) {}
  try { var d = new URLSearchParams(location.search).get("demo"); if (d && f.elements.demo) f.elements.demo.value = d; } catch (e) {}
  function status(text, cls) { st.textContent = text; st.className = "c-status" + (cls ? " " + cls : ""); }
  f.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!f.checkValidity()) { f.reportValidity(); status(T.invalid, "err"); return; }
    var body = {};
    Array.prototype.forEach.call(f.elements, function (el) { if (el.name && el.type !== "checkbox" && el.type !== "submit") body[el.name] = el.value; });
    body.consent = !!(f.elements.consent && f.elements.consent.checked);
    btn.disabled = true; status(T.sending, "");
    fetch(f.action, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: false, j: {} }; }); })
      .then(function (x) { if (x.ok) { f.reset(); status(T.sent, "ok"); } else status(x.j && x.j.errors ? T.invalid : T.error, "err"); })
      .catch(function () { status(T.error, "err"); })
      .then(function () { btn.disabled = false; });
  });
})();

// --- преглед на устройства: iframe на демото в десктоп · таблет · телефон рамка ---
(function () {
  var m = document.getElementById("devmodal"); if (!m) return;
  var fr = m.querySelector(".dev-frame"), f = fr.querySelector("iframe"), name = m.querySelector(".dev-name"), open = m.querySelector(".dev-open"), sw = m.querySelectorAll(".dev-switch button"), last = null;
  function set(w) { fr.style.setProperty("--w", w + "px"); fr.classList.toggle("phone", w < 500); fr.classList.toggle("tablet", w >= 500 && w < 1000); sw.forEach(function (b) { b.classList.toggle("on", b.dataset.w === String(w)); }); }
  function show(href, n, btn) { last = btn; f.src = href; name.textContent = n; open.href = href; m.hidden = false; document.body.style.overflow = "hidden"; m.querySelector(".dev-close").focus(); }
  function hide() { m.hidden = true; f.src = "about:blank"; document.body.style.overflow = ""; if (last) last.focus(); }
  document.querySelectorAll(".dev-btn").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.device, b.dataset.name, b); }); });
  sw.forEach(function (b) { b.addEventListener("click", function () { set(+b.dataset.w); }); });
  m.querySelector(".dev-close").addEventListener("click", hide);
  addEventListener("keydown", function (e) { if (!m.hidden && e.key === "Escape") hide(); });
})();
