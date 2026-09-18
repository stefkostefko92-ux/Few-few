// site.js — хъб/цени/правна: boot екран, курсор, глич, FPS HUD, меню, scramble, магнитни бутони и
// букви, reveal, живи прегледи. Нула зависимости. Бранд сайт → пълна анимация, без строб.
// Производителност: ЕДИН rAF цикъл за всичко (курсор · магнити · FPS), работа само когато курсорът е
// мърдал, никакъв full-screen canvas/blend всеки кадър, живи iframe-и само при hover (≤2). LITE режимът
// (слаба машина по Navigator API или измерени <40 FPS две секунди подред) сваля ефектите още.
document.documentElement.classList.add("js");
var FINE = matchMedia("(pointer: fine)").matches;
var PAUSED = false; try { PAUSED = localStorage.getItem("cs-lite") === "1"; } catch (e) {} // изборът „Анимации: стоп" (WCAG 2.2.2) се помни
var LITE = PAUSED || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4) || (navigator.connection && navigator.connection.saveData) || matchMedia("(update: slow)").matches;
function goLite() { if (LITE) return; LITE = true; document.documentElement.classList.add("lite"); dispatchEvent(new Event("cs-lite")); }
if (LITE) document.documentElement.classList.add("lite");
var P = { x: innerWidth / 2, y: innerHeight / 2, down: false, moved: false };
addEventListener("pointermove", function (e) { P.x = e.clientX; P.y = e.clientY; P.moved = true; }, { passive: true });
var FRAME = []; // задачи за общия rAF цикъл: fn(now) — всяка сама решава дали има работа
addEventListener("pointerdown", function () { P.down = true; });
addEventListener("pointerup", function () { P.down = false; });

// --- BIOS POST boot (реални данни от Navigator API; веднъж на сесия) ---
(function () {
  var b = document.getElementById("boot");
  if (!b) return;
  var seen = false;
  try { seen = sessionStorage.getItem("cs-boot") === "1"; sessionStorage.setItem("cs-boot", "1"); } catch (e) {}
  if (seen) { b.remove(); return; }
  var n = navigator, gpu = "GPU";
  try { var c = document.createElement("canvas"), gl = c.getContext("webgl2") || c.getContext("webgl"); if (gl) { var ext = gl.getExtension("WEBGL_debug_renderer_info"); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).replace(/\s*\(.*?\)\s*/g, " ").trim().slice(0, 42).toUpperCase() || "GPU"; } else gpu = "NO WEBGL"; } catch (e) { gpu = "GPU UNKNOWN"; }
  var lines = [["CPU", n.hardwareConcurrency ? n.hardwareConcurrency + " LOGICAL CORES" : "DETECTED"], ["GPU", gpu], ["MEMORY", typeof n.deviceMemory === "number" ? n.deviceMemory + " GB" : "N/A"], ["DISPLAY", screen.width + "x" + screen.height + " @" + (devicePixelRatio || 1) + "X"], ["NETWORK", (n.connection && n.connection.effectiveType || "online").toUpperCase()], ["LOCALE", (n.language || "bg").toUpperCase()], ["DEMOS", (b.dataset.n || "15") + "/" + (b.dataset.n || "15") + " LOADED"], ["CORE", "CARBON STEALTH VCC"]];
  var list = b.querySelector(".boot-list");
  lines.forEach(function (l) { var d = document.createElement("div"); d.innerHTML = "<span><b>[ OK ]</b> " + l[0] + "</span><span></span>"; d.lastChild.textContent = l[1]; list.appendChild(d); });
  var rows = list.children, i = 0;
  var iv = setInterval(function () { if (i < rows.length) rows[i++].classList.add("on"); else { clearInterval(iv); setTimeout(function () { b.classList.add("out"); setTimeout(function () { b.remove(); }, 850); }, 350); } }, 90);
})();

// --- курсор: ринг + точка (само fine pointer). Фосфорната следа е махната: full-screen canvas с
// mix-blend-mode:screen, презаписван всеки кадър, беше най-скъпият слой на слаба GPU. ---
(function () {
  if (!FINE || LITE) return;
  document.body.classList.add("cs-custom-cursor");
  var ring = document.createElement("div"); ring.className = "cur-ring";
  var dot = document.createElement("div"); dot.className = "cur-dot";
  document.body.append(ring, dot);
  var rx = P.x, ry = P.y, lastDown = false;
  addEventListener("pointermove", function (e) { dot.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; }, { passive: true });
  addEventListener("pointerover", function (e) {
    var t = e.target.closest && e.target.closest("a, button, input, textarea, summary, [data-cursor]");
    ring.style.width = ring.style.height = t ? "46px" : "26px";
    ring.style.borderColor = t ? "rgba(0,229,255,.9)" : "rgba(0,229,255,.55)";
  }, { passive: true });
  FRAME.push(function () {
    var dx = P.x - rx, dy = P.y - ry;
    if (Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2 && P.down === lastDown) return; // няма движение → нула работа
    rx += dx * 0.18; ry += dy * 0.18; lastDown = P.down;
    ring.style.transform = "translate(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px) translate(-50%,-50%)" + (P.down ? " scale(.8)" : "");
  });
})();

// --- клик глич: 150ms cyan scanline + хроматична аберация (без строб — един импулс на клик) ---
addEventListener("pointerdown", function (e) {
  var g = document.createElement("div"); g.className = "glitch"; g.style.top = e.clientY + "px";
  document.body.appendChild(g); document.body.classList.add("glitching");
  setTimeout(function () { g.remove(); document.body.classList.remove("glitching"); }, 150);
});

// --- FPS HUD + детектор: две поредни секунди под 40 FPS (при видим таб) → LITE режим ---
(function () {
  var el = document.getElementById("fps"), f = 0, last = performance.now(), slow = 0;
  FRAME.push(function (now) {
    f++; if (now - last < 1000) return;
    if (el) el.textContent = f + " FPS";
    if (!document.hidden && now > 4000 && now - last < 1500) { slow = f < 40 ? slow + 1 : 0; if (slow >= 2) goLite(); } // първите 4 s са зареждане, не се броят
    f = 0; last = now;
  });
})();

// --- общият цикъл: един requestAnimationFrame за курсор · магнити · FPS ---
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

// --- scramble декодиране (hover / при поява) ---
var CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&<>{}|/\\";
function scramble(el) {
  if (el._raf) cancelAnimationFrame(el._raf);
  var text = el.dataset.text || (el.dataset.text = el.textContent), f = 0, n = text.length;
  (function tick() {
    var p = f / 2, out = "";
    for (var i = 0; i < n; i++) out += i < p ? text[i] : text[i] === " " ? " " : CHARSET[Math.floor(Math.random() * CHARSET.length)];
    el.textContent = out; f++;
    if (p < n) el._raf = requestAnimationFrame(tick); else el.textContent = text;
  })();
}
document.querySelectorAll("[data-scramble]").forEach(function (el) { el.addEventListener("pointerenter", function () { scramble(el); }); });

// --- reveal (каскада по секция) + scramble-auto ---
(function () {
  var els = document.querySelectorAll(".reveal"), auto = document.querySelectorAll("[data-scramble-auto]");
  if (!("IntersectionObserver" in window)) { els.forEach(function (e) { e.classList.add("in"); }); return; }
  var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (!x.isIntersecting) return; var el = x.target, sib = el.parentElement ? Array.prototype.indexOf.call(el.parentElement.querySelectorAll(".reveal"), el) : 0; el.style.transition = "opacity .7s cubic-bezier(.16,1,.3,1) " + (Math.max(sib, 0) * 50) + "ms, transform .7s cubic-bezier(.16,1,.3,1) " + (Math.max(sib, 0) * 50) + "ms"; el.classList.add("in"); io.unobserve(el); }); }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
  // Каквото е във viewport-а при зареждане се показва веднага (без да чака наблюдателя).
  els.forEach(function (e) { if (e.getBoundingClientRect().top < innerHeight) e.classList.add("in"); else io.observe(e); });
  var io2 = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { scramble(x.target); io2.unobserve(x.target); } }); }, { threshold: 0.3 });
  auto.forEach(function (e) { io2.observe(e); });
  setTimeout(function () { els.forEach(function (e) { e.classList.add("in"); }); }, 2500);
})();

// --- магнитни бутони + магнитни букви в hero заглавието (fine pointer, не LITE) ---
// Буквите: правоъгълниците се кешират и се мерят само при resize/scroll (не getBoundingClientRect ×20 всеки
// кадър), работа само след движение на курсора, само transform (font-weight на variable шрифт = пренареждане
// на текста всеки кадър — махнато).
(function () {
  if (!FINE || LITE) return;
  var btns = document.querySelectorAll("[data-magnetic]"), letters = Array.prototype.slice.call(document.querySelectorAll(".hero h1 .l"));
  var state = new Map(), rects = null, hero = document.querySelector(".hero"), heroRect = null;
  btns.forEach(function (b) { state.set(b, { x: 0, y: 0, tx: 0, ty: 0 }); b.addEventListener("pointermove", function (e) { var r = b.getBoundingClientRect(), s = state.get(b); s.tx = (e.clientX - (r.left + r.width / 2)) * 0.4; s.ty = (e.clientY - (r.top + r.height / 2)) * 0.4; }); b.addEventListener("pointerleave", function () { var s = state.get(b); s.tx = 0; s.ty = 0; }); });
  function measure() { rects = null; heroRect = null; }
  addEventListener("resize", measure, { passive: true }); addEventListener("scroll", measure, { passive: true });
  var active = false;
  FRAME.push(function () {
    state.forEach(function (s, b) { if (Math.abs(s.tx - s.x) < 0.05 && Math.abs(s.ty - s.y) < 0.05) return; s.x += (s.tx - s.x) * 0.15; s.y += (s.ty - s.y) * 0.15; b.style.transform = Math.abs(s.x) > 0.05 || Math.abs(s.y) > 0.05 ? "translate(" + s.x.toFixed(2) + "px," + s.y.toFixed(2) + "px)" : ""; });
    if (!letters.length || !P.moved) return; P.moved = false;
    if (!heroRect && hero) heroRect = hero.getBoundingClientRect();
    var inside = heroRect && P.y >= heroRect.top && P.y <= heroRect.bottom;
    if (!inside) { if (active) { letters.forEach(function (l) { l.style.transform = ""; }); active = false; } return; }
    if (!rects) rects = letters.map(function (l) { var r = l.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    active = true;
    for (var i = 0; i < letters.length; i++) { var dx = rects[i][0] - P.x, dy = rects[i][1] - P.y, d = Math.hypot(dx, dy), R = 140, l = letters[i]; if (d < R && d > 0) { var k = (1 - d / R) * 22; l.style.transform = "translate(" + (dx / d * k).toFixed(1) + "px," + (dy / d * k).toFixed(1) + "px)"; } else if (l.style.transform) l.style.transform = ""; }
  });
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
  function show(href, n, btn) { last = btn; f.src = href; name.textContent = "// " + n; open.href = href; m.hidden = false; document.body.style.overflow = "hidden"; m.querySelector(".dev-close").focus(); }
  function hide() { m.hidden = true; f.src = "about:blank"; document.body.style.overflow = ""; if (last) last.focus(); }
  document.querySelectorAll(".dev-btn").forEach(function (b) { b.addEventListener("click", function () { show(b.dataset.device, b.dataset.name, b); }); });
  sw.forEach(function (b) { b.addEventListener("click", function () { set(+b.dataset.w); }); });
  m.querySelector(".dev-close").addEventListener("click", hide);
  addEventListener("keydown", function (e) { if (!m.hidden && e.key === "Escape") hide(); });
})();
