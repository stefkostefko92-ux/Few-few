// site.js — хъб/цени/правна: boot екран, курсор, глич, FPS HUD, меню, scramble, магнитни бутони и
// букви, reveal, живи прегледи. Нула зависимости. Бранд сайт → пълна анимация, без строб.
document.documentElement.classList.add("js");
var FINE = matchMedia("(pointer: fine)").matches;
var P = { x: innerWidth / 2, y: innerHeight / 2, down: false };
addEventListener("pointermove", function (e) { P.x = e.clientX; P.y = e.clientY; }, { passive: true });
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
  var lines = [["CPU", n.hardwareConcurrency ? n.hardwareConcurrency + " LOGICAL CORES" : "DETECTED"], ["GPU", gpu], ["MEMORY", typeof n.deviceMemory === "number" ? n.deviceMemory + " GB" : "N/A"], ["DISPLAY", screen.width + "x" + screen.height + " @" + (devicePixelRatio || 1) + "X"], ["NETWORK", (n.connection && n.connection.effectiveType || "online").toUpperCase()], ["LOCALE", (n.language || "bg").toUpperCase()], ["DEMOS", "10/10 LOADED"], ["CORE", "CARBON STEALTH VCC"]];
  var list = b.querySelector(".boot-list");
  lines.forEach(function (l) { var d = document.createElement("div"); d.innerHTML = "<span><b>[ OK ]</b> " + l[0] + "</span><span></span>"; d.lastChild.textContent = l[1]; list.appendChild(d); });
  var rows = list.children, i = 0;
  var iv = setInterval(function () { if (i < rows.length) rows[i++].classList.add("on"); else { clearInterval(iv); setTimeout(function () { b.classList.add("out"); setTimeout(function () { b.remove(); }, 850); }, 350); } }, 90);
})();

// --- курсор: ринг + точка + CRT фосфорна следа (само fine pointer) ---
(function () {
  if (!FINE) return;
  document.body.classList.add("cs-custom-cursor");
  var cv = document.createElement("canvas"); cv.className = "cur-trail";
  var ring = document.createElement("div"); ring.className = "cur-ring";
  var dot = document.createElement("div"); dot.className = "cur-dot";
  document.body.append(cv, ring, dot);
  var ctx = cv.getContext("2d"), rx = P.x, ry = P.y;
  function size() { cv.width = innerWidth; cv.height = innerHeight; }
  size(); addEventListener("resize", size);
  addEventListener("pointermove", function (e) {
    dot.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
    var g = ctx.createRadialGradient(e.clientX, e.clientY, 0, e.clientX, e.clientY, 7);
    g.addColorStop(0, "rgba(0,229,255,.55)"); g.addColorStop(1, "rgba(0,229,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.clientX, e.clientY, 7, 0, Math.PI * 2); ctx.fill();
  }, { passive: true });
  addEventListener("pointerover", function (e) {
    var t = e.target.closest && e.target.closest("a, button, input, textarea, summary, [data-cursor]");
    ring.style.width = ring.style.height = t ? "46px" : "26px";
    ring.style.borderColor = t ? "rgba(0,229,255,.9)" : "rgba(0,229,255,.55)";
  }, { passive: true });
  (function loop() {
    rx += (P.x - rx) * 0.18; ry += (P.y - ry) * 0.18;
    ring.style.transform = "translate(" + rx + "px," + ry + "px) translate(-50%,-50%)" + (P.down ? " scale(.8)" : "");
    ctx.fillStyle = "rgba(0,0,0,.06)"; ctx.fillRect(0, 0, cv.width, cv.height);
    requestAnimationFrame(loop);
  })();
})();

// --- клик глич: 150ms cyan scanline + хроматична аберация (без строб — един импулс на клик) ---
addEventListener("pointerdown", function (e) {
  var g = document.createElement("div"); g.className = "glitch"; g.style.top = e.clientY + "px";
  document.body.appendChild(g); document.body.classList.add("glitching");
  setTimeout(function () { g.remove(); document.body.classList.remove("glitching"); }, 150);
});

// --- FPS HUD ---
(function () {
  var el = document.getElementById("fps"); if (!el) return;
  var f = 0, last = performance.now();
  (function tick(now) { f++; if (now - last >= 1000) { el.textContent = f + " FPS"; f = 0; last = now; } requestAnimationFrame(tick); })(last);
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

// --- магнитни бутони + магнитни букви в hero заглавието (fine pointer) ---
(function () {
  if (!FINE) return;
  var btns = document.querySelectorAll("[data-magnetic]"), letters = document.querySelectorAll(".hero h1 .l");
  var state = new Map();
  btns.forEach(function (b) { state.set(b, { x: 0, y: 0, tx: 0, ty: 0 }); b.addEventListener("pointermove", function (e) { var r = b.getBoundingClientRect(), s = state.get(b); s.tx = (e.clientX - (r.left + r.width / 2)) * 0.4; s.ty = (e.clientY - (r.top + r.height / 2)) * 0.4; }); b.addEventListener("pointerleave", function () { var s = state.get(b); s.tx = 0; s.ty = 0; }); });
  (function loop() {
    state.forEach(function (s, b) { s.x += (s.tx - s.x) * 0.15; s.y += (s.ty - s.y) * 0.15; if (Math.abs(s.x) > 0.05 || Math.abs(s.y) > 0.05) b.style.transform = "translate(" + s.x.toFixed(2) + "px," + s.y.toFixed(2) + "px)"; else b.style.transform = ""; });
    letters.forEach(function (l) { var r = l.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, dx = cx - P.x, dy = cy - P.y, d = Math.hypot(dx, dy), R = 140; if (d < R && d > 0) { var k = (1 - d / R) * 22; l.style.transform = "translate(" + (dx / d * k).toFixed(1) + "px," + (dy / d * k).toFixed(1) + "px)"; l.style.fontWeight = String(Math.round(900 - (1 - d / R) * 500)); } else if (l.style.transform) { l.style.transform = ""; l.style.fontWeight = ""; } });
    requestAnimationFrame(loop);
  })();
})();

// --- живи прегледи на демотата (десктоп, при влизане във viewport, никога при Save-Data) ---
(function () {
  if (!("IntersectionObserver" in window) || !matchMedia("(min-width: 901px)").matches) return;
  if (navigator.connection && navigator.connection.saveData) return;
  var covers = document.querySelectorAll(".demo-cover[data-preview]");
  var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (!x.isIntersecting) return; io.unobserve(x.target); var c = x.target, f = document.createElement("iframe"); f.src = c.dataset.preview; f.loading = "lazy"; f.tabIndex = -1; f.setAttribute("aria-hidden", "true"); f.title = ""; f.style.setProperty("--s", (c.clientWidth / 1440).toFixed(4)); f.addEventListener("load", function () { f.classList.add("ready"); }); c.appendChild(f); }); }, { rootMargin: "200px 0px" });
  covers.forEach(function (c) { io.observe(c); });
  addEventListener("resize", function () { covers.forEach(function (c) { var f = c.querySelector("iframe"); if (f) f.style.setProperty("--s", (c.clientWidth / 1440).toFixed(4)); }); }, { passive: true });
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
