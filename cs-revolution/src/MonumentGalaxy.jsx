import React, { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// THE MONUMENT — a barred spiral galaxy; every visitor is a new star.
//
// Data model unchanged (api/monument.php): every visit hashes its own
// behaviour (cursor, scroll, time, screen, zone) into an anonymous 12-hex
// seed; the server keeps it forever (one per IP / 12h). No personal data.
//
// What it MEANS (fourth version, 2026-10-08):
//  * one visitor = one star, drawn like a JWST photograph (six diffraction
//    spikes + the two faint horizontal ones);
//  * the seed sets the star's arm, offset and SPECTRAL CLASS (O B A F G K M,
//    blue → red, in a realistic mix);
//  * real galaxies grow inside-out, and so does this one: visitors take
//    places in arrival order from the core outward along the arms — the
//    first stars sit by the nucleus, newcomers are born on the outer arms;
//  * your star is cyan, ringed and labelled; point at any star to read its
//    number and class.
//
// Rendering: the smooth light (bulge, bar, arms, disk) and the dust lanes on
// the inner edge of the arms are painted into a texture lying in the disk
// plane; ~75k procedural points add the resolved stars on top (old warm
// bulge, young blue arm stars dimmed inside the dust, pink HII knots, halo),
// plus a fixed background sky; visitor stars in a second shader with spikes. Sub-pixel stars keep their energy instead of
// shimmering. Boots near the viewport, pauses off-screen, single static
// frame for reduced motion, full dispose. Nothing flashes: the visitor stars
// breathe ±12 % over 5–9 s.
// ═══════════════════════════════════════════════════════════════

var C = "#00e5ff";
var BASE = "#05070a";
var MONO = "'Space Mono',ui-monospace,monospace";
var SLOTS = 1200;                 // API returns the last 1200 seeds
var R = 100;                      // galaxy radius
var R0 = 0.2 * R;                 // arms start at the ends of the bar
var PITCH = Math.tan(14 * Math.PI / 180);
var BAR_ANGLE = 0.35;
var CLASSES = [["O", 0.04, [0.62, 0.71, 1.0]], ["B", 0.1, [0.67, 0.75, 1.0]], ["A", 0.14, [0.79, 0.84, 1.0]], ["F", 0.18, [0.97, 0.97, 1.0]],
               ["G", 0.22, [1.0, 0.96, 0.9]], ["K", 0.2, [1.0, 0.82, 0.62]], ["M", 0.12, [1.0, 0.7, 0.45]]];

function prefersReducedMotion() { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function armTheta(r, arm, arms) { return BAR_ANGLE + arm * (2 * Math.PI / arms) + Math.log(Math.max(r, R0) / R0) / PITCH; }
function smooth(a, b, x) { var t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
function hash2(x, y) { var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967295; }
function vnoise2(x, y) {
  var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  var a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
// signed distance (along the circle of radius r) from a point to arm `arm`; > 0 = the concave, inner edge
function armD(r, th, arm, arms) { var d = th - armTheta(r, arm, arms); d = ((d % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI; return d * r; }
// dust lanes ride the inner edge of the two major arms (as in real trailing spirals) and the bar's leading edges
function dustAt(x, z) {
  var r = Math.hypot(x, z), th = Math.atan2(z, x), dust = 0;
  for (var a = 0; a < 2; a++) {
    var dd = armD(r, th, a, 4) - (0.03 * R + 0.02 * r), dw = 0.01 * R + 0.012 * r;
    dust = Math.max(dust, Math.exp(-(dd * dd) / (2 * dw * dw)) * smooth(R0 * 0.7, R0 * 1.3, r));
  }
  var cb = Math.cos(BAR_ANGLE), sb = Math.sin(BAR_ANGLE), bx = x * cb + z * sb, bz = -x * sb + z * cb;
  var lane = Math.exp(-Math.pow((Math.abs(bz) - 0.028 * R) / (0.006 * R), 2)) * Math.exp(-(bx * bx) / (2 * Math.pow(0.1 * R, 2)));
  return Math.max(dust, lane * 0.45) * (0.75 + 0.25 * vnoise2(x * 0.25, z * 0.25));
}

// The smooth light of the disk — unresolved starlight, the bar, the arms and their dust — painted into a
// texture that lies in the galaxy plane. Points then add the resolved stars on top. This is how the
// glow of a real galaxy photograph reads; dust drawn as particles looked like black bubbles.
async function paintDisk(N) {
  var cv = document.createElement("canvas"); cv.width = cv.height = N;
  var cx = cv.getContext("2d"), im = cx.createImageData(N, N), ext = 1.12 * R;
  var cb = Math.cos(BAR_ANGLE), sb = Math.sin(BAR_ANGLE);
  for (var py = 0; py < N; py++) {
    for (var px = 0; px < N; px++) {
      var x = (px / (N - 1) * 2 - 1) * ext, z = (py / (N - 1) * 2 - 1) * ext, r = Math.hypot(x, z), th = Math.atan2(z, x);
      var bx = x * cb + z * sb, bz = -x * sb + z * cb;
      var bulge = Math.exp(-(r * r) / (2 * Math.pow(0.065 * R, 2)));
      var bar = Math.exp(-(bx * bx) / (2 * Math.pow(0.12 * R, 2)) - (bz * bz) / (2 * Math.pow(0.034 * R, 2)));
      var arms = 0;
      for (var a = 0; a < 4; a++) {
        var d = armD(r, th, a, 4), aw = 0.03 * R + 0.055 * r;
        arms += (a < 2 ? 1 : 0.42) * Math.exp(-(d * d) / (2 * aw * aw)) * smooth(R0 * 0.7, R0 * 1.4, r);
      }
      var n = 0.3 + 0.7 * vnoise2(x * 0.08, z * 0.08) * (0.55 + 0.45 * vnoise2(x * 0.3, z * 0.3));
      var fall = Math.exp(-Math.pow(r / (0.92 * R), 6));   // ~0 at the texture's edge (no visible square border)
      var disk = Math.exp(-r / (0.24 * R)) * fall;
      var dust = dustAt(x, z) * 0.8;
      var lc = bulge * 0.8 + bar * 0.5, la = arms * 0.36 * n * fall, ld = disk * 0.3;
      var cr = (lc * 1.0 + la * 0.84 + ld * 0.95) * (1 - dust), cg = (lc * 0.92 + la * 0.88 + ld * 0.92) * (1 - dust), cbl = (lc * 0.8 + la * 1.0 + ld * 0.9) * (1 - dust * 0.9);
      var o = (py * N + px) * 4;
      im.data[o] = 255 * (1 - Math.exp(-cr * 1.6)); im.data[o + 1] = 255 * (1 - Math.exp(-cg * 1.6)); im.data[o + 2] = 255 * (1 - Math.exp(-cbl * 1.6)); im.data[o + 3] = 255;
    }
    if (py % 48 === 47) await tick();
  }
  cx.putImageData(im, 0, 0);
  return cv;
}

function classOf(h) { var acc = 0; for (var i = 0; i < CLASSES.length; i++) { acc += CLASSES[i][1]; if (h < acc) return CLASSES[i]; } return CLASSES[CLASSES.length - 1]; }

// seed → star. Place i is fixed forever: radius grows with arrival (inside-out), arm and offset from the seed.
function starFor(seed, i) {
  var h1 = parseInt(seed.substring(0, 4), 16) / 0xffff, h2 = parseInt(seed.substring(4, 8), 16) / 0xffff, h3 = parseInt(seed.substring(8, 12), 16) / 0xffff;
  var u = (i + 0.5) / SLOTS;
  // the envelope grows inside-out; inside it a star sits on an arm (65 %) or in the disk between them
  var r = R * (0.12 + 0.8 * Math.sqrt(u)) + ((((h3 * 6151) % 1) - 0.5) * 0.18 * R);
  r = Math.max(0.1 * R, Math.min(1.02 * R, r));
  var arm = h1 < 0.8 ? (h1 < 0.4 ? 0 : 1) : (h1 < 0.9 ? 2 : 3);        // mostly the two major arms
  var off = (((h2 * 104729) % 1) + ((h1 * 7727) % 1) - 1);               // −1…1, peaked at 0 (two uniforms)
  var th = ((h2 * 3571) % 1) < 0.65 ? armTheta(r, arm, 4) + off * (0.1 * R + 0.12 * r) / r : ((h1 * 9973) % 1) * Math.PI * 2;
  var cls = classOf(h3);
  var y = (((h2 * 7919) % 1) - 0.5) * 0.025 * R;
  return { x: Math.cos(th) * r, y: y, z: Math.sin(th) * r, cls: cls[0], col: cls[2], bright: 0.75 + 0.5 * ((h1 * 31) % 1), phase: h2 * 6.283, per: 5 + h3 * 4 };
}

// ── the galaxy as point attributes (deterministic) ──
async function buildGalaxy(scale) {
  var rnd = mulberry(20261008);
  function g() { var u = 1 - rnd(), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  var P = [], Cc = [], S = [], B = [];
  function add(x, y, z, c, s, b) { P.push(x, y, z); Cc.push(c[0], c[1], c[2]); S.push(s); B.push(b * (1 - 0.85 * dustAt(x, z))); }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // restrained palette (owner, 2026-10-08: "too much"): ink and chrome like the rest of the site, a breath of warmth
  // in the core and of blue in the arms; cyan is reserved for YOUR star
  var WARM = [0.94, 0.9, 0.84], GOLD = [0.96, 0.9, 0.8], WHITE = [0.88, 0.91, 0.94], BLUE = [0.76, 0.83, 0.95], ICE = [0.84, 0.89, 0.96];
  var N = function (n) { return Math.round(n * scale); };
  var cb = Math.cos(BAR_ANGLE), sb = Math.sin(BAR_ANGLE), i, x, y, z, r, th;
  // bulge: old, warm, dense
  for (i = 0; i < N(6000); i++) {
    var rr = Math.abs(g()) * 0.075 * R + Math.abs(g()) * 0.02 * R, a = rnd() * Math.PI * 2, el = (rnd() - 0.5) * Math.PI;
    x = rr * Math.cos(el) * Math.cos(a); z = rr * Math.cos(el) * Math.sin(a); y = rr * Math.sin(el) * 0.62;
    add(x, y, z, mix(GOLD, WARM, rnd()), 0.26 + rnd() * 0.22, 0.32 + rnd() * 0.36);
  }
  // bar
  for (i = 0; i < N(4000); i++) {
    var bx = g() * 0.11 * R, bz = g() * 0.035 * R; y = g() * 0.022 * R;
    add(bx * cb - bz * sb, y, bx * sb + bz * cb, mix(WARM, WHITE, rnd() * 0.6), 0.26 + rnd() * 0.2, 0.4 + rnd() * 0.35);
  }
  await tick();
  // arms: young blue stars on the ridge, older white ones spread around it
  var ARMS = 4;
  for (i = 0; i < N(26000); i++) {
    var arm = i % 10 < 4 ? 0 : i % 10 < 8 ? 1 : i % 10 < 9 ? 2 : 3, major = arm < 2;
    r = R0 + Math.min(R * 0.85, -Math.log(1 - rnd() * 0.97) * 0.3 * R);
    var young = rnd() < (major ? 0.55 : 0.4);
    var wd = (young ? 0.025 : 0.06) * R + 0.06 * r;
    th = armTheta(r, arm, ARMS) + g() * wd / r;
    y = g() * (0.008 * R + 0.012 * r);
    var col = young ? mix(BLUE, ICE, rnd()) : mix(WHITE, WARM, rnd() * 0.5);
    add(Math.cos(th) * r, y, Math.sin(th) * r, col, (young ? 0.28 : 0.22) + rnd() * 0.24, (major ? 1 : 0.65) * (young ? 0.55 : 0.36) * (0.6 + rnd() * 0.7));
    if (i % 13000 === 12999) await tick();
  }
  // old disk between the arms
  for (i = 0; i < N(10000); i++) {
    r = Math.min(R * 1.05, -Math.log(1 - rnd() * 0.98) * 0.32 * R + 0.04 * R); th = rnd() * Math.PI * 2; y = g() * (0.01 * R + 0.01 * r);
    add(Math.cos(th) * r, y, Math.sin(th) * r, mix(WARM, WHITE, rnd()), 0.22 + rnd() * 0.18, 0.28 + rnd() * 0.3);
  }
  // stellar halo
  for (i = 0; i < N(600); i++) {
    r = Math.abs(g()) * 0.55 * R; th = rnd() * Math.PI * 2; var ph = Math.acos(2 * rnd() - 1);
    add(r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * 0.7, r * Math.sin(ph) * Math.sin(th), WARM, 0.25, 0.35);
  }
  // fixed background sky (does not rotate with the galaxy)
  var SK = [], SKC = [], SKS = [], SKB = [];
  for (i = 0; i < N(1400); i++) {
    var sa = rnd() * Math.PI * 2, sz = 2 * rnd() - 1, sr = Math.sqrt(1 - sz * sz), d = 1400;
    SK.push(Math.cos(sa) * sr * d, sz * d, Math.sin(sa) * sr * d);
    var c2 = mix(WHITE, classOf(rnd())[2], 0.35); SKC.push(c2[0], c2[1], c2[2]); SKS.push(2 + rnd() * 3.5); SKB.push(0.18 + Math.pow(rnd(), 5) * 0.7);
  }
  return { P: P, C: Cc, S: S, B: B, SK: SK, SKC: SKC, SKS: SKS, SKB: SKB };
}

var STAR_VS = [
  "attribute vec3 aColor; attribute float aSize; attribute float aBright;",
  "uniform float uScale; uniform float uMinPx; uniform float uGain;",
  "varying vec3 vColor; varying float vBright;",
  "void main(){",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  gl_Position = projectionMatrix * mv;",
  "  float s = aSize * uScale / -mv.z;",
  // sub-pixel stars keep their light (no shimmer): enlarge to the minimum and dim by the area ratio
  "  vBright = aBright * uGain * min(1.0, (s * s) / (uMinPx * uMinPx));",
  "  gl_PointSize = max(s, uMinPx);",
  "  vColor = aColor;",
  "}"].join("\n");
var STAR_FS = [
  "varying vec3 vColor; varying float vBright;",
  "void main(){",
  "  vec2 d = gl_PointCoord * 2.0 - 1.0; float r2 = dot(d, d);",
  "  if (r2 > 1.0) discard;",
  "  float l = exp(-r2 * 9.0) + 0.18 * exp(-r2 * 2.5);",
  "  gl_FragColor = vec4(vColor * vBright * l, 1.0);",
  "}"].join("\n");
// visitors: a JWST-style star — tight core, soft halo, six spikes + two faint horizontal ones
var VIS_VS = [
  "attribute vec3 aColor; attribute float aSize; attribute float aBright; attribute float aPhase; attribute float aPer; attribute float aMine;",
  "uniform float uScale; uniform float uTime; uniform float uMineGrow;",
  "varying vec3 vColor; varying float vBright; varying float vMine;",
  "void main(){",
  "  vec4 mv = modelViewMatrix * vec4(position, 1.0);",
  "  gl_Position = projectionMatrix * mv;",
  "  float breathe = 0.88 + 0.12 * sin(uTime * 6.2831 / aPer + aPhase);",
  "  float grow = aMine > 0.5 ? uMineGrow : 1.0;",
  "  gl_PointSize = clamp(aSize * uScale / -mv.z, 9.0, 90.0) * (aMine > 0.5 ? 1.7 : 1.0) * max(0.05, grow);",
  "  vColor = aMine > 0.5 ? vec3(0.0, 0.9, 1.0) : aColor;",
  "  vBright = aBright * breathe * grow; vMine = aMine;",
  "}"].join("\n");
var VIS_FS = [
  "varying vec3 vColor; varying float vBright; varying float vMine;",
  "void main(){",
  "  vec2 d = gl_PointCoord * 2.0 - 1.0; float r = length(d);",
  "  if (r > 1.0) discard;",
  "  float core = exp(-r * r * 70.0) * 1.8 + exp(-r * r * 12.0) * 0.32;",
  "  float sp = 0.0;",
  "  for (int k = 0; k < 3; k++) {",
  "    float a = float(k) * 1.0471976 + 1.5707963; vec2 dir = vec2(cos(a), sin(a));",
  "    float along = abs(dot(d, dir)); float across = abs(d.x * dir.y - d.y * dir.x);",
  "    sp += exp(-across * 95.0) * pow(1.0 - along, 3.0);",
  "  }",
  "  float hs = exp(-abs(d.y) * 110.0) * pow(1.0 - abs(d.x), 3.0) * 0.4;",
  "  vec3 c = vColor * vBright * (core + (sp * 0.55 + hs * 0.6) * (1.0 - r));",
  "  c += vec3(1.0) * exp(-r * r * 160.0) * vBright * 0.6;",          // white-hot centre
  "  gl_FragColor = vec4(c, 1.0);",
  "}"].join("\n");

export default function MonumentGalaxy(props) {
  var lang = props.lang || "en";
  var host = useRef(null);
  var tipRef = useRef(null);
  var youRef = useRef(null);
  var engine = useRef(null);
  var [count, setCount] = useState(null);
  var [mine, setMine] = useState(-1);
  var seedsRef = useRef([]);
  var mineRef = useRef(-1);   // the scene may boot after our star was born
  var entropy = useRef({ mx: 0, md: 0, sc: 0, t0: performance.now() });
  var langRef = useRef(lang); langRef.current = lang;

  // behavioural entropy for this visit's anonymous seed
  useEffect(function () {
    var e = entropy.current, lx = 0, ly = 0;
    function onMove(ev) { var dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; e.mx++; e.md += Math.sqrt(dx * dx + dy * dy); }
    function onScroll() { e.sc = Math.max(e.sc, window.scrollY); }
    window.addEventListener("mousemove", onMove, { passive: true }); window.addEventListener("scroll", onScroll, { passive: true });
    return function () { window.removeEventListener("mousemove", onMove); window.removeEventListener("scroll", onScroll); };
  }, []);

  // load the monument, then (once per session, after 8s) light our star
  useEffect(function () {
    var alive = true;
    fetch("/api/monument.php").then(function (r) { return r.json(); }).then(function (d) {
      if (!alive || !d.ok) return;
      seedsRef.current = d.seeds || []; setCount(d.count || 0);
      if (engine.current) engine.current.rebuild();
    }).catch(function () {
      // local preview without the API: deterministic stand-in seeds
      var s = []; for (var i = 0; i < 260; i++) { var h = ""; for (var j = 0; j < 12; j++) h += "0123456789abcdef"[(i * 2654435761 + j * 40503 + j * i * 97) % 16]; s.push(h); }
      seedsRef.current = s; setCount(null);
      if (engine.current) engine.current.rebuild();
    });
    var t = setTimeout(function () {
      var e = entropy.current;
      var raw = [e.mx, Math.round(e.md), e.sc, Math.round(performance.now() - e.t0), screen.width, screen.height,
        Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.language, Date.now()].join("|");
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function (buf) {
        var seed = Array.from(new Uint8Array(buf)).slice(0, 6).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
        try { if (sessionStorage.getItem("cs_shard")) return; } catch (err) {}
        function addMine() {
          seedsRef.current = seedsRef.current.concat([seed]);
          var idx = seedsRef.current.length - 1; setMine(idx); mineRef.current = idx;
          if (engine.current) engine.current.grow(idx);
        }
        fetch("/api/monument.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seed: seed }) })
          .then(function (r) { return r.json(); }).then(function (d) {
            if (!alive || !d.ok) return;
            try { sessionStorage.setItem("cs_shard", "1"); } catch (err) {}
            if (d.index >= 0) { setCount(d.count); addMine(); }
          }).catch(function () { if (alive) addMine(); });  // offline: still show it locally
      });
    }, 8000);
    return function () { alive = false; clearTimeout(t); };
  }, []);

  // the galaxy
  useEffect(function () {
    var el = host.current; if (!el) return;
    var mounted = true, cleanup = null, startIO = null;
    var still = prefersReducedMotion();

    function boot() {
      import("three").then(async function (THREE) {
        if (!mounted) return;
        var mobile = window.innerWidth < 768;
        var renderer;
        try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" }); } catch (e) { return; }
        renderer.setClearColor(0x000000, 0);
        var canvas = renderer.domElement;
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = "display:block;width:100%;height:100%;position:absolute;inset:0;touch-action:pan-y;opacity:0;transition:opacity 1s ease";
        el.appendChild(canvas);
        function dead() { if (mounted) return false; try { renderer.forceContextLoss(); } catch (e) {} renderer.dispose(); if (el.contains(canvas)) el.removeChild(canvas); return true; }

        var G = await buildGalaxy(mobile ? 0.45 : 1);
        if (dead()) return;
        var scene = new THREE.Scene();
        // the sky is drawn by WebGL itself (same gradient as the CSS poster underneath): additive light on a
        // transparent canvas would also write alpha, and the disk's black corners showed up as a square
        var bgCv = document.createElement("canvas"); bgCv.width = 256; bgCv.height = 256;
        var bgx = bgCv.getContext("2d"), bgg = bgx.createRadialGradient(128, 128, 0, 128, 128, 181);
        bgg.addColorStop(0, "#0b1020"); bgg.addColorStop(0.55, "#060810"); bgg.addColorStop(1, BASE);
        bgx.fillStyle = bgg; bgx.fillRect(0, 0, 256, 256);
        var bgTex = new THREE.CanvasTexture(bgCv); bgTex.colorSpace = THREE.SRGBColorSpace;
        scene.background = bgTex;
        var camera = new THREE.PerspectiveCamera(32, 1, 1, 5000);
        var galaxy = new THREE.Group(); scene.add(galaxy);
        var uniforms = { uScale: { value: 500 }, uMinPx: { value: 1.25 }, uGain: { value: 1 } };

        function geo(pos, col, size, bright) {
          var g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
          g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
          g.setAttribute("aBright", new THREE.Float32BufferAttribute(bright, 1));
          return g;
        }
        var starGeo = geo(G.P, G.C, G.S, G.B);
        var starMat = new THREE.ShaderMaterial({ uniforms: uniforms, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        var stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; galaxy.add(stars);
        var diskCv = await paintDisk(mobile ? 512 : 900);
        if (dead()) return;
        var diskTex = new THREE.CanvasTexture(diskCv); diskTex.colorSpace = THREE.SRGBColorSpace; diskTex.anisotropy = 8;
        var diskMat = new THREE.MeshBasicMaterial({ map: diskTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
        var disk = new THREE.Mesh(new THREE.PlaneGeometry(2.24 * R, 2.24 * R), diskMat);
        disk.rotation.x = -Math.PI / 2; disk.renderOrder = -1; galaxy.add(disk);
        var skyGeo = geo(G.SK, G.SKC, G.SKS, G.SKB);
        var sky = new THREE.Points(skyGeo, starMat); sky.frustumCulled = false; scene.add(sky);
        // the nucleus: two soft additive glows (a sprite always faces the camera)
        function glowTex(stops) {
          var cv = document.createElement("canvas"); cv.width = cv.height = 128;
          var x = cv.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
          stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); }); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
          return new THREE.CanvasTexture(cv);
        }
        var coreTex = glowTex([[0, "rgba(255,236,200,1)"], [0.12, "rgba(255,214,160,.65)"], [0.4, "rgba(255,170,100,.16)"], [1, "rgba(255,150,90,0)"]]);
        var core1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: coreTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 }));
        core1.scale.set(R * 0.38, R * 0.38, 1); core1.material.opacity = 0.3; galaxy.add(core1);
        var hazeTex = glowTex([[0, "rgba(170,190,255,.22)"], [0.5, "rgba(120,140,220,.07)"], [1, "rgba(90,110,200,0)"]]);
        var haze = new THREE.Sprite(new THREE.SpriteMaterial({ map: hazeTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
        haze.scale.set(R * 2.4, R * 2.4, 1); haze.visible = false; galaxy.add(haze);

        // visitors
        var visGeo = new THREE.BufferGeometry();
        var VP = new Float32Array(SLOTS * 3), VC = new Float32Array(SLOTS * 3), VS = new Float32Array(SLOTS), VB = new Float32Array(SLOTS), VPh = new Float32Array(SLOTS), VPe = new Float32Array(SLOTS), VM = new Float32Array(SLOTS);
        visGeo.setAttribute("position", new THREE.BufferAttribute(VP, 3)); visGeo.setAttribute("aColor", new THREE.BufferAttribute(VC, 3));
        visGeo.setAttribute("aSize", new THREE.BufferAttribute(VS, 1)); visGeo.setAttribute("aBright", new THREE.BufferAttribute(VB, 1));
        visGeo.setAttribute("aPhase", new THREE.BufferAttribute(VPh, 1)); visGeo.setAttribute("aPer", new THREE.BufferAttribute(VPe, 1));
        visGeo.setAttribute("aMine", new THREE.BufferAttribute(VM, 1));
        var visUniforms = { uScale: uniforms.uScale, uTime: { value: 0 }, uMineGrow: { value: 1 } };
        var visMat = new THREE.ShaderMaterial({ uniforms: visUniforms, vertexShader: VIS_VS, fragmentShader: VIS_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        var vis = new THREE.Points(visGeo, visMat); vis.frustumCulled = false; vis.renderOrder = 3; galaxy.add(vis);
        // your star's ring
        var ringCv = document.createElement("canvas"); ringCv.width = ringCv.height = 128;
        var rx = ringCv.getContext("2d"); rx.strokeStyle = "rgba(0,229,255,1)"; rx.lineWidth = 2.5; rx.beginPath(); rx.arc(64, 64, 54, 0, Math.PI * 2); rx.stroke();
        rx.lineWidth = 2; [0, 1, 2, 3].forEach(function (q) { var a = q * Math.PI / 2; rx.beginPath(); rx.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); rx.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); rx.stroke(); });
        var ringTex = new THREE.CanvasTexture(ringCv);
        var ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
        ring.visible = false; galaxy.add(ring);

        var mineIdx = mineRef.current, growT = still ? 1 : 0, placed = [];
        function rebuild() {
          var seeds = seedsRef.current, n = Math.min(seeds.length, SLOTS);
          placed = [];
          for (var i = 0; i < n; i++) {
            var s = starFor(seeds[i], i); placed.push(s);
            VP[i * 3] = s.x; VP[i * 3 + 1] = s.y; VP[i * 3 + 2] = s.z;
            VC[i * 3] = 0.55 + 0.45 * s.col[0]; VC[i * 3 + 1] = 0.55 + 0.45 * s.col[1]; VC[i * 3 + 2] = 0.55 + 0.45 * s.col[2];
            VS[i] = 4.2 * s.bright; VB[i] = 0.5 * s.bright; VPh[i] = s.phase; VPe[i] = s.per; VM[i] = i === mineIdx ? 1 : 0;
          }
          visGeo.setDrawRange(0, n);
          ["position", "aColor", "aSize", "aBright", "aPhase", "aPer", "aMine"].forEach(function (k) { visGeo.attributes[k].needsUpdate = true; });
          if (mineIdx >= 0 && placed[mineIdx]) { var m = placed[mineIdx]; ring.position.set(m.x, m.y, m.z); ring.visible = true; }
          else ring.visible = false;
        }
        function grow(idx) { mineIdx = idx; growT = still ? 1 : 0; rebuild(); if (still) { visUniforms.uMineGrow.value = 1; ring.material.opacity = 1; ring.scale.setScalar(R * 0.11); render(); } }

        // camera: a tilted view of the disk that fills the panel
        var tilt = 0.98, yaw = 0, spin = 0, tiltSet = false;
        function size() {
          var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
          var dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
          renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
          camera.aspect = w / h; camera.updateProjectionMatrix();
          if (!tiltSet) { tilt = camera.aspect < 0.9 ? 0.55 : camera.aspect < 1.3 ? 0.8 : 0.98; tiltSet = true; }   // portrait: show the disk more face-on
          uniforms.uScale.value = (h * dpr) / (2 * Math.tan(camera.fov * Math.PI / 360));
          uniforms.uMinPx.value = 1.25 * dpr;
          var vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
          var halfW = R * 1.34, halfH = R * (Math.cos(tilt) * 1.34 + 0.2);
          frameDist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2)) * 1.04 + R * 0.4;
          place();
        }
        var frameDist = 300;
        function place() {
          camera.position.set(Math.sin(yaw) * Math.sin(tilt) * frameDist, Math.cos(tilt) * frameDist, Math.cos(yaw) * Math.sin(tilt) * frameDist);
          camera.lookAt(0, 0, 0);
        }
        size(); rebuild();
        engine.current = { rebuild: rebuild, grow: grow };

        function render() { renderer.render(scene, camera); }
        var raf = null, last = null, visible = true, t = 0;
        // drag to turn and tilt (mouse/pen; touch keeps scrolling the page)
        var drag = false, lx = 0, ly = 0, vYaw = 0;
        function onDown(e) { if (still || e.pointerType === "touch") return; drag = true; lx = e.clientX; ly = e.clientY; vYaw = 0; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} canvas.style.cursor = "grabbing"; }
        function onUp() { drag = false; canvas.style.cursor = ""; }
        // hover: read a visitor star's number and class
        var tip = tipRef.current, you = youRef.current, mx = -1, my = -1, hoverRaf = 0;
        var v3 = new THREE.Vector3();
        function onMove(e) {
          if (drag) { var dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; vYaw = dx * 0.005; yaw += vYaw; tilt = Math.max(0.45, Math.min(1.35, tilt - dy * 0.004)); place(); if (!raf) render(); return; }
          var r = canvas.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
          if (!hoverRaf) hoverRaf = requestAnimationFrame(hover);
        }
        function hover() {
          hoverRaf = 0; if (!tip) return;
          var w = canvas.clientWidth, h = canvas.clientHeight, best = -1, bd = 14 * 14;
          galaxy.updateMatrixWorld();
          for (var i = 0; i < placed.length; i++) {
            v3.set(placed[i].x, placed[i].y, placed[i].z).applyMatrix4(galaxy.matrixWorld).project(camera);
            var sx = (v3.x + 1) / 2 * w, sy = (1 - v3.y) / 2 * h, d = (sx - mx) * (sx - mx) + (sy - my) * (sy - my);
            if (d < bd) { bd = d; best = i; tip.style.transform = "translate(" + Math.round(sx + 12) + "px," + Math.round(sy - 22) + "px)"; }
          }
          if (best < 0) { tip.style.opacity = "0"; return; }
          var L = langRef.current, cls = placed[best].cls;
          tip.textContent = "★ #" + (best + 1) + " · " + (L === "it" ? "CLASSE " : L === "bg" ? "КЛАС " : "CLASS ") + cls + (best === mineIdx ? (L === "it" ? " · TU" : L === "bg" ? " · ТИ" : " · YOU") : "");
          tip.style.opacity = "1";
        }
        function onLeave() { if (tip) tip.style.opacity = "0"; }
        canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp); canvas.addEventListener("pointerleave", onLeave);

        function labelMine() {
          if (!you) return;
          if (mineIdx < 0 || !placed[mineIdx]) { you.style.opacity = "0"; return; }
          var m = placed[mineIdx]; galaxy.updateMatrixWorld();
          v3.set(m.x, m.y, m.z).applyMatrix4(galaxy.matrixWorld).project(camera);
          you.style.transform = "translate(" + Math.round((v3.x + 1) / 2 * canvas.clientWidth + 16) + "px," + Math.round((1 - v3.y) / 2 * canvas.clientHeight + 10) + "px)";
          you.style.opacity = String(Math.min(1, growT * 1.5));
        }
        function pose() { galaxy.rotation.y = spin; }   // +y turns θ backwards: the arms trail, as in nature
        function loop(now) {
          if (!mounted) return;
          var dt = last == null ? 16 : Math.min(now - last, 50); last = now; t += dt / 1000;
          spin += dt / 1000 * 0.014;                                  // one turn every ~7.5 minutes
          if (!drag && Math.abs(vYaw) > 1e-4) { yaw += vYaw; vYaw *= Math.pow(0.92, dt / 16.7); place(); }
          visUniforms.uTime.value = t;
          if (mineIdx >= 0) {
            if (growT < 1) { growT = Math.min(1, growT + dt / 2600); }
            var e = 1 - Math.pow(1 - growT, 3);
            visUniforms.uMineGrow.value = e;
            var pulse = 0.5 + 0.5 * Math.sin(t * 1.3);
            ring.material.opacity = (0.55 + 0.25 * pulse) * e;
            ring.scale.setScalar(R * (0.1 + 0.02 * pulse) * (0.6 + 0.4 * e));
          }
          pose(); render(); labelMine();
          raf = requestAnimationFrame(loop);
        }
        function start() { if (raf || !visible || document.hidden || still) return; last = null; raf = requestAnimationFrame(loop); }
        function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
        spin = 0.6; pose();
        if (mineIdx >= 0) { visUniforms.uMineGrow.value = 1; ring.material.opacity = 1; ring.scale.setScalar(R * 0.11); growT = 1; }
        try { await renderer.compileAsync(scene, camera); } catch (e) {}
        if (dead()) return;
        render(); labelMine();
        requestAnimationFrame(function () { canvas.style.opacity = "1"; });
        start();

        var ro = "ResizeObserver" in window ? new ResizeObserver(function () { size(); if (!raf) { render(); labelMine(); } }) : null;
        if (ro) ro.observe(el);
        var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible) start(); else stop(); }); }) : null;
        if (io) io.observe(el);
        function onVis() { if (document.hidden) stop(); else start(); }
        document.addEventListener("visibilitychange", onVis);

        cleanup = function () {
          stop(); engine.current = null; if (hoverRaf) cancelAnimationFrame(hoverRaf);
          if (ro) ro.disconnect(); if (io) io.disconnect();
          document.removeEventListener("visibilitychange", onVis);
          canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp); canvas.removeEventListener("pointerleave", onLeave);
          [starGeo, skyGeo, visGeo, disk.geometry].forEach(function (g) { g.dispose(); });
          [starMat, diskMat, visMat, core1.material, haze.material, ring.material].forEach(function (m) { m.dispose(); });
          [coreTex, hazeTex, ringTex, diskTex, bgTex].forEach(function (x) { x.dispose(); });
          try { renderer.forceContextLoss(); } catch (e) {} renderer.dispose();
          if (el.contains(canvas)) el.removeChild(canvas);
        };
      });
    }

    if ("IntersectionObserver" in window) {
      startIO = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting && startIO) { startIO.disconnect(); startIO = null; boot(); } }); }, { rootMargin: "300px" });
      startIO.observe(el);
    } else boot();
    return function () { mounted = false; if (startIO) startIO.disconnect(); if (cleanup) cleanup(); };
  }, []);

  var L = {
    stars: { it: "STELLE", en: "STARS", bg: "ЗВЕЗДИ" },
    yours: { it: "LA TUA STELLA BRILLA IN CIANO", en: "YOUR STAR GLOWS CYAN", bg: "ТВОЯТА ЗВЕЗДА СВЕТИ В ЦИАН" },
    forging: { it: "LA TUA STELLA STA NASCENDO...", en: "YOUR STAR IS BEING BORN...", bg: "ТВОЯТА ЗВЕЗДА СЕ РАЖДА..." },
    legend: { it: "LE PRIME STELLE ACCANTO AL NUCLEO · LE NUOVE NASCONO SUI BRACCI ESTERNI", en: "FIRST STARS NEAR THE CORE · NEW ONES ARE BORN ON THE OUTER ARMS", bg: "ПЪРВИТЕ ЗВЕЗДИ СА ДО ЯДРОТО · НОВИТЕ СЕ РАЖДАТ ПО ВЪНШНИТЕ РЪКАВИ" },
    hint: { it: "TRASCINA PER RUOTARE · PUNTA UNA STELLA", en: "DRAG TO TURN · POINT AT A STAR", bg: "ВЛАЧИ ЗА ЗАВЪРТАНЕ · ПОСОЧИ ЗВЕЗДА" },
    you: { it: "TU", en: "YOU", bg: "ТИ" }
  };
  function tt(k) { return L[k][lang] || L[k].en; }
  return (
    <div ref={host} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden",
      background: "radial-gradient(ellipse 70% 60% at 50% 50%, #0b1020 0%, #060810 55%, " + BASE + " 100%)" }}>
      <div style={{ position: "absolute", top: 12, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: "rgba(0,229,255,.85)", textShadow: "0 1px 6px rgba(0,0,0,.8)" }}>
        {count != null ? count.toLocaleString() + " " + tt("stars") : "LOCAL PREVIEW"}
      </div>
      <div style={{ position: "absolute", top: 28, left: 14, right: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".16em", color: "#8A949B" }}>{tt("legend")}</div>
      <div aria-live="polite" style={{ position: "absolute", bottom: 12, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".2em", color: mine >= 0 ? C : "#8A949B" }}>
        {mine >= 0 ? "◆ " + tt("yours") : "◌ " + tt("forging")}
      </div>
      <style>{"@media(hover:none),(pointer:coarse){.cs-gx-hint{display:none}}"}</style>
      <div className="cs-gx-hint" aria-hidden="true" style={{ position: "absolute", bottom: 12, right: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".2em", color: "#5f6a72" }}>{tt("hint")}</div>
      <div ref={tipRef} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, zIndex: 3, pointerEvents: "none", opacity: 0, transition: "opacity .15s", fontFamily: MONO, fontSize: 9, letterSpacing: ".14em", color: "#E8EEF1", background: "rgba(5,7,10,.82)", border: "1px solid rgba(0,229,255,.35)", padding: "3px 7px", whiteSpace: "nowrap" }} />
      <div ref={youRef} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, zIndex: 3, pointerEvents: "none", opacity: 0, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: ".24em", color: C, textShadow: "0 0 8px rgba(0,229,255,.8)" }}>{tt("you")}</div>
    </div>
  );
}
