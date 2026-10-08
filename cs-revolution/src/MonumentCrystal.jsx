import React, { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// THE MONUMENT — a geode that fills by one crystal per visit.
//
// Data model unchanged (api/monument.php): every visit hashes its own
// behaviour (cursor, scroll, time, screen, zone) into an anonymous 12-hex
// seed; the server keeps it forever (one per IP / 12h). No personal data.
//
// What the shape MEANS (third version, 2026-10-08 — the druse read as
// "glass shards on a grey cake"):
//  * a geode cut in half: rough rock shell, a polished cut face with agate
//    banding, and a cavity lined with celestine-blue crystals;
//  * one visitor = one crystal on the cavity wall. Places are taken in a
//    gap-filling order, so the crystals spread over the whole cavity and
//    each newcomer fills a hole; at 1200 the geode is full. The first
//    visitors, having grown longest, have the largest crystals; yours
//    glows cyan;
//  * the seed sets each crystal's lean, length, girth and tint.
// A fine bed of micro-crystals lines the whole cavity, so the geode reads
// as real at any count; visitors' crystals are the large, clear ones.
//
// Rendering (robust on every GPU — no transmission pass): opaque, flat-
// faceted crystals lit by a dark studio environment of softbox strips
// (what makes facets flash like cut stones), a canvas-generated agate band
// texture with a polished / rough split, value-noise rock, fake occlusion
// in the instance colours, a soft inner glow light, slow glints on a few
// tips (each ~0.6 s, rare, small — no flashing). Same discipline as the
// other WebGL panels: boots near the viewport, pauses off-screen, single
// static frame for reduced motion, full dispose.
// ═══════════════════════════════════════════════════════════════

var C = "#00e5ff";
var BASE = "#0A0C0E";
var MONO = "'Space Mono',ui-monospace,monospace";
var SLOTS = 1200;                     // API returns the last 1200 seeds; the geode is full at 1200
var R = 60;                           // outer radius of the shell
var RIN = 0.64;                       // cavity radius as a fraction of R
var DEPTH_OUT = 0.9, DEPTH_IN = 0.95; // how deep the shell / the cavity reach behind the cut
var GA = Math.PI * (3 - Math.sqrt(5));

function prefersReducedMotion() { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// ── deterministic value noise (rock, cavity outline, agate wobble) ──
function hash3(x, y, z) {
  var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, y, z) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  function L(a, b, t) { return a + (b - a) * t; }
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
           L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
}
function fbm(x, y, z, oct) { var a = 0, amp = 0.5, f = 1; for (var i = 0; i < oct; i++) { a += amp * vnoise(x * f, y * f, z * f); f *= 2.03; amp *= 0.5; } return a; }

// unit hemisphere behind the cut plane: th = angle around the cut, al = 0 at the cut … π/2 at the back pole
function dir(th, al) { return [Math.cos(al) * Math.cos(th), Math.cos(al) * Math.sin(th), -Math.sin(al)]; }
function outerR(d) { return R * (1 + 0.075 * fbm(d[0] * 1.6 + 3, d[1] * 1.6, d[2] * 1.6, 3) + 0.022 * fbm(d[0] * 7, d[1] * 7, d[2] * 7 + 9, 2)); }
function innerR(d) { return R * RIN * (1 + 0.1 * fbm(d[0] * 1.3 + 11, d[1] * 1.3, d[2] * 1.3 + 5, 3)); }
function outerP(th, al) { var d = dir(th, al), r = outerR(d); return [d[0] * r, d[1] * r, d[2] * r * DEPTH_OUT]; }
function innerP(th, al) { var d = dir(th, al), r = innerR(d); return [d[0] * r, d[1] * r, d[2] * r * DEPTH_IN]; }

// a (th × al) grid surface, θ wraps (no seam), indexed so normals are smooth
function gridSurface(THREE, NT, NA, fn, inward, colorFn) {
  var pos = [], col = [], idx = [];
  for (var a = 0; a <= NA; a++) {
    var al = a / NA * Math.PI / 2;
    for (var t = 0; t < NT; t++) {
      var th = t / NT * Math.PI * 2, p = fn(th, al);
      pos.push(p[0], p[1], p[2]);
      var c = colorFn(th, al, p); col.push(c[0], c[1], c[2]);
    }
  }
  for (var a2 = 0; a2 < NA; a2++) for (var t2 = 0; t2 < NT; t2++) {
    var i0 = a2 * NT + t2, i1 = a2 * NT + (t2 + 1) % NT, i2 = (a2 + 1) * NT + t2, i3 = (a2 + 1) * NT + (t2 + 1) % NT;
    if (inward) idx.push(i0, i1, i2, i1, i3, i2); else idx.push(i0, i2, i1, i1, i2, i3);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// the polished cut face: an annulus between the cavity lip and the shell edge, UV u = 0 (lip) … 1 (rind)
function buildCutFace(THREE, NT, NR) {
  var pos = [], uv = [], idx = [];
  for (var k = 0; k <= NR; k++) {
    var tt = k / NR;
    for (var t = 0; t <= NT; t++) {
      var th = t / NT * Math.PI * 2, a = innerP(th, 0), b = outerP(th, 0);
      pos.push(a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt, 0);
      uv.push(tt, t / NT);
    }
  }
  var W = NT + 1;
  for (var k2 = 0; k2 < NR; k2++) for (var t2 = 0; t2 < NT; t2++) {
    var i0 = k2 * W + t2, i1 = i0 + 1, i2 = i0 + W, i3 = i2 + 1;
    idx.push(i0, i2, i1, i1, i2, i3);   // faces +z, toward the viewer
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// agate banding for the cut face (colour) + polish map (roughness in G): the bands follow the cavity
// outline with a wobble, the outer rind is rough rock. Built row by row with yields (no long task).
async function agateTextures(THREE, W, H) {
  var cc = document.createElement("canvas"); cc.width = W; cc.height = H;
  var rc = document.createElement("canvas"); rc.width = W; rc.height = H;
  var cx = cc.getContext("2d"), rx = rc.getContext("2d");
  var ci = cx.createImageData(W, H), ri = rx.createImageData(W, H);
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  var LIP = [214, 226, 234];
  // each band has its own colour and width (real agate is not a ruler): slate, blue-grey, translucent, rare milky lines
  var PAL = [[30, 37, 45], [62, 78, 93], [44, 55, 66], [96, 116, 132], [150, 166, 178], [36, 44, 53], [74, 92, 108]];
  var RIND = [64, 56, 48], RIND2 = [34, 31, 28];
  for (var y = 0; y < H; y++) {
    var th = y / H * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
    for (var x = 0; x < W; x++) {
      var t = x / (W - 1);
      var tw = t + 0.045 * vnoise(cs * 2.2, sn * 2.2, 3.1 + t * 1.5) + 0.014 * vnoise(cs * 8, sn * 8, t * 6);
      var c, rough;
      if (tw < 0.06) {                                   // drusy lip: white micro-quartz, sparkly
        var sp = hash3(x, y, 7) > 0.9 ? 1 : 0;
        c = mix(LIP, [255, 255, 255], sp * 0.7); rough = 0.4;
      } else if (tw < 0.17) {                             // translucent blue chalcedony next to the crystals
        var q = (tw - 0.06) / 0.11;
        c = mix([120, 150, 170], [70, 92, 110], q); rough = 0.08;
      } else if (tw < 0.86) {                             // agate bands, polished
        var bc = (tw - 0.17) * 11 + 1.6 * vnoise(tw * 3.2, 0.5, 2.0);
        var k = Math.floor(bc), f = bc - k;
        var base = PAL[Math.floor(hash3(k, 13, 2) * PAL.length)];
        var next = PAL[Math.floor(hash3(k + 1, 13, 2) * PAL.length)];
        c = mix(base, next, Math.pow(f, 3));                         // soft fade into the next band
        if (f < 0.07 && hash3(k, 5, 5) > 0.45) c = mix(c, [205, 214, 220], (1 - f / 0.07) * 0.75); // thin bright line
        c = c.map(function (v) { return v * (0.94 + 0.12 * hash3(x >> 1, y >> 2, k)); });
        rough = 0.09;
      } else {                                            // the rind: rough, weathered
        var n = 0.5 + 0.5 * vnoise(cs * 9, sn * 9, tw * 20);
        c = mix(RIND, RIND2, Math.min(1, (tw - 0.86) * 5) * 0.7 + n * 0.3); rough = 0.85;
      }
      var o = (y * W + x) * 4;
      ci.data[o] = c[0]; ci.data[o + 1] = c[1]; ci.data[o + 2] = c[2]; ci.data[o + 3] = 255;
      ri.data[o] = 0; ri.data[o + 1] = Math.round(rough * 255); ri.data[o + 2] = 0; ri.data[o + 3] = 255;
    }
    if (y % 64 === 63) await tick();
  }
  cx.putImageData(ci, 0, 0); rx.putImageData(ri, 0, 0);
  var map = new THREE.CanvasTexture(cc); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  var rmap = new THREE.CanvasTexture(rc);
  return { map: map, rough: rmap };
}

// hexagonal crystal: 6-sided prism + pyramidal termination, flat facets, base y=0, tip y=1.
// RGB vertex colour darkens toward the root (light reaches the tip, not the bed).
function buildCrystalGeometry(THREE) {
  var pos = [], col = [], sides = 6, prismTop = 0.7;
  function v(a, r, y) { return [Math.cos(a) * r, y, Math.sin(a) * r]; }
  var ROOT = [0.42, 0.45, 0.5], MID = [0.85, 0.88, 0.9], TIP = [1, 1, 1];
  for (var i = 0; i < sides; i++) {
    var a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
    var b0 = v(a0, 1, 0), b1 = v(a1, 1, 0), t0 = v(a0, 0.9, prismTop), t1 = v(a1, 0.9, prismTop), apex = [0, 1, 0];
    pos.push.apply(pos, b0.concat(t0, b1, b1, t0, t1));
    col.push.apply(col, ROOT.concat(MID, ROOT, ROOT, MID, MID));
    pos.push.apply(pos, t0.concat(apex, t1));
    col.push.apply(col, MID.concat(TIP, MID));
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals(); // non-indexed → flat facets
  return geo;
}

// a point on the cavity wall + the direction a crystal grows from it (inward, toward the centre)
var CENTER = [0, 0, -R * RIN * DEPTH_IN * 0.35];
function cavitySpot(th, al, lean1, lean2) {
  var p = innerP(th, al);
  var dx = CENTER[0] - p[0], dy = CENTER[1] - p[1], dz = CENTER[2] - p[2];
  var l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
  dz += 0.18; dx += lean1 * 0.55; dy += lean2 * 0.55;   // lean a little toward the opening and sideways
  var l2 = Math.hypot(dx, dy, dz) || 1;
  return { p: p, d: [dx / l2, dy / l2, dz / l2] };
}

// Arrival order → place on the wall. The 1200 places are a Fibonacci lattice over the cavity; visitors
// take them in bit-reversed order, so any number of crystals is spread over the WHOLE cavity and each
// newcomer fills a gap (a plain spiral piled the first few hundred into one lump at the back).
var ORDER = (function () {
  var o = [];
  for (var k = 0; k < 2048; k++) { var r = 0, x = k; for (var b = 0; b < 11; b++) { r = (r << 1) | (x & 1); x >>= 1; } if (r < SLOTS) o.push(r); }
  return o;
})();

// seed → crystal. Visitor i always gets place ORDER[i]: the geode never reshuffles.
function crystalFor(THREE, seed, i, n) {
  var h1 = parseInt(seed.substring(0, 4), 16) / 0xffff, h2 = parseInt(seed.substring(4, 8), 16) / 0xffff, h3 = parseInt(seed.substring(8, 12), 16) / 0xffff;
  var slot = ORDER[i % SLOTS], u = (slot + 0.5) / SLOTS;
  var phi = Math.acos(1 - 0.92 * u);             // angle from the back pole, area-uniform
  var al = Math.PI / 2 - phi, th = slot * GA + h1 * 0.3;
  var spot = cavitySpot(th, al, h2 - 0.5, h3 - 0.5);
  var age = n > 1 ? 1 - i / (n - 1) : 1;          // oldest = 1
  var len = (8 + h2 * 9) * (0.62 + 0.75 * age);
  var girth = 2.3 + h3 * 1.9;
  var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(spot.d[0], spot.d[1], spot.d[2]));
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h1 * Math.PI));
  var occ = 0.55 + 0.45 * (phi / (Math.PI / 2));   // deep in the cavity = less light
  var tint = h3 < 0.55 ? [0.80, 0.90, 0.97] : h3 < 0.85 ? [0.92, 0.96, 0.99] : [0.86, 0.83, 0.80]; // celestine · clear · smoky
  var pos = new THREE.Vector3(spot.p[0] - spot.d[0] * 0.8, spot.p[1] - spot.d[1] * 0.8, spot.p[2] - spot.d[2] * 0.8); // rooted
  return { pos: pos, q: q, scale: new THREE.Vector3(girth, len, girth), tint: tint, occ: occ };
}

export default function MonumentCrystal(props) {
  var lang = props.lang || "en";
  var host = useRef(null);
  var engine = useRef(null);
  var [count, setCount] = useState(null);
  var [mine, setMine] = useState(-1);
  var seedsRef = useRef([]);
  var mineRef = useRef(-1);   // the scene may boot after our crystal was forged
  var entropy = useRef({ mx: 0, md: 0, sc: 0, t0: performance.now() });

  // behavioural entropy for this visit's anonymous seed
  useEffect(function () {
    var e = entropy.current, lx = 0, ly = 0;
    function onMove(ev) { var dx = ev.clientX - lx, dy = ev.clientY - ly; lx = ev.clientX; ly = ev.clientY; e.mx++; e.md += Math.sqrt(dx * dx + dy * dy); }
    function onScroll() { e.sc = Math.max(e.sc, window.scrollY); }
    window.addEventListener("mousemove", onMove, { passive: true }); window.addEventListener("scroll", onScroll, { passive: true });
    return function () { window.removeEventListener("mousemove", onMove); window.removeEventListener("scroll", onScroll); };
  }, []);

  // load the monument, then (once per session, after 8s) forge our crystal
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

  // 3D scene
  useEffect(function () {
    var el = host.current; if (!el) return;
    var mounted = true, cleanup = null, startIO = null;
    var still = prefersReducedMotion();

    function boot() {
      import("three").then(async function (THREE) {
        if (!mounted) return;
        var mobile = window.innerWidth < 768;
        var renderer;
        try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return; }
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.AgXToneMapping;
        renderer.toneMappingExposure = 1.15;
        var canvas = renderer.domElement;
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = "display:block;width:100%;height:100%;position:absolute;inset:0;touch-action:pan-y;opacity:0;transition:opacity .8s ease";
        el.appendChild(canvas);

        var scene = new THREE.Scene();
        // ── dark studio: black room + softbox strips. Facets either fall into the dark or catch a strip,
        // which is exactly how cut stones are photographed (and why the old grey room washed them out).
        var envScene = new THREE.Scene(); envScene.background = new THREE.Color(0x020304);
        var envGeo = [], envMat = [];
        function strip(w, h, hex, k, x, y, z) {
          var g = new THREE.PlaneGeometry(w, h), m = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide });
          var me = new THREE.Mesh(g, m); me.position.set(x, y, z); me.lookAt(0, 0, 0); envScene.add(me); envGeo.push(g); envMat.push(m);
        }
        strip(7, 2.2, 0xffffff, 7, 0, 6, 3);       // overhead softbox
        strip(1.1, 6, 0xffffff, 5, -6, 1.5, 3.5);  // left strip
        strip(1.1, 6, 0x9fefff, 4, 6, 0.5, 2);     // right strip, cyan cast (brand)
        strip(9, 0.9, 0xfff3e6, 1.6, 0, -2.5, -7); // low back strip, warm
        strip(3, 3, 0x7fdcff, 1.2, 0, -6, 2);      // floor bounce
        var pmrem = new THREE.PMREMGenerator(renderer);
        var envTex = pmrem.fromScene(envScene, 0.015).texture; pmrem.dispose();
        envGeo.forEach(function (g) { g.dispose(); }); envMat.forEach(function (m) { m.dispose(); });
        scene.environment = envTex;
        var key = new THREE.DirectionalLight(0xfff6ec, 2.6); key.position.set(-200, 190, 110); scene.add(key);
        var fill = new THREE.HemisphereLight(0x2a3a48, 0x0b0907, 0.6); scene.add(fill);
        var camera = new THREE.PerspectiveCamera(28, 1, 1, 3000);

        function dead() { if (mounted) return false; envTex.dispose(); try { renderer.forceContextLoss(); } catch (e) {} renderer.dispose(); if (el.contains(canvas)) el.removeChild(canvas); return true; }
        await tick(); if (dead()) return;

        var root = new THREE.Group(); scene.add(root);
        var NT = mobile ? 150 : 220, NA = mobile ? 36 : 54;
        // shell: weathered, dark, matte; noise in the vertex colour (pits, iron stains)
        var shellGeo = gridSurface(THREE, NT, NA, outerP, false, function (th, al, p) {
          var n = fbm(p[0] * 0.09, p[1] * 0.09, p[2] * 0.09, 3), pit = Math.max(0, vnoise(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5) - 0.55) * 2.2;
          var b = 0.55 + 0.35 * n - pit * 0.4;
          return [0.075 * b * 1.08, 0.062 * b, 0.052 * b];
        });
        var shellMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.35 });
        var shell = new THREE.Mesh(shellGeo, shellMat); root.add(shell);
        await tick(); if (dead()) return;
        // cavity wall: pale drusy crust, darker the deeper it goes (occlusion)
        var cavGeo = gridSurface(THREE, NT, NA, innerP, true, function (th, al) {
          var o = 0.12 + 0.5 * Math.pow(1 - al / (Math.PI / 2), 1.6);
          return [0.36 * o, 0.46 * o, 0.55 * o];
        });
        var cavMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.6 });
        var cav = new THREE.Mesh(cavGeo, cavMat); root.add(cav);
        var cutGeo = buildCutFace(THREE, NT, mobile ? 24 : 36);
        var tex = await agateTextures(THREE, mobile ? 192 : 256, mobile ? 512 : 1024);
        if (dead()) { tex.map.dispose(); tex.rough.dispose(); return; }
        var cutMat = new THREE.MeshPhysicalMaterial({ map: tex.map, roughnessMap: tex.rough, roughness: 1, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.08, envMapIntensity: 1.15 });
        var cut = new THREE.Mesh(cutGeo, cutMat); root.add(cut);
        // a soft contact shadow under the stone
        var sc = document.createElement("canvas"); sc.width = sc.height = 256;
        var sx = sc.getContext("2d"), gr = sx.createRadialGradient(128, 128, 0, 128, 128, 128);
        gr.addColorStop(0, "rgba(0,0,0,.75)"); gr.addColorStop(0.55, "rgba(0,0,0,.3)"); gr.addColorStop(1, "rgba(0,0,0,0)");
        sx.fillStyle = gr; sx.fillRect(0, 0, 256, 256);
        var shadowTex = new THREE.CanvasTexture(sc);
        var shadow = new THREE.Mesh(new THREE.PlaneGeometry(R * 3, R * 1.6), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -R * 1.02, -R * 0.35); scene.add(shadow);

        // crystals — one geometry, two instanced beds (micro crust + visitors), one hero mesh (yours)
        var crystalGeo = buildCrystalGeometry(THREE);
        var gem = new THREE.MeshPhysicalMaterial({
          color: 0x9fb8c8, vertexColors: true, metalness: 0, roughness: 0.03, ior: 1.62, specularIntensity: 1,
          envMapIntensity: 3, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.3, iridescenceIOR: 1.35,
          emissive: new THREE.Color(0x0b2a3c), emissiveIntensity: 0.12
        });
        // Fake translucency (no transmission pass): a facet that faces the viewer shows the light that
        // passes through the crystal — tinted, brighter toward the tip (vertex colour); a grazing facet
        // shows the studio reflection instead. This is what reads as "glass" rather than "plastic".
        function inner(mat, hex, k) {
          var u = { value: new THREE.Color(hex).multiplyScalar(k) };
          mat.onBeforeCompile = function (sh) {
            sh.uniforms.uInner = u;
            sh.fragmentShader = "uniform vec3 uInner;\n" + sh.fragmentShader.replace("#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\n  float csFacing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);\n" +
              "  #ifdef USE_COLOR\n  totalEmissiveRadiance += uInner * pow(csFacing, 2.2) * vColor.rgb * vColor.rgb;\n  #else\n  totalEmissiveRadiance += uInner * pow(csFacing, 2.2);\n  #endif");
          };
          return u;
        }
        inner(gem, 0x8fd6f5, 0.55);
        var crustMat = gem.clone(); crustMat.roughness = 0.15; crustMat.envMapIntensity = 2; crustMat.iridescence = 0.1; crustMat.emissiveIntensity = 0.05; inner(crustMat, 0x6fb4d6, 0.22);
        var CRUST = mobile ? 2600 : 5600;
        var crust = new THREE.InstancedMesh(crystalGeo, crustMat, CRUST);
        var m4 = new THREE.Matrix4(), col = new THREE.Color(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dv = new THREE.Vector3(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
        for (var ci = 0; ci < CRUST; ci++) {
          var r1 = hash3(ci, 1, 3), r2 = hash3(ci, 2, 5), r3 = hash3(ci, 3, 7), r4 = hash3(ci, 4, 11);
          var phi = Math.acos(1 - 0.985 * r1), al = Math.PI / 2 - phi, th = r2 * Math.PI * 2;
          var sp = cavitySpot(th, al, r3 - 0.5, r4 - 0.5);
          var len = 1 + r3 * 1.6, gir = 0.7 + r4 * 0.6;   // a closed drusy skin, not a second forest
          qq.setFromUnitVectors(up, dv.set(sp.d[0], sp.d[1], sp.d[2]));
          m4.compose(pv.set(sp.p[0] - sp.d[0] * 0.3, sp.p[1] - sp.d[1] * 0.3, sp.p[2] - sp.d[2] * 0.3), qq, sv.set(gir, len, gir));
          crust.setMatrixAt(ci, m4);
          var o = 0.32 + 0.48 * (phi / (Math.PI / 2));
          crust.setColorAt(ci, col.setRGB(0.6 * o, 0.74 * o, 0.86 * o));
          if (ci % 600 === 599) await tick();
        }
        if (dead()) return;
        root.add(crust);
        var inst = new THREE.InstancedMesh(crystalGeo, gem, SLOTS);
        inst.count = 0; inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(inst);
        // yours: the same cut, cyan, lit from within, a size larger — findable at a glance
        var mineMat = gem.clone(); mineMat.vertexColors = false; mineMat.color = new THREE.Color(0x2fd8f5); inner(mineMat, 0x00e5ff, 0.7);
        mineMat.emissive = new THREE.Color(0x00a8c8); mineMat.emissiveIntensity = 0;   // saturated: a bright emissive tone-maps to white
        var haloC = document.createElement("canvas"); haloC.width = haloC.height = 64;
        var hx = haloC.getContext("2d"), hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
        hg.addColorStop(0, "rgba(0,229,255,.55)"); hg.addColorStop(0.45, "rgba(0,229,255,.18)"); hg.addColorStop(1, "rgba(0,229,255,0)");
        hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
        var haloTex = new THREE.CanvasTexture(haloC);
        var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, opacity: 0 }));
        halo.visible = false; root.add(halo);
        var mineMesh = new THREE.Mesh(crystalGeo, mineMat); mineMesh.visible = false; root.add(mineMesh);
        var mineLight = new THREE.PointLight(0x5ff0ff, 0, 120, 1.7); root.add(mineLight);
        // the geode's own glow: light seems to come through the crystal bed
        var glow = new THREE.PointLight(0x9fe6ff, 600, 150, 1.6); glow.position.set(0, 0, -R * RIN * DEPTH_IN * 0.15); root.add(glow);

        // glints: a few tips catch the light now and then (soft, small, rare)
        var gc = document.createElement("canvas"); gc.width = gc.height = 64;
        var gx = gc.getContext("2d"), gg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gg.addColorStop(0, "rgba(255,255,255,1)"); gg.addColorStop(0.18, "rgba(200,245,255,.55)"); gg.addColorStop(1, "rgba(200,245,255,0)");
        gx.fillStyle = gg; gx.fillRect(0, 0, 64, 64);
        gx.fillStyle = "rgba(255,255,255,.75)"; gx.fillRect(31, 4, 2, 56); gx.fillRect(4, 31, 56, 2);
        var glintTex = new THREE.CanvasTexture(gc);
        var glintMat = new THREE.SpriteMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
        var GLINTS = mobile ? 0 : 14, glints = [];
        for (var gi = 0; gi < GLINTS; gi++) { var spr = new THREE.Sprite(glintMat.clone()); spr.scale.set(5, 5, 1); spr.visible = false; root.add(spr); glints.push({ s: spr, ph: hash3(gi, 9, 9) * 40, per: 7 + hash3(gi, 8, 1) * 6 }); }

        var mineIdx = mineRef.current, growT = still ? 1 : 0, crystals = [];
        function rebuild() {
          var seeds = seedsRef.current, n = Math.min(seeds.length, SLOTS);
          crystals = [];
          var k = 0;
          for (var i = 0; i < n; i++) {
            var c = crystalFor(THREE, seeds[i], i, n); crystals.push(c);
            if (i === mineIdx) continue;
            m4.compose(c.pos, c.q, c.scale); inst.setMatrixAt(k, m4);
            inst.setColorAt(k, col.setRGB(c.tint[0] * c.occ, c.tint[1] * c.occ, c.tint[2] * c.occ)); k++;
          }
          inst.count = k; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          // glints sit on the tips of the biggest, most exposed visitor crystals
          var tips = crystals.map(function (c, i) { return { i: i, w: c.scale.y * c.occ }; }).sort(function (a, b) { return b.w - a.w; });
          glints.forEach(function (g, j) {
            var t = tips[(j * 7) % Math.max(1, tips.length)];
            if (!t) { g.s.visible = false; return; }
            var c = crystals[t.i], tip = new THREE.Vector3(0, c.scale.y, 0).applyQuaternion(c.q).add(c.pos);
            g.s.position.copy(tip); g.s.visible = true;
          });
          placeMine();
        }
        function placeMine() {
          if (mineIdx < 0 || !crystals[mineIdx]) { mineMesh.visible = false; mineLight.intensity = 0; halo.visible = false; return; }
          var c = crystals[mineIdx], s = easeOut(growT);
          mineMesh.position.copy(c.pos); mineMesh.quaternion.copy(c.q);
          mineMesh.scale.set(c.scale.x * 1.3 * Math.max(0.05, s), c.scale.y * 2.1 * Math.max(0.02, s), c.scale.z * 1.3 * Math.max(0.05, s));   // reaches past its neighbours
          mineMesh.visible = true;
          var tip = new THREE.Vector3(0, c.scale.y * 1.6 * s, 0).applyQuaternion(c.q).add(c.pos); mineLight.position.copy(tip);
          halo.position.copy(new THREE.Vector3(0, c.scale.y * 1.5 * s, 0).applyQuaternion(c.q).add(c.pos)); halo.visible = true;
          halo.scale.setScalar(26 * Math.max(0.1, s));
        }
        function easeOut(t) { return 1 - Math.pow(1 - Math.min(1, t), 3); }
        // Your crystal sits wherever its place is — sometimes on a side wall the lip hides. Find the turn
        // of the stone (within ±0.9 rad) from which a ray from the camera reaches its tip unblocked, and
        // centre the sway there.
        var home = -0.12;
        function faceMine() {
          if (mineIdx < 0 || !crystals[mineIdx]) return;
          var c = crystals[mineIdx], tipL = new THREE.Vector3(0, c.scale.y * 1.75, 0).applyQuaternion(c.q).add(c.pos);
          var rc = new THREE.Raycaster(), w = new THREE.Vector3(), d = new THREE.Vector3(), keep = root.rotation.y, best = null, fewest = null, fallback = -0.12;
          for (var k = 0; k <= 18; k++) {
            var yaw0 = -0.12 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.1;      // nearest turns first
            root.rotation.y = yaw0; root.updateMatrixWorld(true);
            w.copy(tipL).applyMatrix4(root.matrixWorld);
            d.copy(w).sub(camera.position); var L = d.length(); d.normalize();
            rc.set(camera.position, d); rc.far = L - 0.5;
            var hits = rc.intersectObjects([cut, cav, shell, inst], false).length;   // the rock AND the other crystals
            if (!hits) { best = yaw0; break; }
            if (fewest == null || hits < fewest) { fewest = hits; fallback = yaw0; }
          }
          root.rotation.y = keep; root.updateMatrixWorld(true);
          home = best != null ? best : fallback;
        }
        function grow(idx) { mineIdx = idx; growT = still ? 1 : 0; rebuild(); faceMine(); if (still) { mineMat.emissiveIntensity = 0.75; mineLight.intensity = 1600; halo.material.opacity = 0.75; pose(); render(); } }

        // frame the stone: the cut face toward the viewer, seen a little from the right and above
        function size() {
          var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          var vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
          var halfW = R * 1.2, halfH = R * 1.1;
          var dist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2)) * 1.04;
          camera.position.set(dist * 0.5, dist * 0.26, dist * 0.9); camera.lookAt(-R * 0.04, -R * 0.06, -R * 0.3);
          camera.near = dist * 0.1; camera.far = dist * 4; camera.updateProjectionMatrix();
        }
        size();
        rebuild();
        engine.current = { rebuild: rebuild, grow: grow };
        try { await renderer.compileAsync(scene, camera); } catch (e) {}
        if (dead()) return;

        function render() { renderer.render(scene, camera); }
        var raf = null, last = null, visible = true, t = 0;
        var drag = false, lx = 0, dragVel = 0, yaw = 0, homeNow = home;
        function onDown(e) { if (still || e.pointerType === "touch") return; drag = true; lx = e.clientX; dragVel = 0; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
        function onMove(e) { if (!drag) return; dragVel = (e.clientX - lx) * 0.004; lx = e.clientX; yaw = Math.max(-1.1, Math.min(1.1, yaw + dragVel)); }
        function onUp() { drag = false; }
        canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp);

        function pose() {
          // a slow sway that shows the depth of the cavity, plus whatever you dragged (eases back)
          if (homeNow == null) homeNow = home;               // grow() may run before the loop state exists
          homeNow += (home - homeNow) * 0.02;                     // glide to the turn that shows your crystal
          root.rotation.y = 0.2 * Math.sin(t * 0.16) + homeNow + yaw;
          root.rotation.x = 0.05 * Math.sin(t * 0.11);
        }
        function loop(now) {
          if (!mounted) return;
          var dt = last == null ? 16 : Math.min(now - last, 50); last = now; t += dt / 1000;
          if (!drag) { yaw += dragVel; dragVel *= Math.pow(0.9, dt / 16.7); yaw *= Math.pow(0.996, dt / 16.7); }
          pose();
          if (mineIdx >= 0) {
            if (growT < 1) { growT = Math.min(1, growT + dt / 2400); placeMine(); }
            var pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
            mineMat.emissiveIntensity = (0.55 + 0.4 * pulse) * easeOut(growT);
            mineLight.intensity = (1200 + 900 * pulse) * easeOut(growT);
            halo.material.opacity = (0.55 + 0.35 * pulse) * easeOut(growT);
          }
          glints.forEach(function (g) {
            var ph = ((t + g.ph) % g.per) / g.per;                // one soft glint per 7–13 s, lasting ~0.6 s
            var a = ph < 0.06 ? Math.sin(ph / 0.06 * Math.PI) : 0;
            g.s.material.opacity = a * 0.9; g.s.scale.setScalar(3 + a * 3);
          });
          render();
          raf = requestAnimationFrame(loop);
        }
        function start() { if (raf || !visible || document.hidden || still) return; last = null; raf = requestAnimationFrame(loop); }
        function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
        t = 2.2; pose();
        if (mineIdx >= 0) { faceMine(); homeNow = home; pose(); mineMat.emissiveIntensity = 0.75; mineLight.intensity = 1600; halo.material.opacity = 0.75; }
        render();
        requestAnimationFrame(function () { canvas.style.opacity = "1"; });
        start();

        var ro = "ResizeObserver" in window ? new ResizeObserver(function () { size(); if (!raf) render(); }) : null;
        if (ro) ro.observe(el);
        var io = "IntersectionObserver" in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible) start(); else stop(); }); }) : null;
        if (io) io.observe(el);
        function onVis() { if (document.hidden) stop(); else start(); }
        document.addEventListener("visibilitychange", onVis);

        cleanup = function () {
          stop(); engine.current = null;
          if (ro) ro.disconnect(); if (io) io.disconnect();
          document.removeEventListener("visibilitychange", onVis);
          canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
          canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
          [shellGeo, cavGeo, cutGeo, shadow.geometry, crystalGeo].forEach(function (g) { g.dispose(); });
          [shellMat, cavMat, cutMat, shadow.material, gem, crustMat, mineMat, glintMat, halo.material].forEach(function (m) { m.dispose(); }); haloTex.dispose();
          glints.forEach(function (g) { g.s.material.dispose(); });
          inst.dispose(); crust.dispose(); shadowTex.dispose(); glintTex.dispose(); tex.map.dispose(); tex.rough.dispose(); envTex.dispose();
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
    crystals: { it: "CRISTALLI", en: "CRYSTALS", bg: "КРИСТАЛА" },
    full: { it: "GEODE PIENA AL", en: "GEODE FILLED", bg: "ГЕОДАТА Е ПЪЛНА НА" },
    yours: { it: "IL TUO CRISTALLO BRILLA IN CIANO", en: "YOUR CRYSTAL GLOWS CYAN", bg: "ТВОЯТ КРИСТАЛ СВЕТИ В ЦИАН" },
    forging: { it: "IL TUO CRISTALLO STA CRESCENDO...", en: "YOUR CRYSTAL IS GROWING...", bg: "ТВОЯТ КРИСТАЛ РАСТЕ..." },
    legend: { it: "I PRIMI VISITATORI HANNO I CRISTALLI PIÙ GRANDI · I NUOVI RIEMPIONO I VUOTI", en: "FIRST VISITORS GREW THE LARGEST · NEWCOMERS FILL THE GAPS", bg: "ПЪРВИТЕ ПОСЕТИТЕЛИ СА С НАЙ-ГОЛЕМИТЕ КРИСТАЛИ · НОВИТЕ ЗАПЪЛВАТ ПРАЗНИНИТЕ" }
  };
  function tt(k) { return L[k][lang] || L[k].en; }
  var fill = count != null ? Math.min(100, count / SLOTS * 100) : null;
  return (
    <div ref={host} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden",
      background: "radial-gradient(ellipse 60% 70% at 52% 46%, #1b2127 0%, #111417 55%, " + BASE + " 100%)" }}>
      <div style={{ position: "absolute", top: 12, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: "rgba(0,229,255,.85)", textShadow: "0 1px 6px rgba(0,0,0,.8)" }}>
        {count != null ? count.toLocaleString() + " " + tt("crystals") : "LOCAL PREVIEW"}
        {fill != null && <span style={{ color: "#8A949B" }}> {"·"} {tt("full")} {fill.toFixed(1)}%</span>}
      </div>
      {fill != null && <div aria-hidden="true" style={{ position: "absolute", top: 28, left: 14, width: 150, height: 2, background: "rgba(201,209,214,.14)", zIndex: 2 }}>
        <div style={{ width: fill + "%", height: "100%", background: C, boxShadow: "0 0 8px rgba(0,229,255,.6)" }} />
      </div>}
      <div style={{ position: "absolute", top: 38, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".16em", color: "#8A949B" }}>{tt("legend")}</div>
      <div aria-live="polite" style={{ position: "absolute", bottom: 12, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".2em", color: mine >= 0 ? C : "#8A949B" }}>
        {mine >= 0 ? "◆ " + tt("yours") : "◌ " + tt("forging")}
      </div>
    </div>
  );
}
