import React, { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// COVERAGE MAP — Bulgaria → Milano, as a measuring instrument,
// not a map service.
//
// This is deliberately NOT Google Maps: no tiles, no coastlines, no
// external geo data of any kind. It is a blueprint-style plot of two
// real points — Milano (45.4642°N, 9.1900°E) and Bobov Dol, Bulgaria
// (42.3482°N, 23.0017°E, same coordinates as the hero readout) —
// on a procedurally drawn hairline lat/lon grid, joined by a real
// great-circle path (spherical slerp between the two coordinates,
// computed in this file, not looked up). Distance (haversine) and
// initial bearing are computed from the same two coordinates at
// module load — see haversineKm()/initialBearingDeg() below — so the
// HUD numbers are derived, not hand-typed magic constants. A slow,
// continuous stream of ticks travels the arc (never a strobe: each
// tick's own loop is ~7s per traverse, phase-staggered, so motion
// reads as flow, not flicker — nowhere near WCAG 2.3.1's 3/sec).
//
// Model copied from HeroSignature.jsx / ReverseLabShowcase.jsx:
// - staticFrame gate = prefers-reduced-motion OR low-power/data-saver
//   -> exactly ONE paint, zero rAF, zero pointer listeners attached.
// - rAF paused via IntersectionObserver (out of viewport) AND
//   document.hidden (visibilitychange) — whichever fires first wins,
//   resumed when both conditions clear.
// - DPR ceiling 1.5 mobile / 2 desktop; ResizeObserver keeps the
//   canvas backing store in sync with the responsive CSS box.
// - Canvas is aria-hidden + tabIndex -1 + pointerEvents none (pure
//   decoration). All FACTUAL content (both hubs' real coordinates,
//   the computed distance and bearing) is real, accessible DOM text
//   in the HUD overlay — not locked inside the canvas pixels.
// - Full listener/rAF/observer cleanup on unmount.
//
// Integrity note: every number here (coordinates, distance, azimuth)
// is a real, independently computable geographic value for these two
// real Carbon Stealth hubs. Nothing here is a placeholder statistic
// or an invented client/city count.
// ═══════════════════════════════════════════════════════════════

var BASE = "#0A0C0E";
var INK = "#C9D1D6";
var INK2 = "#7C868D";
var C = "#00e5ff";
var CR = "0,229,255";
var MONO = "'Space Mono',ui-monospace,monospace";
var EASE = "cubic-bezier(.22,1,.36,1)";

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}
function isLowPower() {
  try {
    var c = navigator.connection;
    return !!(c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || "")));
  } catch (e) {
    return false;
  }
}

// ── the two real hubs ──
var MILANO = { lat: 45.4642, lon: 9.1900, label: "MILANO" };
var BOBOV_DOL = { lat: 42.3482, lon: 23.0017, label: "BOBOV DOL, BG" };

// ── spherical geometry (haversine + initial bearing + great-circle slerp) ──
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }
var EARTH_R_KM = 6371.0088; // IUGG mean radius

function haversineKm(a, b) {
  var phi1 = toRad(a.lat), phi2 = toRad(b.lat);
  var dphi = toRad(b.lat - a.lat), dlambda = toRad(b.lon - a.lon);
  var s = Math.sin(dphi / 2) * Math.sin(dphi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
  return EARTH_R_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
function initialBearingDeg(a, b) {
  var phi1 = toRad(a.lat), phi2 = toRad(b.lat), dlambda = toRad(b.lon - a.lon);
  var y = Math.sin(dlambda) * Math.cos(phi2);
  var x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dlambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function toVec3(p) {
  var phi = toRad(p.lat), lam = toRad(p.lon);
  return { x: Math.cos(phi) * Math.cos(lam), y: Math.cos(phi) * Math.sin(lam), z: Math.sin(phi) };
}
function slerpVec3(a, b, omega, t) {
  var s = Math.sin(omega);
  var wa = Math.sin((1 - t) * omega) / s, wb = Math.sin(t * omega) / s;
  return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb, z: a.z * wa + b.z * wb };
}
function vec3ToLatLon(v) {
  return { lat: toDeg(Math.asin(Math.max(-1, Math.min(1, v.z)))), lon: toDeg(Math.atan2(v.y, v.x)) };
}

var DISTANCE_KM = Math.round(haversineKm(MILANO, BOBOV_DOL));
// the link runs FROM the home base in Bobov Dol TO Milano (owner, 2026-10-08)
var AZIMUTH_DEG = initialBearingDeg(BOBOV_DOL, MILANO);

var ARC_N = 64;
var ARC_POINTS = (function buildArc() {
  var va = toVec3(BOBOV_DOL), vb = toVec3(MILANO);
  var dot = Math.max(-1, Math.min(1, va.x * vb.x + va.y * vb.y + va.z * vb.z));
  var omega = Math.acos(dot);
  var pts = [];
  for (var i = 0; i <= ARC_N; i++) {
    var t = i / ARC_N;
    pts.push(vec3ToLatLon(slerpVec3(va, vb, omega, t)));
  }
  return pts;
})();

// ── procedural equirectangular-style plot bounds (blueprint sheet, not a map service) ──
var LON_MIN = -5, LON_MAX = 29, LAT_MIN = 35, LAT_MAX = 53;
var PLOT_ASPECT = (LON_MAX - LON_MIN) / (LAT_MAX - LAT_MIN); // ~1.889

function project(lat, lon, w, h) {
  return {
    x: (lon - LON_MIN) / (LON_MAX - LON_MIN) * w,
    y: (LAT_MAX - lat) / (LAT_MAX - LAT_MIN) * h
  };
}

function fmtCoord(p) {
  return Math.abs(p.lat).toFixed(4) + "°" + (p.lat >= 0 ? "N" : "S") + " " +
    Math.abs(p.lon).toFixed(4) + "°" + (p.lon >= 0 ? "E" : "W");
}

export default function CoverageMap() {
  var host = useRef(null);
  var canvasRef = useRef(null);
  var wrapRef = useRef(null);
  var milanoLineRef = useRef(null);
  var bobovLineRef = useRef(null);
  var clockRef = useRef(null);

  // Local time at both hubs, from the browser's own time-zone database — a real, live reading.
  useEffect(function () {
    var el = clockRef.current; if (!el || typeof Intl === "undefined") return;
    function hm(tz) { try { return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()); } catch (e) { return "--:--"; } }
    function offset(tz) { try { var d = new Date(); var s = d.toLocaleString("en-US", { timeZone: tz }); return (new Date(s) - new Date(d.toLocaleString("en-US", { timeZone: "UTC" }))) / 36e5; } catch (e) { return 0; } }
    function tick() {
      var dh = offset("Europe/Rome") - offset("Europe/Sofia");
      el.textContent = "BOBOV DOL " + hm("Europe/Sofia") + " \u00b7 MILANO " + hm("Europe/Rome") + " \u00b7 \u0394 " + (dh >= 0 ? "+" : "\u2212") + Math.abs(dh) + " H";
    }
    tick();
    var iv = setInterval(tick, 30000);
    return function () { clearInterval(iv); };
  }, []);

  useEffect(function () {
    var el = host.current, canvas = canvasRef.current;
    if (!el || !canvas) return;

    var staticFrame = prefersReducedMotion() || isLowPower();
    var ctx = canvas.getContext("2d");
    if (!ctx) return; // no 2D canvas support — the gradient poster stays as the visible layer

    var mounted = true;
    var w = 1, h = 1, dpr = 1;

    function sizeToHost() {
      var cw = Math.max(1, el.clientWidth), ch = Math.max(1, el.clientHeight);
      var mobile = cw < 768;
      dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      w = cw; h = ch;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── hover state (imperative, no per-frame React re-render) ──
    var hoverHub = null; // "milano" | "bobov" | null
    var hubScreen = { milano: { x: 0, y: 0 }, bobov: { x: 0, y: 0 } };

    function setHoverStyles(hub) {
      if (milanoLineRef.current) {
        milanoLineRef.current.style.color = hub === "milano" ? C : INK2;
      }
      if (bobovLineRef.current) {
        bobovLineRef.current.style.color = hub === "bobov" ? C : INK2;
      }
    }

    function drawGrid(t0) {
      ctx.strokeStyle = "rgba(124,134,141,0.10)";
      ctx.lineWidth = 1;
      var lon;
      for (lon = Math.ceil(LON_MIN / 5) * 5; lon <= LON_MAX; lon += 5) {
        var x = project(0, lon, w, h).x;
        var coarse = lon % 15 === 0;
        ctx.globalAlpha = coarse ? 1 : 0.55;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      var lat;
      for (lat = Math.ceil(LAT_MIN / 5) * 5; lat <= LAT_MAX; lat += 5) {
        var y = project(lat, 0, w, h).y;
        var coarseL = lat % 15 === 0;
        ctx.globalAlpha = coarseL ? 1 : 0.55;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The link is drawn as a trajectory LIFTED off the sheet (height ∝ sin πt) over its own
    // dashed ground track, with drop lines at the ruler stations — an elevation profile, so the
    // flat plot reads in depth. The ground track is still the real great circle.
    function arcScreen() {
      var lift = Math.min(h * 0.22, 90), ground = [], air = [];
      for (var i = 0; i < ARC_POINTS.length; i++) {
        var p = ARC_POINTS[i], g = project(p.lat, p.lon, w, h), u = i / (ARC_POINTS.length - 1);
        ground.push(g); air.push({ x: g.x, y: g.y - Math.sin(Math.PI * u) * lift });
      }
      return { ground: ground, air: air };
    }
    function stroke(pts, style, width, dash) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) { if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y); }
      ctx.setLineDash(dash || []); ctx.strokeStyle = style; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]);
    }

    function drawArc(time) {
      var A = arcScreen(), i;
      stroke(A.ground, "rgba(124,134,141,0.35)", 1, [2, 4]);          // ground track (great circle)
      // drop lines + ruler stations every 1/8th
      var step = Math.floor(ARC_POINTS.length / 8);
      for (i = step; i < ARC_POINTS.length - 1; i += step) {
        ctx.beginPath(); ctx.moveTo(A.air[i].x, A.air[i].y); ctx.lineTo(A.ground[i].x, A.ground[i].y);
        ctx.setLineDash([1, 3]); ctx.strokeStyle = "rgba(" + CR + ",0.18)"; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = "rgba(124,134,141,0.55)"; ctx.fillRect(A.ground[i].x - 1, A.ground[i].y - 1, 2, 2);
      }
      // the lifted link: soft glow under a crisp hairline
      stroke(A.air, "rgba(" + CR + ",0.10)", 5);
      stroke(A.air, "rgba(" + CR + ",0.55)", 1.1);

      // distance label at the apex
      var mid = A.air[Math.floor(A.air.length / 2)];
      ctx.font = "9px " + MONO;
      ctx.fillStyle = "rgba(" + CR + ",0.75)";
      ctx.textAlign = "center";
      ctx.fillText("≈ " + DISTANCE_KM + " KM", mid.x, mid.y - 12);

      // traveling signal ticks — continuous flow, phase-staggered, never a strobe;
      // each carries a short fading tail, and casts a dim dot on the ground track
      var TICKS = 4, PERIOD = 7; // seconds per full traverse
      for (var k = 0; k < TICKS; k++) {
        var u = staticFrame ? ((k + 0.5) / TICKS) : (((time / PERIOD) + k / TICKS) % 1);
        if (!isFinite(u)) u = 0; // guard: a NaN time must never index the arc out of range
        var idx = u * (A.air.length - 1);
        var i0 = Math.max(0, Math.min(A.air.length - 2, Math.floor(idx))), fr = idx - i0;
        var sp = { x: A.air[i0].x + (A.air[i0 + 1].x - A.air[i0].x) * fr, y: A.air[i0].y + (A.air[i0 + 1].y - A.air[i0].y) * fr };
        var gp = { x: A.ground[i0].x + (A.ground[i0 + 1].x - A.ground[i0].x) * fr, y: A.ground[i0].y + (A.ground[i0 + 1].y - A.ground[i0].y) * fr };
        for (var tl = 1; tl <= 6; tl++) {
          var ti = Math.max(0, i0 - tl);
          ctx.fillStyle = "rgba(" + CR + "," + (0.5 - tl * 0.075) + ")";
          ctx.beginPath(); ctx.arc(A.air[ti].x, A.air[ti].y, 1.4, 0, Math.PI * 2); ctx.fill();
        }
        var grad = ctx.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, 8);
        grad.addColorStop(0, "rgba(" + CR + ",0.9)");
        grad.addColorStop(1, "rgba(" + CR + ",0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(" + CR + ",0.95)";
        ctx.beginPath(); ctx.arc(sp.x, sp.y, 1.8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(124,134,141,0.6)";
        ctx.beginPath(); ctx.arc(gp.x, gp.y, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawHub(p, time, key) {
      var scr = project(p.lat, p.lon, w, h);
      hubScreen[key] = scr;
      var hovered = hoverHub === key;
      var pulse = staticFrame ? 0.5 : (Math.sin(time * (2 * Math.PI / 4.2)) * 0.5 + 0.5);
      var ringR = 9 + pulse * 3 + (hovered ? 3 : 0);

      // outer breathing ring
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(" + CR + "," + (0.25 + pulse * 0.25 + (hovered ? 0.25 : 0)) + ")";
      ctx.lineWidth = 1;
      ctx.stroke();

      // crosshair, caliper-style
      ctx.strokeStyle = "rgba(" + CR + ",0.45)";
      ctx.beginPath();
      ctx.moveTo(scr.x - ringR - 5, scr.y); ctx.lineTo(scr.x - ringR + 2, scr.y);
      ctx.moveTo(scr.x + ringR - 2, scr.y); ctx.lineTo(scr.x + ringR + 5, scr.y);
      ctx.moveTo(scr.x, scr.y - ringR - 5); ctx.lineTo(scr.x, scr.y - ringR + 2);
      ctx.moveTo(scr.x, scr.y + ringR - 2); ctx.lineTo(scr.x, scr.y + ringR + 5);
      ctx.stroke();

      // solid core dot
      ctx.fillStyle = hovered ? C : INK;
      ctx.beginPath(); ctx.arc(scr.x, scr.y, 2.6, 0, Math.PI * 2); ctx.fill();

      // label
      ctx.font = (hovered ? "700 " : "") + "9px " + MONO;
      ctx.fillStyle = hovered ? C : INK2;
      ctx.textAlign = scr.x > w * 0.7 ? "right" : "left";
      var lx = scr.x > w * 0.7 ? scr.x - ringR - 8 : scr.x + ringR + 8;
      ctx.fillText(p.label, lx, scr.y + 3);
    }

    function draw(time) {
      ctx.clearRect(0, 0, w, h);
      drawGrid(time);
      drawArc(time);
      drawHub(MILANO, time, "milano");
      drawHub(BOBOV_DOL, time, "bobov");
    }

    // ── static branch: one paint, zero rAF, zero listeners ──
    if (staticFrame) {
      sizeToHost();
      draw(0);
      var roS = null;
      var onResizeS = function () { sizeToHost(); draw(0); };
      if ("ResizeObserver" in window) {
        roS = new ResizeObserver(onResizeS);
        roS.observe(el);
      } else {
        window.addEventListener("resize", onResizeS);
      }
      return function () { mounted = false; if (roS) roS.disconnect(); else window.removeEventListener("resize", onResizeS); };
    }

    // ── animated branch ──
    sizeToHost();
    var t0 = performance.now();
    var visible = true, raf = null;

    function loop(now) {
      if (!mounted) return;
      var time = (now - t0) / 1000;
      draw(time);
      raf = requestAnimationFrame(loop);
    }
    function startLoop() {
      if (!visible || document.hidden) return;
      if (!raf) raf = requestAnimationFrame(loop);
      if (!parallaxRaf) parallaxRaf = requestAnimationFrame(parallaxLoop);
    }
    function stopLoop() {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      if (parallaxRaf) { cancelAnimationFrame(parallaxRaf); parallaxRaf = null; }
    }

    // subtle pointer parallax on the whole plot layer + hub hover glow
    var tx = 0, ty = 0, curX = 0, curY = 0;
    function onPointerMove(e) {
      var r = el.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        tx = 0; ty = 0; hoverHub = null; setHoverStyles(null);
        return;
      }
      var nx = (e.clientX - r.left) / r.width - 0.5;
      var ny = (e.clientY - r.top) / r.height - 0.5;
      tx = -nx * 10; ty = -ny * 8;

      var lx = e.clientX - r.left, ly = e.clientY - r.top;
      var dm = Math.hypot(lx - hubScreen.milano.x, ly - hubScreen.milano.y);
      var db = Math.hypot(lx - hubScreen.bobov.x, ly - hubScreen.bobov.y);
      var next = null;
      if (dm < 26 && dm <= db) next = "milano"; else if (db < 26) next = "bobov";
      if (next !== hoverHub) { hoverHub = next; setHoverStyles(next); }
    }
    function onPointerLeave() { tx = 0; ty = 0; hoverHub = null; setHoverStyles(null); }

    var parallaxRaf = null;
    function parallaxLoop() {
      curX += (tx - curX) * 0.08; curY += (ty - curY) * 0.08;
      if (wrapRef.current) wrapRef.current.style.transform = "translate3d(" + curX.toFixed(2) + "px," + curY.toFixed(2) + "px,0)";
      parallaxRaf = requestAnimationFrame(parallaxLoop);
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    // start the paint + parallax loops last, once every var/fn above is defined;
    // startLoop drives BOTH raf and parallaxRaf so IO/visibility pause both.
    draw(0);
    startLoop();

    var ro = null;
    if ("ResizeObserver" in window) {
      ro = new ResizeObserver(function () { sizeToHost(); if (!raf) draw(0); });
      ro.observe(el);
    } else {
      window.addEventListener("resize", sizeToHost);
    }

    var io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          visible = entry.isIntersecting;
          if (!visible) stopLoop(); else startLoop();
        });
      }, { threshold: 0 });
      io.observe(el);
    }
    function onVisibility() { if (document.hidden) stopLoop(); else startLoop(); }
    document.addEventListener("visibilitychange", onVisibility);

    return function () {
      mounted = false;
      stopLoop();
      if (parallaxRaf) cancelAnimationFrame(parallaxRaf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", sizeToHost);
      document.removeEventListener("visibilitychange", onVisibility);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
    };
  }, []);

  return (
    <div style={{ position: "relative" }}>
    <div
      ref={host}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: String(PLOT_ASPECT),
        maxHeight: 460,
        minHeight: 240,
        overflow: "hidden",
        background: "radial-gradient(circle at 30% 35%, rgba(" + CR + ",.07), " + BASE + " 72%)"
      }}
    >
      {/* decorative plot — grid, great-circle arc, hub pulses, traveling signal ticks */}
      <div ref={wrapRef} aria-hidden="true" style={{ position: "absolute", inset: 0, willChange: "transform" }}>
        <canvas ref={canvasRef} tabIndex={-1} style={{ display: "block", width: "100%", height: "100%", pointerEvents: "none" }} />
      </div>

      <div aria-hidden="true" style={{ position: "absolute", bottom: 10, right: 14, zIndex: 2, fontFamily: MONO, fontSize: 7, letterSpacing: ".2em", color: INK2, opacity: 0.6 }}>
        GREAT-CIRCLE LINK {"·"} MEASURED, NOT MAPPED
      </div>
    </div>
      {/* real, accessible readout — the actual data, not locked in pixels.
          Over the plot on wide screens, under it on phones (it would cover the arc). */}
      <div className="cs-cov-hud" style={{ zIndex: 2, display: "flex", flexDirection: "column", gap: 5, fontFamily: MONO, fontSize: 9, letterSpacing: ".06em", lineHeight: 1.7 }}>
        <span ref={bobovLineRef} style={{ color: INK2, transition: "color .2s " + EASE }}>BOBOV DOL {"·"} {fmtCoord(BOBOV_DOL)}</span>
        <span ref={milanoLineRef} style={{ color: INK2, transition: "color .2s " + EASE }}>MILANO {"·"} {fmtCoord(MILANO)}</span>
        <span style={{ color: C }}>{"≈"} {DISTANCE_KM} KM {"·"} AZIMUTH {AZIMUTH_DEG.toFixed(1)}{"°"}</span>
        <span ref={clockRef} style={{ color: INK }} />
      </div>
    </div>
  );
}
