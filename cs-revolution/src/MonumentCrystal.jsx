import React, { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// THE MONUMENT — a quartz druse that grows by one crystal per visit.
//
// Data model unchanged (api/monument.php): every visit hashes its own
// behaviour (cursor, scroll, time, screen, zone) into an anonymous 12-hex
// seed; the server keeps it forever (one per IP / 12h). No personal data.
//
// What the shape now MEANS (2026-10 rewrite, was a flat 2D starburst):
//  * one visitor = one hexagonal quartz crystal growing out of a shared
//    matrix rock — the cluster is literally the sum of the visits;
//  * crystals are placed on a fixed golden spiral over the dome (1200
//    slots), in arrival order: the first visitors sit on the crown and,
//    having "grown" longest, are the biggest; newcomers sprout on the rim
//    — you can read the monument's age from its shape;
//  * the seed sets each crystal's tilt, length, girth and tint (clear,
//    smoky, faint cyan), so no two are alike and nobody's is random;
//  * your own crystal glows cyan and visibly grows in when it is forged.
//
// Rendering: three.js, InstancedMesh of faceted quartz (transmission,
// IOR 1.544, light dispersion), RoomEnvironment reflections, PBR Neutral
// tone mapping, a dark basalt-like matrix and a contact shadow. Same
// discipline as the other WebGL panels: boots only near the viewport,
// pauses off-screen, static single frame for reduced motion, full dispose.
// ═══════════════════════════════════════════════════════════════

var C = "#00e5ff";
var BASE = "#0A0C0E";
var MONO = "'Space Mono',ui-monospace,monospace";
var SLOTS = 1200;                 // API returns the last 1200 seeds
var DOME_R = 60, DOME_SQUASH = 0.46, CROWN_MAX = 1.3; // matrix rock, mm-ish units
var SPREAD = 360;                 // the first 360 crystals cover the dome; later ones ring its foot

function prefersReducedMotion() { try { return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (e) { return false; } }
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// hexagonal quartz: 6-sided prism + 6-faced pyramidal termination, flat-faceted, base at y=0, tip at y=1
function buildCrystalGeometry(THREE) {
  var pos = [], col = [], sides = 6, prismTop = 0.74;
  function v(a, r, y) { return [Math.cos(a) * r, y, Math.sin(a) * r]; }
  // real quartz is milky where it grew from the rock and water-clear toward the tip
  var BASEC = [0.88, 0.9, 0.92, 0.5], ROOTC = [1, 1, 1, 0.24], MIDC = [1, 1, 1, 0.2], TIPC = [1, 1, 1, 0.14], rootY = 0.2;
  for (var i = 0; i < sides; i++) {
    var a0 = i / sides * Math.PI * 2, a1 = (i + 1) / sides * Math.PI * 2;
    var b0 = v(a0, 1, 0), b1 = v(a1, 1, 0), r0 = v(a0, 0.99, rootY), r1 = v(a1, 0.99, rootY);
    var t0 = v(a0, 0.96, prismTop), t1 = v(a1, 0.96, prismTop), apex = [0, 1, 0];
    pos.push.apply(pos, b0.concat(r0, b1, b1, r0, r1));   // milky root
    col.push.apply(col, BASEC.concat(ROOTC, BASEC, BASEC, ROOTC, ROOTC));
    pos.push.apply(pos, r0.concat(t0, r1, r1, t0, t1));   // clear prism
    col.push.apply(col, ROOTC.concat(MIDC, ROOTC, ROOTC, MIDC, MIDC));
    pos.push.apply(pos, t0.concat(apex, t1));              // termination face
    col.push.apply(col, MIDC.concat(TIPC, MIDC));
  }
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  geo.computeVertexNormals(); // non-indexed → flat facets
  return geo;
}

// weld coincident vertices (IcosahedronGeometry is non-indexed) so the displaced dome stays closed
function mergeVerts(THREE, g) {
  var p = g.attributes.position, map = {}, verts = [], idx = [];
  for (var i = 0; i < p.count; i++) {
    var key = Math.round(p.getX(i) * 100) + "," + Math.round(p.getY(i) * 100) + "," + Math.round(p.getZ(i) * 100);
    var k = map[key]; if (k === undefined) { k = map[key] = verts.length / 3; verts.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(k);
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3)); out.setIndex(idx);
  g.dispose(); return out;
}

// matrix rock: a squashed, noise-displaced dome (deterministic noise)
function buildRock(THREE) {
  var g = new THREE.IcosahedronGeometry(DOME_R, 48);   // 20·49² ≈ 48k faces (detail is linear in three)
  g.deleteAttribute("normal"); g.deleteAttribute("uv");
  g = mergeVerts(THREE, g);                                  // shared vertices → smooth, crack-free displacement
  var p = g.attributes.position, tmp = new THREE.Vector3();
  function n3(x, y, z) { return Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2.0) * Math.cos(y * 0.13 + x * 0.05) + 0.5 * Math.sin(z * 0.23 + y * 0.17); }
  for (var i = 0; i < p.count; i++) {
    tmp.fromBufferAttribute(p, i);
    var k = 1 + 0.05 * n3(tmp.x, tmp.y, tmp.z) + 0.022 * n3(tmp.x * 2.7, tmp.y * 2.7, tmp.z * 2.7) + 0.009 * n3(tmp.x * 7.3, tmp.y * 7.3, tmp.z * 7.3);
    var y = tmp.y < 0 ? tmp.y * 0.15 : tmp.y * DOME_SQUASH;      // flat underside
    p.setXYZ(i, tmp.x * k, y * k, tmp.z * k);
  }
  // basalt-like matrix: dark, with lighter mineral veins and speckle
  var colArr = new Float32Array(p.count * 3);
  for (var c = 0; c < p.count; c++) {
    tmp.fromBufferAttribute(p, c);
    var vein = Math.pow(Math.abs(Math.sin(tmp.x * 0.09 + n3(tmp.x * 0.6, tmp.y * 0.6, tmp.z * 0.6) * 2.2)), 18);
    var speck = Math.max(0, n3(tmp.x * 9.1, tmp.y * 9.1, tmp.z * 9.1) - 1.05) * 1.6;
    var b = 0.8 + 0.25 * n3(tmp.x * 0.35, tmp.y * 0.35, tmp.z * 0.35) + vein * 2.6 + speck * 3;   // linear colour
    colArr[c * 3] = 0.032 * b; colArr[c * 3 + 1] = 0.036 * b; colArr[c * 3 + 2] = 0.042 * b;
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colArr, 3));
  g.computeVertexNormals();
  return g;
}

function makeShadowTexture(THREE) {
  var s = 256, cv = document.createElement("canvas"); cv.width = cv.height = s;
  var ctx = cv.getContext("2d"), gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, "rgba(0,0,0,.7)"); gr.addColorStop(0.5, "rgba(0,0,0,.35)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gr; ctx.fillRect(0, 0, s, s);
  var t = new THREE.CanvasTexture(cv); t.needsUpdate = true; return t;
}

// seed → crystal transform. Slot i is fixed forever, so the monument never reshuffles.
function crystalFor(THREE, seed, i, n) {
  var h1 = parseInt(seed.substring(0, 4), 16) / 0xffff, h2 = parseInt(seed.substring(4, 8), 16) / 0xffff, h3 = parseInt(seed.substring(8, 12), 16) / 0xffff;
  var GA = Math.PI * (3 - Math.sqrt(5));
  var crown = i < SPREAD ? CROWN_MAX * Math.sqrt((i + 0.5) / SPREAD) : CROWN_MAX + 0.18 * ((i - SPREAD) / (SLOTS - SPREAD)); // polar angle
  var az = i * GA + h1 * 0.4;
  var nx = Math.sin(crown) * Math.cos(az), ny = Math.cos(crown), nz = Math.sin(crown) * Math.sin(az);
  var pos = new THREE.Vector3(nx * DOME_R * 0.9, ny * DOME_R * DOME_SQUASH * 0.88, nz * DOME_R * 0.9);   // rooted in the rock
  // grow along the dome's surface normal (squash-corrected), leaning a little toward the light
  var dir = new THREE.Vector3(nx * DOME_SQUASH, ny, nz * DOME_SQUASH).normalize().add(new THREE.Vector3(0, 0.3, 0));
  dir.x += (h2 - 0.5) * 0.45; dir.z += (h3 - 0.5) * 0.45; dir.normalize();
  var age = n > 1 ? 1 - i / (n - 1) : 1;                                                  // oldest = 1
  var len = (9 + h2 * 20) * (0.7 + 0.7 * age);
  var girth = 1.5 + h3 * 2.6 * (0.8 + 0.4 * age);
  var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), h1 * Math.PI));
  var tint = h3 < 0.62 ? 0xffffff : h3 < 0.84 ? 0xe2d6c4 : 0xd2f3f8;                      // clear · smoky · faint cyan
  return { pos: pos, q: q, scale: new THREE.Vector3(girth, len, girth), tint: tint };
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
      Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]).then(async function (mods) {
        var THREE = mods[0], RoomEnvironment = mods[1].RoomEnvironment;
        if (!mounted) return;
        var mobile = window.innerWidth < 768;
        var renderer;
        try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return; }
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.NeutralToneMapping;
        renderer.toneMappingExposure = 1.05;
        var canvas = renderer.domElement;
        canvas.setAttribute("aria-hidden", "true");
        canvas.style.cssText = "display:block;width:100%;height:100%;position:absolute;inset:0;touch-action:pan-y;opacity:0;transition:opacity .8s ease";
        el.appendChild(canvas);

        var scene = new THREE.Scene();
        var pmrem = new THREE.PMREMGenerator(renderer), room = new RoomEnvironment();
        var envTex = pmrem.fromScene(room, 0.03).texture; room.dispose(); pmrem.dispose();
        scene.environment = envTex; scene.environmentIntensity = 1.0;
        var key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(120, 260, 160); scene.add(key);
        var rim = new THREE.DirectionalLight(0x9fe9ff, 1.4); rim.position.set(-180, 90, -200); scene.add(rim);
        var camera = new THREE.PerspectiveCamera(30, 1, 1, 3000);

        function dead() { if (mounted) return false; envTex.dispose(); try { renderer.forceContextLoss(); } catch (e) {} renderer.dispose(); if (el.contains(canvas)) el.removeChild(canvas); return true; }
        await tick(); if (dead()) return;

        var root = new THREE.Group(); scene.add(root);
        var rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.82, metalness: 0.1, envMapIntensity: 0.8 });
        var rock = new THREE.Mesh(buildRock(THREE), rockMat); root.add(rock);
        var shadowTex = makeShadowTexture(THREE);
        var shadow = new THREE.Mesh(new THREE.PlaneGeometry(DOME_R * 3.4, DOME_R * 3.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
        shadow.rotation.x = -Math.PI / 2; shadow.position.y = -DOME_R * 0.12; root.add(shadow);

        var crystalGeo = buildCrystalGeometry(THREE);
        // clear quartz: transparent, double-sided (the far facets show through the near ones), sharp
        // studio reflections, milky root from the vertex alpha. No transmission pass on purpose —
        // it renders identically on every GPU and costs one draw.
        var quartz = new THREE.MeshPhysicalMaterial({
          color: 0xffffff, vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false,
          metalness: 0, roughness: 0.03, ior: 1.544, specularIntensity: 1, envMapIntensity: 2.1,
          clearcoat: 0.4, clearcoatRoughness: 0.02
        });
        var inst = new THREE.InstancedMesh(crystalGeo, quartz, SLOTS);
        inst.count = 0; inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(inst);
        // the visitor's own crystal: same quartz, lit from inside
        var mineMat = quartz.clone();
        // yours: same crystal, but solid and lit from within, a touch larger — findable at a glance
        mineMat.vertexColors = false; mineMat.opacity = 0.92; mineMat.color = new THREE.Color(0xbff7ff);
        mineMat.emissive = new THREE.Color(C); mineMat.emissiveIntensity = 0.0; mineMat.depthWrite = true;
        var mineMesh = new THREE.Mesh(crystalGeo, mineMat); mineMesh.visible = false; root.add(mineMesh);
        var mineLight = new THREE.PointLight(0x5ff0ff, 0, 140, 1.6); root.add(mineLight);

        var m4 = new THREE.Matrix4(), col = new THREE.Color();
        var mineIdx = mineRef.current, growT = still ? 1 : 0, crystals = [];
        var rotY = 0.4;                                     // druse rotation (auto-spin + drag)
        function rebuild() {
          var seeds = seedsRef.current, n = Math.min(seeds.length, SLOTS);
          crystals = [];
          var k = 0;
          for (var i = 0; i < n; i++) {
            var c = crystalFor(THREE, seeds[i], i, n); crystals.push(c);
            if (i === mineIdx) continue;
            m4.compose(c.pos, c.q, c.scale); inst.setMatrixAt(k, m4);
            inst.setColorAt(k, col.setHex(c.tint)); k++;
          }
          inst.count = k; inst.instanceMatrix.needsUpdate = true; if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
          placeMine();
        }
        function placeMine() {
          if (mineIdx < 0 || !crystals[mineIdx]) { mineMesh.visible = false; mineLight.intensity = 0; return; }
          var c = crystals[mineIdx], s = easeOut(growT);
          mineMesh.position.copy(c.pos); mineMesh.quaternion.copy(c.q);
          mineMesh.scale.set(c.scale.x * 1.2 * Math.max(0.05, s), c.scale.y * 1.2 * Math.max(0.02, s), c.scale.z * 1.2 * Math.max(0.05, s));
          mineMesh.visible = true;
          var tip = new THREE.Vector3(0, c.scale.y * 0.55 * s, 0).applyQuaternion(c.q).add(c.pos); mineLight.position.copy(tip);
        }
        function easeOut(t) { return 1 - Math.pow(1 - Math.min(1, t), 3); }
        var turnTo = null;                                   // rotation that faces your crystal to the camera
        function faceMine() {
          if (mineIdx < 0 || !crystals[mineIdx]) return;
          var c = crystals[mineIdx], a = Math.atan2(c.pos.x, c.pos.z);
          var target = -a; while (target - rotY > Math.PI) target -= 2 * Math.PI; while (target - rotY < -Math.PI) target += 2 * Math.PI;
          turnTo = target;
        }
        function grow(idx) { mineIdx = idx; growT = still ? 1 : 0; rebuild(); faceMine(); if (still) { rotY = turnTo; root.rotation.y = rotY; render(); } }

        // frame the druse (fits wide desktop panels and square phones)
        function size() {
          var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          var vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
          var halfW = DOME_R * 1.38, halfH = DOME_R * 0.98;     // tallest crown crystals reach ~1.1R
          var dist = Math.max(halfW / Math.tan(hFov / 2), halfH / Math.tan(vFov / 2)) * 1.05;
          camera.position.set(0, dist * 0.36, dist); camera.lookAt(0, DOME_R * 0.4, 0);
          camera.near = dist * 0.1; camera.far = dist * 4; camera.updateProjectionMatrix();
        }
        size();
        rebuild();
        if (mineIdx >= 0) { faceMine(); if (turnTo != null) { rotY = turnTo; turnTo = null; } }
        engine.current = { rebuild: rebuild, grow: grow };
        try { await renderer.compileAsync(scene, camera); } catch (e) {}
        if (dead()) return;

        function render() { renderer.render(scene, camera); }
        var raf = null, last = null, visible = true;
        var drag = false, lx = 0, dragVel = 0;
        function onDown(e) { if (still || e.pointerType === "touch") return; drag = true; lx = e.clientX; dragVel = 0; try { canvas.setPointerCapture(e.pointerId); } catch (err) {} }
        function onMove(e) { if (!drag) return; dragVel = (e.clientX - lx) * 0.004; lx = e.clientX; rotY += dragVel; }
        function onUp() { drag = false; }
        canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove);
        canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp);

        function loop(now) {
          if (!mounted) return;
          var dt = last == null ? 16 : Math.min(now - last, 50); last = now;
          if (!drag && turnTo != null) { var dlt = turnTo - rotY; rotY += dlt * Math.min(1, dt / 420); if (Math.abs(dlt) < 0.002) turnTo = null; }
          else if (!drag) { rotY += 0.06 * dt / 1000 + dragVel; dragVel *= Math.pow(0.92, dt / 16.7); }
          root.rotation.y = rotY;
          if (mineIdx >= 0) {
            if (growT < 1) { growT = Math.min(1, growT + dt / 2200); placeMine(); }
            var pulse = 0.55 + 0.45 * Math.sin(now * 0.0025);
            mineMat.emissiveIntensity = (0.7 + 0.9 * pulse) * easeOut(growT);
            mineLight.intensity = (400 + 900 * pulse) * easeOut(growT);
          }
          render();
          raf = requestAnimationFrame(loop);
        }
        function start() { if (raf || !visible || document.hidden || still) return; last = null; raf = requestAnimationFrame(loop); }
        function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }
        root.rotation.y = rotY;
        if (mineIdx >= 0) { mineMat.emissiveIntensity = 1.2; mineLight.intensity = 900; }
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
          [rock.geometry, shadow.geometry, crystalGeo].forEach(function (g) { g.dispose(); });
          [rockMat, shadow.material, quartz, mineMat].forEach(function (m) { m.dispose(); });
          inst.dispose(); shadowTex.dispose(); envTex.dispose();
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
    yours: { it: "IL TUO CRISTALLO BRILLA IN CIANO", en: "YOUR CRYSTAL GLOWS CYAN", bg: "ТВОЯТ КРИСТАЛ СВЕТИ В ЦИАН" },
    forging: { it: "IL TUO CRISTALLO STA CRESCENDO...", en: "YOUR CRYSTAL IS GROWING...", bg: "ТВОЯТ КРИСТАЛ РАСТЕ..." },
    legend: { it: "AL CENTRO I PRIMI VISITATORI · SUL BORDO I PIÙ RECENTI", en: "FIRST VISITORS AT THE CROWN · NEWEST ON THE RIM", bg: "ПЪРВИТЕ ПОСЕТИТЕЛИ В ЦЕНТЪРА · НОВИТЕ ПО КРАЯ" }
  };
  function tt(k) { return L[k][lang] || L[k].en; }
  return (
    <div ref={host} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden",
      background: "radial-gradient(ellipse 70% 75% at 50% 42%, #22272c 0%, #14171a 50%, " + BASE + " 100%)" }}>
      <div style={{ position: "absolute", top: 12, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", color: "rgba(0,229,255,.8)", textShadow: "0 1px 6px rgba(0,0,0,.8)" }}>
        {count != null ? count.toLocaleString() + " " + tt("crystals") : "LOCAL PREVIEW"}
      </div>
      <div style={{ position: "absolute", top: 30, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".16em", color: "#8A949B" }}>{tt("legend")}</div>
      <div aria-live="polite" style={{ position: "absolute", bottom: 12, left: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".2em", color: mine >= 0 ? C : "#8A949B" }}>
        {mine >= 0 ? "◆ " + tt("yours") : "◌ " + tt("forging")}
      </div>
    </div>
  );
}
