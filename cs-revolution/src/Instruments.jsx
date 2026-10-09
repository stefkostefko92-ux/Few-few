import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// INSTRUMENTS — the site-wide motion system (visual pass 2026-10).
//
// One idea runs through every effect here: the page is a measuring
// bench. Light glints across machined chrome type, a caliper measures
// whatever you point at, sections calibrate (registration marks) as
// they arrive, numbers roll on mechanical drums, cards are traced by a
// probe. Nothing is a generic "particles/scramble" effect.
//
// Contract (same as HeroSignature / ScrollInstrument):
// - prefers-reduced-motion → no loops, no pointer tracking, static
//   final states (the global CSS rule in App.jsx also zeroes durations);
// - pointer effects only on (hover:hover) and (pointer:fine);
// - every listener / observer / rAF is cleaned up;
// - decorative layers are aria-hidden + pointer-events:none;
// - nothing flashes (WCAG 2.3.1): every repeat is ≥ 1.4 s and soft.
// Tokens duplicated from App.jsx on purpose (App does not export them).
// ═══════════════════════════════════════════════════════════════

var C = "#00e5ff";
var CR = "0,229,255";
var INK = "#C9D1D6";
var INK2 = "#7C868D";
var WARN = "#FF6A3D";
var EASE = "cubic-bezier(.22,1,.36,1)";
var MONO = "'Space Mono','JetBrains Mono','SM-fallback',ui-monospace,monospace";

export function reducedMotion() {
  try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; }
}
export function finePointer() {
  try { return !!(window.matchMedia && window.matchMedia("(hover:hover) and (pointer:fine)").matches); } catch (e) { return false; }
}

// Registered custom properties interpolate (smooth glint / gauges); without
// support they simply jump — the layout and the text never depend on them.
var registered = false;
function registerProps() {
  if (registered) return; registered = true;
  if (!(window.CSS && CSS.registerProperty)) return;
  [["--sx", "<percentage>", "-40%"], ["--sa", "<number>", "0"], ["--trace", "<angle>", "0deg"]].forEach(function (p) {
    try { CSS.registerProperty({ name: p[0], syntax: p[1], inherits: false, initialValue: p[2] }); } catch (e) {}
  });
}

// ── 1. ONE LIGHT SOURCE ─────────────────────────────────────────
// Every chrome heading (.cs-chrome) is lit by the same virtual lamp: a
// narrow specular band with a cyan fringe. It sweeps once when the heading
// first enters the viewport (the "machined part catches the light"), then
// follows the pointer on desktop — fading with vertical distance, so only
// headings near the pointer shine.
export function useChromeLight(dep) {
  useEffect(function () {
    registerProps();
    if (reducedMotion() || !("IntersectionObserver" in window)) return;
    var els = [].slice.call(document.querySelectorAll(".cs-chrome"));
    if (!els.length) return;
    var vis = new Set();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          vis.add(e.target);
          if (!e.target.getAttribute("data-glint")) { e.target.setAttribute("data-glint", "1"); e.target.classList.add("cs-glint"); }
        } else vis.delete(e.target);
      });
    }, { threshold: 0.35 });
    els.forEach(function (el) { io.observe(el); });
    var raf = 0, px = -1e4, py = -1e4;
    function apply() {
      raf = 0;
      vis.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (!r.width) return;
        var x = (px - r.left) / r.width * 100;
        var dy = Math.max(0, Math.abs(py - (r.top + r.height / 2)) - r.height / 2);
        el.style.setProperty("--sx", Math.max(-40, Math.min(140, x)).toFixed(1) + "%");
        el.style.setProperty("--sa", Math.max(0, 1 - dy / 260).toFixed(2));
      });
    }
    function mv(e) { px = e.clientX; py = e.clientY; if (!raf) raf = requestAnimationFrame(apply); }
    // scrolling moves the headings under a still pointer — re-light them
    function onScroll() { if (!raf) raf = requestAnimationFrame(apply); }
    if (finePointer()) {
      window.addEventListener("pointermove", mv, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    return function () {
      io.disconnect();
      window.removeEventListener("pointermove", mv);
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [dep]);
}

// ── 2. CALIPER CURSOR ───────────────────────────────────────────
// The cursor is a measuring instrument: point at anything you can click
// and two caliper jaws close on its edges, with a dimension line reading
// its real size in CSS px. At rest it stays out of the way (the native
// ring cursor from SEOInjector does the pointing).
export function CaliperCursor() {
  var root = useRef(null);
  useEffect(function () {
    if (!finePointer()) return;
    var el = root.current; if (!el) return;
    var jl = el.querySelector(".cs-jaw-l"), jr = el.querySelector(".cs-jaw-r"), dim = el.querySelector(".cs-dim"), lbl = el.querySelector(".cs-dim-l");
    var target = null, raf = 0;
    var SEL = "a,button,[role='button'],input,textarea,select,label,summary";
    function place() {
      raf = 0;
      if (!target || !target.isConnected) { el.classList.remove("on"); target = null; return; }
      var r = target.getBoundingClientRect();
      if (r.width < 2 || r.bottom < 0 || r.top > innerHeight) { el.classList.remove("on"); return; }
      var g = 5, top = r.top - g, h = r.height + g * 2;
      jl.style.transform = "translate(" + (r.left - g - 6) + "px," + top + "px)";
      jr.style.transform = "translate(" + (r.right + g) + "px," + top + "px)";
      jl.style.height = jr.style.height = h + "px";
      var above = r.top > 34;
      dim.style.transform = "translate(" + (r.left - g) + "px," + (above ? top - 9 : r.bottom + g + 8) + "px)";
      dim.style.width = (r.width + g * 2) + "px";
      lbl.textContent = Math.round(r.width) + " × " + Math.round(r.height);
      lbl.style.top = above ? "-15px" : "5px";
      el.classList.add("on");
    }
    function over(e) {
      var t = e.target && e.target.closest ? e.target.closest(SEL) : null;
      if (t === target) return;
      target = t;
      if (!t) { el.classList.remove("on"); return; }
      if (!raf) raf = requestAnimationFrame(place);
    }
    function onScroll() { if (target && !raf) raf = requestAnimationFrame(place); }
    function leave() { target = null; el.classList.remove("on"); }
    document.addEventListener("pointerover", over, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    document.documentElement.addEventListener("pointerleave", leave);
    return function () {
      document.removeEventListener("pointerover", over);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.documentElement.removeEventListener("pointerleave", leave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={root} className="cs-caliper" aria-hidden="true">
    <span className="cs-jaw-l" /><span className="cs-jaw-r" />
    <span className="cs-dim"><span className="cs-dim-l" /></span>
  </div>;
}

// ── 3. SCROLL-SPY ───────────────────────────────────────────────
// Which section is under the reading line (≈ 45 % from the top).
export function useActiveSection(ids, dep) {
  var [active, setActive] = useState(null);
  useEffect(function () {
    if (!("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-45% 0px -54% 0px" });
    ids.forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
    return function () { io.disconnect(); };
  }, [dep]);
  return active;
}

// The nav's vernier slider: a cyan carriage that rides under the link of
// the section you are reading and glides (one ease) to the next one.
export function NavSlider(props) {
  var bar = useRef(null);
  useLayoutEffect(function () {
    var b = bar.current; if (!b) return;
    var host = b.parentElement;
    var a = props.active ? host.querySelector('[data-spy="' + props.active + '"]') : null;
    if (!a) { b.style.opacity = "0"; return; }
    b.style.opacity = "1";
    b.style.transform = "translateX(" + a.offsetLeft + "px)";
    b.style.width = a.offsetWidth + "px";
  }, [props.active, props.lang]);
  return <span ref={bar} className="cs-spy" aria-hidden="true"><i /><i /></span>;
}

// ── 4. MECHANICAL DRUM NUMBERS ──────────────────────────────────
// Digits roll on drums like an odometer / dial gauge when the figure first
// becomes visible. Non-digits stay put. Screen readers get the plain value.
export function DrumNumber(props) {
  var ref = useRef(null);
  var [go, setGo] = useState(false);
  useEffect(function () {
    var el = ref.current; if (!el) return;
    if (reducedMotion() || !("IntersectionObserver" in window)) { setGo(true); return; }
    var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { setGo(true); io.disconnect(); } }, { threshold: 0.6 });
    io.observe(el);
    return function () { io.disconnect(); };
  }, []);
  var s = String(props.value);
  var di = 0;
  return <span ref={ref} className="cs-drum" style={props.style} aria-label={s} role="text">
    {s.split("").map(function (ch, i) {
      if (!/[0-9]/.test(ch)) return <span key={i} aria-hidden="true">{ch}</span>;
      var d = +ch, k = di++;
      return <span key={i} className="cs-drum-c" aria-hidden="true">
        <span className="cs-drum-s" style={{ transform: "translateY(" + (go ? -d * 10 : 0) + "%)", transitionDelay: (k * 0.12) + "s" }}>
          {"0123456789".split("").map(function (n) { return <span key={n}>{n}</span>; })}
        </span>
      </span>;
    })}
  </span>;
}

// ── 5. TILT + SPECULAR (cards) ──────────────────────────────────
// Cards are glass plates on a bench: they tilt a few degrees toward the
// pointer and the same lamp slides across them. Event delegation — one
// listener per grid, not per card.
export function useTilt(ref, selector, maxDeg) {
  useEffect(function () {
    var host = ref.current;
    if (!host || !finePointer() || reducedMotion()) return;
    var cur = null, raf = 0, ev = null;
    function apply() {
      raf = 0; if (!cur || !ev) return;
      var r = cur.getBoundingClientRect();
      var nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
      cur.style.setProperty("--rx", ((0.5 - ny) * maxDeg).toFixed(2) + "deg");
      cur.style.setProperty("--ry", ((nx - 0.5) * maxDeg).toFixed(2) + "deg");
      cur.style.setProperty("--mx", (nx * 100).toFixed(1) + "%");
      cur.style.setProperty("--my", (ny * 100).toFixed(1) + "%");
    }
    function move(e) {
      var c = e.target.closest ? e.target.closest(selector) : null;
      if (c !== cur) { if (cur) reset(cur); cur = c; }
      ev = e; if (cur && !raf) raf = requestAnimationFrame(apply);
    }
    function reset(c) { c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg"); }
    function out() { if (cur) reset(cur); cur = null; }
    host.addEventListener("pointermove", move, { passive: true });
    host.addEventListener("pointerleave", out);
    return function () { host.removeEventListener("pointermove", move); host.removeEventListener("pointerleave", out); if (raf) cancelAnimationFrame(raf); };
  }, [ref, selector, maxDeg]);
}

// ── 6. MAGNETIC CTA ─────────────────────────────────────────────
// The button is pulled toward the pointer (max 7 px) inside a 90 px field,
// like a probe tip snapping to an edge. The label never moves on its own,
// so it stays readable (the old effect pushed the letters apart).
export function Magnetic(props) {
  var ref = useRef(null);
  useEffect(function () {
    var el = ref.current;
    if (!el || !finePointer() || reducedMotion()) return;
    var raf = 0, tx = 0, ty = 0;
    function apply() { raf = 0; el.style.transform = "translate(" + tx.toFixed(1) + "px," + ty.toFixed(1) + "px)"; }
    function move(e) {
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var reach = Math.max(r.width, r.height) / 2 + 90;
      var d = Math.hypot(dx, dy);
      var k = d < reach ? (1 - d / reach) : 0;
      tx = dx / (d || 1) * 7 * k * Math.min(1, d / 40); ty = dy / (d || 1) * 7 * k * Math.min(1, d / 40);
      if (!raf) raf = requestAnimationFrame(apply);
    }
    window.addEventListener("pointermove", move, { passive: true });
    return function () { window.removeEventListener("pointermove", move); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return <span ref={ref} className="cs-magnet" style={props.style}>{props.children}</span>;
}

// ── 7. PROBE CLOUD (About background) ───────────────────────────
// Reverse engineering, literally: a touch probe walks around a hidden part
// profile, one contact point at a time. Each touch leaves a point with its
// deviation (cyan inside ±0.02, warm outside); a spline is fitted through
// the touched points as they accumulate. When the profile closes, the part
// fades and a new one is measured. Replaces the generic particle network.
export function ProbeCloud() {
  var ref = useRef(null);
  useEffect(function () {
    var c = ref.current; if (!c) return;
    var host = c.parentElement;
    var ctx = c.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = 0, H = 0, N = 64, pts = [], part = 0, i = 0, t = 0, phase = 0, hold = 0, fade = 1;
    var still = reducedMotion();
    function seedPart() {
      part++;
      var a = 1.7 + (part % 3) * 0.6, b = part * 1.3;
      pts = [];
      for (var k = 0; k < N; k++) {
        var th = k / N * Math.PI * 2;
        var r = 1 + 0.16 * Math.sin(3 * th + b) + 0.07 * Math.cos(5 * th + a) + 0.04 * Math.sin(8 * th);
        var dev = Math.sin(k * 12.9898 + part * 78.233) * 43758.5453; dev = (dev - Math.floor(dev)) * 2 - 1; // −1..1, fixed per point
        dev = dev * dev * dev * 0.034;                                                                   // mostly small, a few outliers
        pts.push({ th: th, r: r, dev: dev });
      }
    }
    function size() {
      W = host.clientWidth; H = host.clientHeight;
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + "px"; c.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layout();
    }
    // the part sits in the free bench space under the left column's copy
    var CX = 0, CY = 0, R = 0;
    function layout() {
      var col = host.querySelector(":scope > div");
      var last = col && col.lastElementChild;
      if (!last || W < 768) { R = 0; return; }
      // the grid stretches the column to the row height — measure its last paragraph instead
      var top = col.offsetTop + last.offsetTop + last.offsetHeight + 40, avail = H - top - 56;
      R = Math.min(col.offsetWidth * 0.3, avail * 0.4);
      CX = col.offsetLeft + col.offsetWidth * 0.42; CY = top + avail / 2;
      if (R < 70) R = 0;
    }
    function xy(p, s) {
      var rr = R * (p.r + (s ? p.dev * 1.6 : 0));
      return [CX + Math.cos(p.th) * rr * 1.25, CY + Math.sin(p.th) * rr * 0.82];
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      if (!R) return;
      ctx.globalAlpha = fade;
      // nominal profile — faint dashed CAD reference
      ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(201,209,214,.10)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (var k = 0; k <= N; k++) { var q = xy(pts[k % N], false); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke(); ctx.setLineDash([]);
      // fitted spline through the touched points (Catmull-Rom → Bézier)
      var n = Math.min(i, N);
      if (n > 2) {
        ctx.strokeStyle = "rgba(" + CR + ",.32)"; ctx.lineWidth = 1.2; ctx.beginPath();
        var P = function (k) { return xy(pts[(k + N) % N], true); };
        var closed = n >= N;
        var start = closed ? 0 : 0, end = closed ? N : n - 1;
        var p0 = P(start); ctx.moveTo(p0[0], p0[1]);
        for (var k2 = start; k2 < end; k2++) {
          var a0 = P(closed ? k2 - 1 : Math.max(0, k2 - 1)), a1 = P(k2), a2 = P(k2 + 1), a3 = P(closed ? k2 + 2 : Math.min(n - 1, k2 + 2));
          ctx.bezierCurveTo(a1[0] + (a2[0] - a0[0]) / 6, a1[1] + (a2[1] - a0[1]) / 6, a2[0] - (a3[0] - a1[0]) / 6, a2[1] - (a3[1] - a1[1]) / 6, a2[0], a2[1]);
        }
        ctx.stroke();
      }
      // touched points
      for (var k3 = 0; k3 < n; k3++) {
        var p = pts[k3], q3 = xy(p, true), out = Math.abs(p.dev) > 0.02;
        ctx.fillStyle = out ? "rgba(255,106,61,.85)" : "rgba(" + CR + ",.7)";
        ctx.fillRect(q3[0] - 1.5, q3[1] - 1.5, 3, 3);
      }
      // the probe: stylus ball + approach vector + live readout
      if (!still && n < N) {
        var cur = pts[n % N], tgt = xy(cur, true);
        var prev = xy(pts[(n - 1 + N) % N], true);
        var e = phase < 1 ? phase * phase * (3 - 2 * phase) : 1;
        var bx = prev[0] + (tgt[0] - prev[0]) * e, by = prev[1] + (tgt[1] - prev[1]) * e;
        var nx = Math.cos(cur.th) * 22, ny = Math.sin(cur.th) * 16;
        var lift = (1 - e) * 1;
        ctx.strokeStyle = "rgba(" + CR + ",.55)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx + nx * (1 + lift), by + ny * (1 + lift)); ctx.lineTo(bx + nx * 2.6, by + ny * 2.6); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx + nx * lift * 0.4, by + ny * lift * 0.4, 3.2, 0, Math.PI * 2); ctx.stroke();
      }
      // readout of the last touched point
      if (n > 0 && n <= N) {
        var lp = pts[(n - 1) % N], lq = xy(lp, true), lo = Math.abs(lp.dev) > 0.02;
        var a = still ? 0 : Math.max(0, 1 - hold / 70);
        if (a > 0) {
          ctx.globalAlpha = fade * a;
          ctx.font = "10px " + MONO; ctx.fillStyle = lo ? WARN : C;
          var ox = Math.cos(lp.th) * 30, oy = Math.sin(lp.th) * 24;
          ctx.textAlign = ox < 0 ? "right" : "left";
          ctx.fillText((lp.dev >= 0 ? "+" : "−") + Math.abs(lp.dev).toFixed(3), lq[0] + ox, lq[1] + oy);
          ctx.globalAlpha = fade;
        }
      }
      ctx.globalAlpha = fade * 0.8;
      ctx.font = "8px " + MONO; ctx.fillStyle = INK2; ctx.textAlign = "left";
      ctx.fillText("PART " + String(part).padStart(3, "0") + " \u00b7 " + n + "/" + N + " PTS \u00b7 TOL \u00b10.020", CX - R * 1.25, CY + R * 0.82 + 30);
      ctx.globalAlpha = 1;
    }
    function step() {
      t++;
      if (i < N) {
        phase += 0.09; hold++;
        if (phase >= 1) { phase = 0; i++; hold = 0; }
      } else {
        hold++;
        if (hold > 110) fade = Math.max(0, fade - 0.02);
        if (fade <= 0) { seedPart(); i = 0; phase = 0; hold = 0; fade = 1; }
      }
      draw();
    }
    seedPart(); size();
    if (still) { i = N; draw(); }
    var ro = "ResizeObserver" in window ? new ResizeObserver(function () { size(); draw(); }) : null;
    if (ro) ro.observe(host);
    var raf = 0, visible = false, last = 0;
    function frame(now) { if (!visible || document.hidden) { raf = 0; return; } if (now - last > 33) { last = now; step(); } raf = requestAnimationFrame(frame); }
    var io = null;
    if (!still && "IntersectionObserver" in window) {
      io = new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, { rootMargin: "100px" });
      io.observe(host);
    }
    function onVis() { if (!document.hidden && visible && !raf) raf = requestAnimationFrame(frame); }
    document.addEventListener("visibilitychange", onVis);
    return function () { if (raf) cancelAnimationFrame(raf); if (io) io.disconnect(); if (ro) ro.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }} />;
}

// ── 8. GLOBAL STYLES for the instruments ────────────────────────
export var INSTRUMENT_CSS = [
  // layout: one 1180 px measuring column (same as the hero) and a clear
  // gutter for the scroll gauge on the right — content used to run under it
  "@media(min-width:769px){#main>section:not(#hero),#footer>div{padding-left:max(clamp(20px,4vw,56px),calc((100% - 1180px)/2))!important;padding-right:max(72px,calc((100% - 1180px)/2))!important}}",
  // chrome type + the lamp: specular band with a cyan fringe, position = --sx, strength = --sa
  ".cs-chrome{transition:--sx .45s " + EASE + ",--sa .6s " + EASE + "}",
  ".cs-glint{animation:csGlint 1.5s " + EASE + " .15s 1}",
  "@keyframes csGlint{0%{--sx:-40%;--sa:1}100%{--sx:140%;--sa:1}}",
  // section calibration: registration marks fly into the corners, then stay as faint sheet corners
  "#main section.cs-prep::before{content:'';position:absolute;inset:12px;opacity:0;pointer-events:none;z-index:6;" +
    "background:linear-gradient(" + C + "," + C + ") top left/16px 1px no-repeat,linear-gradient(" + C + "," + C + ") top left/1px 16px no-repeat," +
    "linear-gradient(" + C + "," + C + ") top right/16px 1px no-repeat,linear-gradient(" + C + "," + C + ") top right/1px 16px no-repeat," +
    "linear-gradient(" + C + "," + C + ") bottom left/16px 1px no-repeat,linear-gradient(" + C + "," + C + ") bottom left/1px 16px no-repeat," +
    "linear-gradient(" + C + "," + C + ") bottom right/16px 1px no-repeat,linear-gradient(" + C + "," + C + ") bottom right/1px 16px no-repeat}",
  "#main section.cs-seen::before{animation:csReg 1.1s " + EASE + " forwards}",
  // transform only — animating inset/top moved the box and counted as layout shift (CLS 1.6 measured)
  "@keyframes csReg{0%{transform:scale(.62);opacity:0}35%{opacity:.9}100%{transform:none;opacity:.22}}",
  "@media(prefers-reduced-motion:reduce){#main section.cs-prep::before{opacity:.22;animation:none}}",
  "@media(max-width:768px){#main section.cs-prep::before{display:none}}",
  // caliper cursor
  ".cs-caliper{position:fixed;inset:0;pointer-events:none;z-index:2147483000}",
  ".cs-caliper .cs-jaw-l,.cs-caliper .cs-jaw-r{position:fixed;left:0;top:0;width:6px;border:1px solid " + C + ";opacity:0;transition:transform .32s " + EASE + ",height .32s " + EASE + ",opacity .2s}",
  ".cs-caliper .cs-jaw-l{border-right:0}.cs-caliper .cs-jaw-r{border-left:0}",
  ".cs-caliper .cs-dim{position:fixed;left:0;top:0;height:1px;background:rgba(" + CR + ",.55);opacity:0;transition:transform .32s " + EASE + ",width .32s " + EASE + ",opacity .2s}",
  ".cs-caliper .cs-dim::before,.cs-caliper .cs-dim::after{content:'';position:absolute;top:-3px;width:1px;height:7px;background:" + C + "}.cs-caliper .cs-dim::before{left:0}.cs-caliper .cs-dim::after{right:0}",
  ".cs-caliper .cs-dim-l{position:absolute;left:50%;transform:translateX(-50%);font:8px/1 " + MONO + ";letter-spacing:.14em;color:" + C + ";background:rgba(10,12,14,.9);padding:2px 5px;white-space:nowrap}",
  ".cs-caliper.on .cs-jaw-l,.cs-caliper.on .cs-jaw-r{opacity:.9}.cs-caliper.on .cs-dim{opacity:1}",
  "@media(hover:none),(pointer:coarse){.cs-caliper{display:none}}",
  // nav: vernier carriage + bracket hover
  ".cs-nav-links{position:relative}",
  ".cs-spy{position:absolute;left:0;bottom:-9px;height:2px;background:" + C + ";box-shadow:0 0 10px rgba(" + CR + ",.6);transition:transform .5s " + EASE + ",width .5s " + EASE + ",opacity .3s;pointer-events:none}",
  ".cs-spy i{position:absolute;top:-3px;width:1px;height:8px;background:" + C + "}.cs-spy i:first-child{left:0}.cs-spy i:last-child{right:0}",
  ".cs-navl{position:relative;display:inline-block;padding:4px 0;font-size:9px;letter-spacing:.2em;transition:color .25s}",
  ".cs-navl::before,.cs-navl::after{content:'';position:absolute;top:2px;bottom:2px;width:4px;border:1px solid " + C + ";opacity:0;transition:transform .3s " + EASE + ",opacity .25s}",
  ".cs-navl::before{left:-9px;border-right:0;transform:translateX(-6px)}.cs-navl::after{right:-9px;border-left:0;transform:translateX(6px)}",
  "[data-spy]:hover .cs-navl,[data-spy]:focus-visible .cs-navl,[data-spy].on .cs-navl{color:" + C + "}",
  "[data-spy]:hover .cs-navl::before,[data-spy]:hover .cs-navl::after,[data-spy]:focus-visible .cs-navl::before,[data-spy]:focus-visible .cs-navl::after{opacity:1;transform:none}",
  // mobile menu: opens like caliper jaws from a measuring line, items arrive in sequence
  ".cs-mobile-menu.open{animation:csJaw .55s " + EASE + " both}",
  "@keyframes csJaw{0%{clip-path:inset(50% 0 50% 0)}100%{clip-path:inset(0 0 0 0)}}",
  ".cs-mobile-menu.open::before{content:'';position:absolute;left:0;right:0;top:50%;height:1px;background:" + C + ";box-shadow:0 0 12px " + C + ";animation:csJawLine .7s " + EASE + " both;pointer-events:none}",
  "@keyframes csJawLine{0%{transform:scaleX(0);opacity:1}45%{transform:scaleX(1);opacity:1}100%{transform:scaleX(1);opacity:0}}",
  ".cs-mobile-menu.open>*{animation:csItem .5s " + EASE + " both}",
  ".cs-mobile-menu.open>*:nth-child(2){animation-delay:.12s}.cs-mobile-menu.open>*:nth-child(3){animation-delay:.16s}.cs-mobile-menu.open>*:nth-child(4){animation-delay:.2s}.cs-mobile-menu.open>*:nth-child(5){animation-delay:.24s}.cs-mobile-menu.open>*:nth-child(6){animation-delay:.28s}.cs-mobile-menu.open>*:nth-child(7){animation-delay:.32s}.cs-mobile-menu.open>*:nth-child(8){animation-delay:.36s}.cs-mobile-menu.open>*:nth-child(9){animation-delay:.4s}.cs-mobile-menu.open>*:nth-child(10){animation-delay:.44s}",
  "@keyframes csItem{0%{opacity:0;transform:translateY(10px)}100%{opacity:1;transform:none}}",
  // drum digits
  ".cs-drum{display:inline-flex;align-items:baseline}",
  ".cs-drum-c{display:inline-block;height:1em;line-height:1em;overflow:hidden;vertical-align:baseline}",
  ".cs-drum-s{display:flex;flex-direction:column;transition:transform 1.3s cubic-bezier(.2,.9,.25,1.04)}",
  ".cs-drum-s>span{height:1em;line-height:1em;display:block}",
  // magnetic CTA
  ".cs-magnet{display:inline-block;transition:transform .35s " + EASE + "}",
  // services: the index number is a level gauge that fills when the row is pointed at; a dimension line measures the row
  ".cs-srv-row .cs-srv-n{color:transparent!important;-webkit-background-clip:text;background-clip:text;background-image:linear-gradient(0deg,rgba(" + CR + ",.9) 0 50%,rgba(" + CR + ",.08) 50% 100%);background-size:100% 200%;background-position:0 0;transition:background-position .7s " + EASE + "}",
  ".cs-srv-row:hover .cs-srv-n,.cs-srv-row:focus-visible .cs-srv-n{background-position:0 100%}",
  ".cs-srv-row::after{content:'';position:absolute;left:120px;right:0;bottom:-1px;height:1px;background:linear-gradient(90deg," + C + ",rgba(" + CR + ",.15));transform:scaleX(0);transform-origin:left;transition:transform .6s " + EASE + "}",
  ".cs-srv-row:hover::after,.cs-srv-row:focus-visible::after{transform:scaleX(1)}",
  ".cs-srv-row .cs-srv-t span{display:inline-block;transition:transform .35s " + EASE + "}.cs-srv-row:hover .cs-srv-t span{transform:translateX(6px)}",
  // pricing: our price measured against the market (track = market, fill = ours)
  ".cs-gauge{position:relative;height:4px;margin:8px 0 12px;background:repeating-linear-gradient(90deg,rgba(201,209,214,.22) 0 1px,transparent 1px 6px)}",
  ".cs-gauge b{position:absolute;left:0;top:0;bottom:0;width:100%;background:" + C + ";box-shadow:0 0 10px rgba(" + CR + ",.5);transition:width 1.4s " + EASE + " .25s}",
  "#pricing.cs-seen .cs-gauge b,.cs-gauge.now b{width:var(--w)}",
  ".cs-gauge i{position:absolute;right:0;top:-4px;width:1px;height:12px;background:" + INK2 + "}",
  // work cards: glass plate tilt + lamp + registration corners
  ".cs-work-grid{perspective:1100px}",
  ".cs-work-card{position:relative;transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transition:transform .5s " + EASE + ",border-color .25s!important;will-change:transform}",
  ".cs-work-card::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .3s;background:radial-gradient(420px circle at var(--mx,50%) var(--my,0%),rgba(255,255,255,.10),rgba(" + CR + ",.05) 30%,transparent 60%)}",
  ".cs-work-card:hover::after{opacity:1}",
  ".cs-work-card::before{content:'';position:absolute;inset:8px;pointer-events:none;z-index:2;opacity:0;transition:inset .4s " + EASE + ",opacity .3s;" +
    "background:linear-gradient(" + C + "," + C + ") top left/12px 1px no-repeat,linear-gradient(" + C + "," + C + ") top left/1px 12px no-repeat,linear-gradient(" + C + "," + C + ") top right/12px 1px no-repeat,linear-gradient(" + C + "," + C + ") top right/1px 12px no-repeat}",
  ".cs-work-card:hover::before,.cs-work-card:focus-visible::before{inset:6px;opacity:1}",
  ".cs-work-card img{transition:transform .8s " + EASE + ",filter .4s}.cs-work-card:hover img{transform:scale(1.025)}",
  // products: a probe traces the card outline while hovered
  ".cs-prod-card{position:relative;transition:background .3s}",
  ".cs-prod-card::before{content:'';position:absolute;inset:-1px;padding:1px;pointer-events:none;opacity:0;transition:opacity .3s;" +
    "background:conic-gradient(from var(--trace),transparent 0 72%,rgba(" + CR + ",.2) 82%," + C + " 90%,transparent 91%);" +
    "-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}",
  ".cs-prod-card:hover::before,.cs-prod-card:focus-visible::before{opacity:1;animation:csTrace 2.4s linear infinite}",
  ".cs-prod-card:hover{background:rgba(" + CR + ",.035)!important}",
  "@keyframes csTrace{to{--trace:360deg}}",
  // verified product card: the title link covers the card (one target), the store link sits above it
  ".cs-stretch::after{content:'';position:absolute;inset:0;z-index:1}",
  ".cs-prod-verified:hover{background:linear-gradient(160deg,rgba(" + CR + ",.13),rgba(" + CR + ",.03) 55%)!important}",
  // contact: caliper corners close on the focused field
  "#contact input,#contact textarea{background-image:linear-gradient(" + C + "," + C + "),linear-gradient(" + C + "," + C + "),linear-gradient(" + C + "," + C + "),linear-gradient(" + C + "," + C + ");" +
    "background-repeat:no-repeat;background-size:0 1px,1px 0,0 1px,1px 0;background-position:0 0,0 0,100% 100%,100% 100%;transition:background-size .35s " + EASE + ",border-color .25s,box-shadow .25s!important}",
  "#contact input:focus,#contact textarea:focus{outline:none!important;border-color:rgba(" + CR + ",.45)!important;box-shadow:0 0 0 3px rgba(" + CR + ",.08);background-size:14px 1px,1px 14px,14px 1px,1px 14px}",
  ".cs-stamp{display:inline-block;margin-top:14px;padding:8px 14px;border:2px solid #00ff88;color:#00ff88;font:700 11px/1.3 " + MONO + ";letter-spacing:.24em;transform:rotate(-4deg);animation:csStamp .5s cubic-bezier(.3,1.6,.5,1) both}",
  "@keyframes csStamp{0%{opacity:0;transform:rotate(-4deg) scale(1.6)}100%{opacity:1;transform:rotate(-4deg) scale(1)}}",
  // FAQ: index + a reading line
  ".cs-faq-i{position:relative;padding-left:56px!important}",
  ".cs-faq-i::before{content:'';position:absolute;left:0;top:20px;bottom:20px;width:1px;background:rgba(201,209,214,.12)}",
  ".cs-faq-i::after{content:'';position:absolute;left:0;top:20px;width:1px;height:0;background:" + C + ";box-shadow:0 0 8px " + C + ";transition:height .6s " + EASE + "}",
  ".cs-faq-i:hover::after{height:calc(100% - 40px)}",
  ".cs-faq-n{position:absolute;left:12px;top:22px;font:9px/1 " + MONO + ";letter-spacing:.18em;color:" + INK2 + "}",
  // footer title block (engineering drawing)
  ".cs-tblock{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));border:1px solid rgba(" + CR + ",.22);margin:0 0 18px}",
  ".cs-tblock>div{padding:8px 10px;border-right:1px solid rgba(" + CR + ",.14);min-width:0}.cs-tblock>div:last-child{border-right:0}",
  ".cs-tblock small{display:block;font:7px/1.4 " + MONO + ";letter-spacing:.22em;color:" + INK2 + ";text-transform:uppercase}",
  ".cs-tblock span{display:block;font:9px/1.5 " + MONO + ";letter-spacing:.12em;color:" + INK + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  "@media(max-width:860px){.cs-tblock{grid-template-columns:repeat(2,minmax(0,1fr))}.cs-tblock>div:nth-child(2n){border-right:0}.cs-tblock>div:nth-child(-n+4){border-bottom:1px solid rgba(" + CR + ",.14)}}",
  // WhatsApp: two calm sonar rings once, after the visitor has had time to read
  ".cs-wa::before,.cs-wa::after{content:'';position:absolute;inset:0;border-radius:50%;border:2px solid #25D366;opacity:0;pointer-events:none;animation:csPing 2s " + EASE + " 14s 2}",
  ".cs-wa::after{animation-delay:14.6s}",
  "@keyframes csPing{0%{transform:scale(1);opacity:.7}100%{transform:scale(1.9);opacity:0}}",
  // coverage readout: over the plot, under it on phones
  ".cs-cov-hud{position:absolute;top:12px;left:14px}",
  "@media(max-width:600px){.cs-cov-hud{position:static;padding:10px 12px 12px;border-top:1px solid rgba(" + CR + ",.12)}}",
  // hero: the mark tilts toward the pointer like an object on a turntable
  "@media(min-width:861px) and (hover:hover){.cs-hero-art{transform:perspective(1100px) rotateX(var(--hrx,0deg)) rotateY(var(--hry,0deg));transition:transform .9s " + EASE + "}}",
  ".cs-hero-coords .cs-live{display:inline-block;width:5px;height:5px;border-radius:50%;background:" + C + ";margin-right:6px;vertical-align:1px;animation:csLive 2.2s ease-in-out 2}",
  "@keyframes csLive{0%,100%{opacity:1}50%{opacity:.25}}",
  // nav status LED: steady; one "reading taken" pulse each time the section under the reading line changes
  // (it used to blink forever — WCAG 2.2.2 wants auto-blinking content to stop within 5 s)
  ".cs-led{animation:csLed .9s " + EASE + " 1}",
  "@keyframes csLed{0%{opacity:.2;box-shadow:0 0 0 0 rgba(" + CR + ",.7)}40%{opacity:1}100%{opacity:1;box-shadow:0 0 0 7px rgba(" + CR + ",0)}}",
  "@media(prefers-reduced-motion:reduce){.cs-work-card,.cs-hero-art{transform:none!important}.cs-wa::before,.cs-wa::after,.cs-prod-card::before{animation:none!important}}"
].join("");
