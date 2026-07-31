import React, { useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════
// HeroSignature — the one signature WebGL moment for the hero.
//
// A live "measured carbon" field: an engineering hairline grid over
// a woven-carbon crosshatch, a rare cyan fresnel edge, a slow radar
// sweep, and a caliper-style measurement ring — with tick gradations,
// like a real instrument — that tracks the pointer. The Tolerance
// metaphor (±0.02, live scan, measured surface) made literal in a
// single fragment shader instead of illustrated in copy.
//
// - Self-contained, CSP-safe: inline shaders only, three.js is the
//   already-bundled dependency (dynamic import, own manualChunk in
//   vite.config.js) — no CDN, no new dependency.
// - Mirrors the "Tolerance" tokens from App.jsx (C / CR / INK2 / BASE
//   / EASE). App.jsx does not export these consts, so the literal
//   values are intentionally duplicated here — keep both in sync if
//   the palette changes.
// - prefers-reduced-motion: reduce -> renders exactly ONE frame
//   (fixed time, fixed cursor, ring already resolved) and never
//   starts a render loop. Same shader, same composition, frozen —
//   not a degraded substitute.
// - Slow-network / data-saver -> same static-frame path (battery +
//   data conscious).
// - Mobile (<768px) -> stays on WebGL but halves the DPR ceiling and
//   drops the grain term (uQuality) — "lower DPR, less work", not a
//   different implementation to maintain.
// - rAF is paused via IntersectionObserver (out of viewport) and
//   document.hidden (tab backgrounded), and resumed on return.
// - Nothing in the shader exceeds ~1 cycle / 10s (sweep ~28s loop,
//   ring pulse ~12.5s loop) — nowhere near the 3-flashes/sec WCAG
//   2.3.1 threshold. The one per-pixel grain term is time-INDEPENDENT
//   (hashed from gl_FragCoord only) so it is a fixed dither texture,
//   not a flicker, by construction.
// ═══════════════════════════════════════════════════════════════

var C = "#00e5ff";
var CR = "0,229,255";
var INK2 = "#7C868D";
var BASE = "#0A0C0E";
var EASE = "cubic-bezier(.22,1,.36,1)";

function hexToRgb01(hex) {
  var h = hex.replace("#", "");
  var r = parseInt(h.substring(0, 2), 16) / 255;
  var g = parseInt(h.substring(2, 4), 16) / 255;
  var b = parseInt(h.substring(4, 6), 16) / 255;
  return [r, g, b];
}

var VERT = "\n\
varying vec2 vUv;\n\
void main(){\n\
  vUv = uv;\n\
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);\n\
}\n\
";

var FRAG = "\n\
precision highp float;\n\
varying vec2 vUv;\n\
uniform float uTime;\n\
uniform vec2 uResolution;\n\
uniform vec2 uMouse;\n\
uniform float uMouseActive;\n\
uniform vec3 uCyan;\n\
uniform vec3 uInk2;\n\
uniform vec3 uBase;\n\
uniform float uQuality;\n\
\n\
float hash(vec2 p){\n\
  p = fract(p * vec2(123.34, 456.21));\n\
  p += dot(p, p + 45.32);\n\
  return fract(p.x * p.y);\n\
}\n\
\n\
float lineAA(float v, float w){\n\
  return 1.0 - smoothstep(0.0, w, abs(v));\n\
}\n\
\n\
void main(){\n\
  float aspect = uResolution.x / max(uResolution.y, 1.0);\n\
  vec2 p = vUv - 0.5;\n\
  p.x *= aspect;\n\
  vec2 m = uMouse - 0.5;\n\
  m.x *= aspect;\n\
\n\
  vec3 col = uBase;\n\
\n\
  // measured surface catching light toward centre\n\
  float rd = length(p);\n\
  col += smoothstep(1.1, 0.05, rd) * 0.055;\n\
\n\
  // engineering hairline grid — fine + coarse, blueprint-consistent\n\
  float gridFine = 0.062;\n\
  float gridCoarse = gridFine * 6.0;\n\
  vec2 gf = abs(fract(p / gridFine) - 0.5) * gridFine;\n\
  float lineF = 1.0 - smoothstep(0.0, 0.0018, min(gf.x, gf.y));\n\
  vec2 gc = abs(fract(p / gridCoarse) - 0.5) * gridCoarse;\n\
  float lineC = 1.0 - smoothstep(0.0, 0.0026, min(gc.x, gc.y));\n\
  col += uInk2 * (lineF * 0.035 + lineC * 0.075);\n\
\n\
  // woven carbon crosshatch, low-contrast, slow drift\n\
  float drift = uTime * 0.015;\n\
  float weave = sin((p.x + p.y) * 90.0 + drift) * sin((p.x - p.y) * 90.0 - drift * 0.7);\n\
  col += uInk2 * weave * 0.012;\n\
\n\
  // fresnel-like edge glow — the rare cyan accent\n\
  float edge = smoothstep(0.55, 1.05, rd);\n\
  col += uCyan * edge * 0.05;\n\
\n\
  // slow radar sweep, one thin line, ~28s loop\n\
  float sweepX = fract(uTime * 0.035) * (aspect + 0.6) - (aspect * 0.5 + 0.3);\n\
  float sweep = lineAA(p.x - sweepX, 0.006);\n\
  float sweepFall = smoothstep(1.0, 0.0, abs(p.x - sweepX) * 3.0);\n\
  col += uCyan * sweep * 0.55;\n\
  col += uCyan * sweepFall * 0.018;\n\
\n\
  // caliper measurement ring — tracks the pointer, tick gradations, crosshair\n\
  float md = length(p - m);\n\
  float ringR = 0.22 + sin(uTime * 0.5) * 0.008;\n\
  float ring = lineAA(md - ringR, 0.0028) * uMouseActive;\n\
  col += uCyan * ring * 0.9;\n\
\n\
  float ang = atan(p.y - m.y, p.x - m.x);\n\
  float ticks = smoothstep(0.94, 1.0, cos(ang * 12.0));\n\
  float tickRing = lineAA(md - ringR, 0.015) * ticks * uMouseActive;\n\
  col += uCyan * tickRing * 0.5;\n\
\n\
  float chx = lineAA(p.y - m.y, 0.0012) * smoothstep(ringR * 1.6, 0.0, abs(p.x - m.x)) * uMouseActive;\n\
  float chy = lineAA(p.x - m.x, 0.0012) * smoothstep(ringR * 1.6, 0.0, abs(p.y - m.y)) * uMouseActive;\n\
  col += uCyan * (chx + chy) * 0.32;\n\
\n\
  // fixed dither — time-independent by construction, never a flicker\n\
  float g = (hash(gl_FragCoord.xy) - 0.5) * 0.016 * uQuality;\n\
  col += g;\n\
\n\
  gl_FragColor = vec4(col, 1.0);\n\
}\n\
";

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

export default function HeroSignature() {
  var host = useRef(null);

  useEffect(function () {
    var el = host.current;
    if (!el) return;

    var staticFrame = prefersReducedMotion() || isLowPower(); // one frame, no loop
    var mounted = true;
    var cleanup = null;

    // Defer the three.js chunk (~164 KB gzip) until the browser is idle, i.e.
    // AFTER first paint / LCP. The CSS poster below carries the hero until then,
    // so the signature effect still arrives — just without blocking the paint.
    var idleId = null, idleTimer = null;
    function whenIdle(fn) {
      if (typeof requestIdleCallback === "function") idleId = requestIdleCallback(fn, { timeout: 2500 });
      else idleTimer = setTimeout(fn, 1200);
    }

    whenIdle(function () {
    if (!mounted) return;
    import("three").then(function (THREE) {
      if (!mounted || !el) return;

      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
      } catch (e) {
        return; // no WebGL — the CSS gradient poster underneath stays as the visible layer
      }

      var canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      canvas.tabIndex = -1;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.pointerEvents = "none";
      canvas.style.opacity = "0";
      canvas.style.transition = "opacity .7s " + EASE;
      el.appendChild(canvas);

      var scene = new THREE.Scene();
      var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      var geo = new THREE.PlaneGeometry(2, 2);

      var cyan = hexToRgb01(C), ink2 = hexToRgb01(INK2), base = hexToRgb01(BASE);
      var uniforms = {
        uTime: { value: staticFrame ? 1.6 : 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(0.64, 0.4) },
        uMouseActive: { value: staticFrame ? 1.0 : 0.0 },
        uCyan: { value: new THREE.Vector3(cyan[0], cyan[1], cyan[2]) },
        uInk2: { value: new THREE.Vector3(ink2[0], ink2[1], ink2[2]) },
        uBase: { value: new THREE.Vector3(base[0], base[1], base[2]) },
        uQuality: { value: 1.0 }
      };

      var material = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: uniforms,
        depthTest: false,
        depthWrite: false
      });
      var mesh = new THREE.Mesh(geo, material);
      scene.add(mesh);

      var mx = uniforms.uMouse.value.x, my = uniforms.uMouse.value.y;
      var tmx = mx, tmy = my, active = staticFrame ? 1 : 0, tactive = active;
      var visible = true, raf = null, t0 = performance.now();

      function renderFrame() {
        renderer.render(scene, camera);
      }

      function sizeToHost() {
        var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
        var mobile = w < 768;
        var maxDpr = mobile ? 1.5 : 2;
        var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false); // false: keep our own responsive CSS size
        uniforms.uResolution.value.set(w, h);
        uniforms.uQuality.value = mobile ? 0.0 : 1.0; // skip grain term on mobile — less GPU work
      }
      sizeToHost();
      renderFrame();
      var fadeRaf = requestAnimationFrame(function () { canvas.style.opacity = "1"; });

      function onMove(e) {
        var r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
          tactive = 0;
          return;
        }
        tmx = (e.clientX - r.left) / r.width;
        tmy = 1.0 - (e.clientY - r.top) / r.height;
        tactive = 1;
      }
      function onLeave() { tactive = 0; }

      function loop(now) {
        if (!mounted) return;
        var t = (now - t0) / 1000;
        uniforms.uTime.value = t;
        mx += (tmx - mx) * 0.08; my += (tmy - my) * 0.08;
        active += (tactive - active) * 0.08;
        uniforms.uMouse.value.set(mx, my);
        uniforms.uMouseActive.value = active;
        renderFrame();
        raf = requestAnimationFrame(loop);
      }

      function startLoop() {
        if (staticFrame || raf || !visible || document.hidden) return;
        t0 = performance.now() - uniforms.uTime.value * 1000; // resume without a time jump
        raf = requestAnimationFrame(loop);
      }
      function stopLoop() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
      }

      if (!staticFrame) {
        window.addEventListener("pointermove", onMove, { passive: true });
        window.addEventListener("pointerleave", onLeave, { passive: true });
        startLoop();
      }

      var ro = null;
      if ("ResizeObserver" in window) {
        ro = new ResizeObserver(function () { sizeToHost(); if (!raf) renderFrame(); });
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

      function onVisibility() {
        if (document.hidden) stopLoop(); else startLoop();
      }
      document.addEventListener("visibilitychange", onVisibility);

      // On context loss, hide the canvas so the CSS poster shows through (canvas is
      // opaque). On restore, re-init size + repaint and resume, instead of a dead
      // black hero until reload.
      function onContextLost(e) { e.preventDefault(); stopLoop(); canvas.style.opacity = "0"; }
      function onContextRestored() { sizeToHost(); renderFrame(); canvas.style.opacity = "1"; startLoop(); }
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);

      cleanup = function () {
        stopLoop();
        if (fadeRaf) cancelAnimationFrame(fadeRaf);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerleave", onLeave);
        window.removeEventListener("resize", sizeToHost);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        geo.dispose();
        material.dispose();
        // Force the GL context to be released now instead of waiting for GC —
        // avoids "too many active WebGL contexts" across repeated mounts (HMR).
        try { renderer.forceContextLoss(); } catch (e) {}
        renderer.dispose();
        if (el && el.contains(canvas)) el.removeChild(canvas);
      };
    });
    });

    return function () {
      mounted = false;
      if (idleId && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
      if (idleTimer) clearTimeout(idleTimer);
      if (cleanup) cleanup();
    };
  }, []);

  // aria-hidden host, absolutely positioned behind hero copy (zIndex 1 —
  // same slot the previous MeasuredSurface occupied). The radial-gradient
  // is the instant-paint poster: visible before three.js resolves and
  // remains as the fallback if WebGL is unavailable.
  return (
    <div
      ref={host}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
        background: "radial-gradient(circle at 62% 38%, rgba(" + CR + ",.06), " + BASE + " 70%)"
      }}
    />
  );
}
