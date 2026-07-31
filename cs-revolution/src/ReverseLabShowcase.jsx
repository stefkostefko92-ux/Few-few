import React, { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// REVERSE LAB SHOWCASE — a real (procedural) 3D reverse-engineering
// pipeline for a front hugger (120/70-ZR17, wrap R=308mm, 68° sweep,
// arc ≈365mm): SCAN → MESH → SURFACE → SOLID/CARBON, auto-cycling,
// with 4 real DOM tab buttons for manual control.
//
// IMPORTANT — HUD integrity: every number on screen (1.24M pts,
// σ=0.05mm, patch counts, deviation, etc.) is a DEMONSTRATION label
// that visualizes the *shape* of a reverse-engineering process. It is
// not a measured result for any real client part. Do not repurpose
// these strings as factual claims.
//
// Model copied 1:1 from HeroSignature.jsx: dynamic import("three"),
// staticFrame gate (prefers-reduced-motion OR low-power — see note
// below), dual IntersectionObserver + visibilitychange rAF pause,
// DPR ceiling 1.5 mobile / 2 desktop, forceContextLoss()+dispose
// cleanup, radial-gradient poster fallback, canvas fade-in,
// aria-hidden canvas. Tokens duplicated here on purpose (own module,
// no shared export) — keep in sync with App.jsx / HeroSignature.jsx
// if the "Tolerance" palette ever changes.
//
// Reduced-motion decision (confidence: high, matches HeroSignature's
// existing convention in this repo): staticFrame fires on
// prefers-reduced-motion **OR** low-power, not only on both together.
// WCAG 2.3.3 treats reduced-motion as an independent, iron gate —
// a low-power device is a *separate*, additional reason to also
// freeze, not a required co-condition. In the static branch we still
// build all 4 stages (cheap: geometry only, no rAF) and let the tab
// buttons do a single, un-animated renderer.render() swap on click —
// zero rAF loop is honored literally, while the manual affordance
// stays truthful for keyboard/AT users (WCAG reduced-motion targets
// *automatic* motion; a direct user click is not that).
//
// Geometry constraints (verified while building this file, see
// scratch geometry check, three@0.170.0 in this repo's node_modules):
// curve.computeFrenetFrames(segments, closed) returns
// {tangents, normals, binormals} sampled at u = i/segments — CORE
// three, no examples/jsm. For this specific planar spine (all 5
// control points share z=0), the returned `normals` array is exactly
// constant (0,0,-1) at every station (no torsion) and `binormals`
// carries the in-plane, rotating component. The loft below relies on
// that (verified numerically, not assumed) to put the wide axis
// (fender width, ~144mm across incl. lips) on the stable `normals`
// direction and the shallow sag (~9mm) on the rotating `binormals`
// direction — the physically sensible assignment for a part that
// wraps a wheel along one fixed (axle-like) direction.
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

// ── HUD copy per stage — demonstration labels, see integrity note above ──
var STAGES = [
  {
    key: "scan", label: "SCAN",
    hud: ["SCAN PASS 03/03 · 1.24M PTS (RAW) · 18,000 PTS (DISPLAY)", "σ=0.05mm · SENSOR: LASER 0.05mm CLASS", "3 OUTLIERS FLAGGED"]
  },
  {
    key: "mesh", label: "MESH",
    hud: ["MESH: 96,400 → 12,600 TRIS (DECIMATED)", "HOLES FILLED: 4 · WATERTIGHT: PENDING"]
  },
  {
    key: "surface", label: "SURFACE",
    hud: ["SURFACE: 11 PATCHES · CONTINUITY G2", "DEVIATION vs SCAN: ±0.06mm (σ) · CLASS-A: PASS"]
  },
  {
    key: "solid", label: "SOLID",
    hud: ["SOLID: WATERTIGHT ✓ · MANIFOLD ✓", "PLY: 8× 0.3mm TWILL (2.4mm) · READY: STEP/IGES"]
  }
];

// ── Part geometry constants (front hugger, 120/70-ZR17, OD≈600mm) ──
var SPINE_R = 308;                       // wrap radius, mm
var SPINE_HALF_ANGLE = 34 * Math.PI / 180; // ±34° = 68° sweep, arc ≈365mm
var LIP_LEN = 9;                         // edge lip length, mm
var LIP_ANGLE = 20 * Math.PI / 180;      // edge lip angle
var ARCH_DEPTH = 9;                      // shallow cross-section sag, mm
var HALF_WIDTH = 64;                     // ~128mm width / 2
var TAPER_FROM = 1.0, TAPER_TO = 0.85;   // width taper along length

// ═══════════ geometry builders (core three only) ═══════════

function buildSpineCurve(THREE) {
  var pts = [], n = 5;
  for (var i = 0; i < n; i++) {
    var t = i / (n - 1);
    var ang = -SPINE_HALF_ANGLE + t * (2 * SPINE_HALF_ANGLE);
    pts.push(new THREE.Vector3(SPINE_R * Math.sin(ang), SPINE_R * (1 - Math.cos(ang)), 0));
  }
  return new THREE.CatmullRomCurve3(pts, false, "centripetal", 0.5);
}

// Fixed 2D cross-section profile: shallow arc (~128mm) + a rolled flare
// lip (9mm / ~20°) at each edge. Returned as {u,v} pairs, u = across
// width, v = depth (small, along the "sag" axis).
function buildProfile(count) {
  var archN = count - 2;
  var arc = [];
  for (var i = 0; i < archN; i++) {
    var t = archN > 1 ? i / (archN - 1) : 0.5;
    var u = -HALF_WIDTH + t * 2 * HALF_WIDTH;
    var v = -ARCH_DEPTH * (1 - Math.pow(u / HALF_WIDTH, 2));
    arc.push({ u: u, v: v });
  }
  var left = arc[0], right = arc[arc.length - 1];
  var lipL = { u: left.u - LIP_LEN * Math.cos(LIP_ANGLE), v: left.v + LIP_LEN * Math.sin(LIP_ANGLE) };
  var lipR = { u: right.u + LIP_LEN * Math.cos(LIP_ANGLE), v: right.v + LIP_LEN * Math.sin(LIP_ANGLE) };
  return [lipL].concat(arc).concat([lipR]);
}

// Loft: sweep the profile along the spine using Frenet frames, taper
// width TAPER_FROM→TAPER_TO, weld an indexed BufferGeometry. Leading
// (station 0) end fan-closed; trailing end left open, per spec.
function buildLoft(THREE, curve, stations, profileCount) {
  var profile = buildProfile(profileCount);
  var frames = curve.computeFrenetFrames(stations, false);
  var rows = stations + 1, cols = profile.length;
  var positions = new Float32Array(rows * cols * 3);
  var uvs = new Float32Array(rows * cols * 2);
  for (var i = 0; i < rows; i++) {
    var u = i / stations;
    var P = curve.getPointAt(u);
    var N = frames.normals[i], B = frames.binormals[i];
    var taper = TAPER_FROM + (TAPER_TO - TAPER_FROM) * u;
    for (var j = 0; j < cols; j++) {
      var pr = profile[j];
      var idx = i * cols + j;
      positions[idx * 3] = P.x + N.x * pr.u * taper + B.x * pr.v;
      positions[idx * 3 + 1] = P.y + N.y * pr.u * taper + B.y * pr.v;
      positions[idx * 3 + 2] = P.z + N.z * pr.u * taper + B.z * pr.v;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = j / (cols - 1);
    }
  }
  var indices = [];
  for (var r = 0; r < rows - 1; r++) {
    for (var c = 0; c < cols - 1; c++) {
      var a = r * cols + c, b = r * cols + c + 1, cc = (r + 1) * cols + c, d = (r + 1) * cols + c + 1;
      indices.push(a, cc, b, b, cc, d);
    }
  }
  // leading-edge fan cap (station 0 only — trailing end stays open)
  var posArr = Array.from(positions), uvArr = Array.from(uvs);
  var cx = 0, cy = 0, cz = 0;
  for (var j2 = 0; j2 < cols; j2++) { cx += positions[j2 * 3]; cy += positions[j2 * 3 + 1]; cz += positions[j2 * 3 + 2]; }
  cx /= cols; cy /= cols; cz /= cols;
  var capIdx = rows * cols;
  posArr.push(cx, cy, cz); uvArr.push(0, 0.5);
  for (var j3 = 0; j3 < cols - 1; j3++) indices.push(capIdx, j3, j3 + 1);

  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  return { geometry: geo, rows: rows, cols: cols };
}

// Frame at an arbitrary continuous u — valid simplification for THIS
// spine only (planar, torsion-free: normals are numerically constant
// (0,0,-1) at every sampled station, verified above / in dev).
function frameAt(THREE, curve, u) {
  var T = curve.getTangentAt(Math.max(0.0001, Math.min(0.9999, u)));
  var N = new THREE.Vector3(0, 0, -1);
  var B = new THREE.Vector3().crossVectors(T, N).normalize();
  return { P: curve.getPointAt(u), T: T, N: N, B: B };
}

// Tabs: 2 front (30×24×4mm, Ø6.5, ~80mm centre-to-centre) near the
// leading (capped) edge + 1 rear stay tab (25×20×4mm, Ø6.5) near the
// open trailing edge. Boxes + a dark inset cylinder standing in for
// the hole (visual only, no boolean/CSG per spec).
function buildTabsGroup(THREE, curve) {
  var grp = new THREE.Group();
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 0.55, metalness: 0.08 });
  var holeMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.95 });
  function placeTab(u, widthOffset, lengthMM, widthMM, thickMM, holeR) {
    var f = frameAt(THREE, curve, u);
    var sag = -ARCH_DEPTH * (1 - Math.pow(widthOffset / HALF_WIDTH, 2));
    var center = f.P.clone()
      .add(f.N.clone().multiplyScalar(widthOffset))
      .add(f.B.clone().multiplyScalar(sag - thickMM * 0.6));
    var basis = new THREE.Matrix4().makeBasis(f.T, f.N, f.B);
    var box = new THREE.Mesh(new THREE.BoxGeometry(lengthMM, widthMM, thickMM), bodyMat);
    box.position.copy(center);
    box.setRotationFromMatrix(basis);
    grp.add(box);
    var holeBasis = new THREE.Matrix4().makeBasis(f.T, f.B, f.N);
    var hole = new THREE.Mesh(new THREE.CylinderGeometry(holeR, holeR, thickMM * 1.8, 14), holeMat);
    hole.position.copy(center);
    hole.setRotationFromMatrix(holeBasis);
    grp.add(hole);
  }
  placeTab(0.05, 40, 30, 24, 4, 3.25);
  placeTab(0.05, -40, 30, 24, 4, 3.25);
  placeTab(0.95, 0, 25, 20, 4, 3.25);
  return grp;
}

// ── Area-weighted point sampling (manual — no MeshSurfaceSampler) ──
// Cumulative triangle-area CDF + binary search selection, barycentric
// point via sqrt method, jitter along the normal (Box-Muller Gaussian)
// + light tangential jitter. 2-3 points get a much larger offset and
// are flagged (cyan) as scan outliers.
function samplePointCloud(THREE, geometry, count, sigma, outlierCount) {
  var posAttr = geometry.attributes.position;
  var normAttr = geometry.attributes.normal;
  var idx = geometry.index.array;
  var triCount = idx.length / 3;
  var cum = new Float64Array(triCount);
  var total = 0;
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  var ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
  for (var t = 0; t < triCount; t++) {
    a.fromBufferAttribute(posAttr, idx[t * 3]);
    b.fromBufferAttribute(posAttr, idx[t * 3 + 1]);
    c.fromBufferAttribute(posAttr, idx[t * 3 + 2]);
    ab.subVectors(b, a); ac.subVectors(c, a);
    cr.crossVectors(ab, ac);
    total += 0.5 * cr.length();
    cum[t] = total;
  }
  function pickTri() {
    var r = Math.random() * total;
    var lo = 0, hi = triCount - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    return lo;
  }
  var positions = new Float32Array(count * 3);
  var colors = new Float32Array(count * 3);
  var inkCol = new THREE.Color(INK), cyanCol = new THREE.Color(C);
  var outlierSet = {};
  for (var o = 0; o < outlierCount; o++) outlierSet[Math.floor(Math.random() * count)] = true;
  var na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3(), nrm = new THREE.Vector3();
  var tmpAxis = new THREE.Vector3(), tang = new THREE.Vector3();
  for (var i = 0; i < count; i++) {
    var tri = pickTri();
    a.fromBufferAttribute(posAttr, idx[tri * 3]);
    b.fromBufferAttribute(posAttr, idx[tri * 3 + 1]);
    c.fromBufferAttribute(posAttr, idx[tri * 3 + 2]);
    var r1 = Math.random(), r2 = Math.random();
    var sr1 = Math.sqrt(r1);
    var w0 = 1 - sr1, w1 = sr1 * (1 - r2), w2 = sr1 * r2;
    var px = a.x * w0 + b.x * w1 + c.x * w2;
    var py = a.y * w0 + b.y * w1 + c.y * w2;
    var pz = a.z * w0 + b.z * w1 + c.z * w2;
    if (normAttr) {
      na.fromBufferAttribute(normAttr, idx[tri * 3]);
      nb.fromBufferAttribute(normAttr, idx[tri * 3 + 1]);
      nc.fromBufferAttribute(normAttr, idx[tri * 3 + 2]);
      nrm.set(na.x * w0 + nb.x * w1 + nc.x * w2, na.y * w0 + nb.y * w1 + nc.y * w2, na.z * w0 + nb.z * w1 + nc.z * w2).normalize();
    } else {
      nrm.crossVectors(ab, ac).normalize();
    }
    var isOutlier = !!outlierSet[i];
    var g1 = Math.random(), g2 = Math.random();
    var gauss = Math.sqrt(-2 * Math.log(Math.max(g1, 1e-6))) * Math.cos(2 * Math.PI * g2);
    var jitterN = gauss * sigma * (isOutlier ? 9 : 1);
    tmpAxis.set(Math.abs(nrm.y) < 0.99 ? 0 : 1, Math.abs(nrm.y) < 0.99 ? 1 : 0, 0);
    tang.crossVectors(nrm, tmpAxis).normalize();
    var tanJitter = (Math.random() - 0.5) * sigma * 0.7;
    px += nrm.x * jitterN + tang.x * tanJitter;
    py += nrm.y * jitterN + tang.y * tanJitter;
    pz += nrm.z * jitterN + tang.z * tanJitter;
    positions[i * 3] = px; positions[i * 3 + 1] = py; positions[i * 3 + 2] = pz;
    var col = isOutlier ? cyanCol : inkCol;
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  // sort by X (the part's length axis) so a growing drawRange reads as
  // a laser pass sweeping along the part, not a random pop-in
  var order = [];
  for (var k = 0; k < count; k++) order.push(k);
  order.sort(function (p, q) { return positions[p * 3] - positions[q * 3]; });
  var sp = new Float32Array(count * 3), sc = new Float32Array(count * 3);
  for (var m = 0; m < count; m++) {
    sp[m * 3] = positions[order[m] * 3]; sp[m * 3 + 1] = positions[order[m] * 3 + 1]; sp[m * 3 + 2] = positions[order[m] * 3 + 2];
    sc[m * 3] = colors[order[m] * 3]; sc[m * 3 + 1] = colors[order[m] * 3 + 1]; sc[m * 3 + 2] = colors[order[m] * 3 + 2];
  }
  return { positions: sp, colors: sc };
}

// ── canvas-generated textures (no CDN, no STL, per spec) ──
function makeDotSpriteTexture(THREE) {
  var size = 64;
  var cv = document.createElement("canvas"); cv.width = cv.height = size;
  var ctx = cv.getContext("2d");
  var g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(255,255,255,.5)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
  var tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

function makeTwillTexture(THREE) {
  var size = 32;
  var cv = document.createElement("canvas"); cv.width = cv.height = size;
  var ctx = cv.getContext("2d");
  ctx.fillStyle = "#0C0D0F"; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#14161A";
  var cell = size / 2;
  for (var y = 0; y < 2; y++) for (var x = 0; x < 2; x++) { if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell); }
  ctx.strokeStyle = "rgba(0,0,0,.3)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-size / 2, size / 2); ctx.lineTo(size / 2, -size / 2); ctx.stroke();
  var tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 8);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// isocurve overlay (stage C) — real U/V lines pulled from the fine
// loft's own grid, not decorative geometry
function buildIsocurves(THREE, geometry, rows, cols) {
  var pos = geometry.attributes.position.array;
  var lines = new THREE.Group();
  var mat = new THREE.LineBasicMaterial({ color: new THREE.Color(INK2), transparent: true, opacity: 0.4 });
  var rowStep = Math.max(1, Math.round(rows / 9));
  var colStep = Math.max(1, Math.round(cols / 5));
  for (var r = 0; r < rows; r += rowStep) {
    var pts = [];
    for (var c = 0; c < cols; c++) { var i = (r * cols + c) * 3; pts.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2])); }
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }
  for (var c2 = 0; c2 < cols; c2 += colStep) {
    var pts2 = [];
    for (var r2 = 0; r2 < rows; r2++) { var i2 = (r2 * cols + c2) * 3; pts2.push(new THREE.Vector3(pos[i2], pos[i2 + 1], pos[i2 + 2])); }
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), mat));
  }
  return lines;
}

// control-cage wireframe (stage C) — the coarse loft, nudged out along
// its own vertex normals so it reads as a cage floating just above the
// smooth surface, not coincident with it
function buildControlCage(THREE, coarseGeo) {
  var src = coarseGeo.clone();
  var pos = src.attributes.position, nrm = src.attributes.normal;
  for (var i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * 2.2, pos.getY(i) + nrm.getY(i) * 2.2, pos.getZ(i) + nrm.getZ(i) * 2.2);
  }
  var wire = new THREE.WireframeGeometry(src);
  var mat = new THREE.LineBasicMaterial({ color: new THREE.Color(C), transparent: true, opacity: 0.14 });
  var seg = new THREE.LineSegments(wire, mat);
  src.dispose();
  return seg;
}

function disposeObject3D(obj) {
  obj.traverse(function (child) {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      var mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(function (m) {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    }
  });
}

// ═══════════ React component ═══════════

export default function ReverseLabShowcase() {
  var host = useRef(null);
  var engineRef = useRef(null);
  var [activeStep, setActiveStep] = useState(0);
  var [hud, setHud] = useState(STAGES[0].hud);
  var [ready, setReady] = useState(false);

  useEffect(function () {
    var el = host.current;
    if (!el) return;

    var staticFrame = prefersReducedMotion() || isLowPower();
    var mounted = true;
    var cleanup = null;

    import("three").then(function (THREE) {
      if (!mounted || !el) return;

      var isMobile = window.innerWidth < 768;
      var FINE_STATIONS = isMobile ? 24 : 48, FINE_PROFILE = isMobile ? 9 : 13;
      var COARSE_STATIONS = isMobile ? 8 : 12, COARSE_PROFILE = isMobile ? 5 : 7;
      var POINT_COUNT = isMobile ? 3000 : 9000;
      var OUTLIER_COUNT = isMobile ? 2 : 3;

      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: false, powerPreference: "low-power" });
      } catch (e) {
        return; // no WebGL — the radial-gradient poster stays as the visible layer
      }
      renderer.localClippingEnabled = true;
      renderer.setClearColor(new THREE.Color(BASE), 1);

      var canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      canvas.tabIndex = -1;
      canvas.style.display = "block";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.style.position = "absolute";
      canvas.style.inset = "0";
      canvas.style.touchAction = "pan-y"; // touch = page scroll, never orbit-drag hijack
      canvas.style.opacity = "0";
      canvas.style.transition = "opacity .7s " + EASE;
      el.appendChild(canvas);

      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(38, 1, 1, 3000);
      camera.position.set(50, 230, 760); // generous margin around the ~360x230x145mm part
      camera.lookAt(0, 15, 0);

      // ── lights: simple 3-point rig (used by stage C matte + stage D physical) ──
      scene.add(new THREE.AmbientLight(0xffffff, 0.35));
      var key = new THREE.DirectionalLight(0xffffff, 1.1); key.position.set(260, 320, 220); scene.add(key);
      var fill = new THREE.DirectionalLight(0xaee6ff, 0.35); fill.position.set(-300, 120, 160); scene.add(fill);
      var rim = new THREE.DirectionalLight(0x66d9ef, 0.5); rim.position.set(-60, 80, -320); scene.add(rim);

      var root = new THREE.Group(); // auto-rotate + drag orbit
      var model = new THREE.Group(); // centered part
      root.add(model);
      scene.add(root);

      // ── build geometry ──
      var curve = buildSpineCurve(THREE);
      var fine = buildLoft(THREE, curve, FINE_STATIONS, FINE_PROFILE);
      var coarse = buildLoft(THREE, curve, COARSE_STATIONS, COARSE_PROFILE);

      var bbox = fine.geometry.boundingBox;
      var center = bbox.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -center.y, -center.z);
      var xMin = bbox.min.x - 8, xMax = bbox.max.x + 8;

      var dotTex = makeDotSpriteTexture(THREE);
      var twillTex = makeTwillTexture(THREE);

      // shared reveal/erase planes, one pair per stage (never re-assigned
      // to a different array — avoids per-toggle shader recompiles)
      function makePlane() { return new THREE.Plane(new THREE.Vector3(-1, 0, 0), -1e6); }

      // ---- Stage A: SCAN — point cloud ----
      var sampled = samplePointCloud(THREE, fine.geometry, POINT_COUNT, 0.55, OUTLIER_COUNT);
      var ptsGeo = new THREE.BufferGeometry();
      ptsGeo.setAttribute("position", new THREE.Float32BufferAttribute(sampled.positions, 3));
      ptsGeo.setAttribute("color", new THREE.Float32BufferAttribute(sampled.colors, 3));
      ptsGeo.setDrawRange(0, 0);
      var planeA = makePlane();
      var ptsMat = new THREE.PointsMaterial({
        map: dotTex, size: isMobile ? 3.4 : 2.6, vertexColors: true, transparent: true,
        opacity: 0.85, depthWrite: false, sizeAttenuation: true, alphaTest: 0.02,
        clippingPlanes: [planeA]
      });
      var points = new THREE.Points(ptsGeo, ptsMat);
      var groupA = new THREE.Group(); groupA.add(points); groupA.userData.plane = planeA;
      groupA.userData.materials = [ptsMat];
      groupA.userData.pointsGeo = ptsGeo; groupA.userData.pointsTotal = POINT_COUNT;

      // ---- Stage B: MESH — coarse, flat-shaded + cyan edges ----
      var planeB = makePlane();
      var meshBMat = new THREE.MeshStandardMaterial({ color: 0x1a1d20, flatShading: true, roughness: 1, metalness: 0, clippingPlanes: [planeB], transparent: true, side: THREE.DoubleSide });
      var meshB = new THREE.Mesh(coarse.geometry, meshBMat);
      var edgesGeo = new THREE.EdgesGeometry(coarse.geometry, 1);
      var edgesMat = new THREE.LineBasicMaterial({ color: new THREE.Color(C), transparent: true, opacity: 0.3, clippingPlanes: [planeB] });
      var edges = new THREE.LineSegments(edgesGeo, edgesMat);
      var groupB = new THREE.Group(); groupB.add(meshB); groupB.add(edges); groupB.userData.plane = planeB;
      groupB.userData.materials = [meshBMat, edgesMat];

      // ---- Stage C: SURFACE — fine, smooth, matte + isocurves + cage ----
      var planeC = makePlane();
      var meshCMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(INK).multiplyScalar(0.42), roughness: 0.85, metalness: 0.02, clippingPlanes: [planeC], transparent: true, side: THREE.DoubleSide });
      var meshC = new THREE.Mesh(fine.geometry, meshCMat);
      var isocurves = buildIsocurves(THREE, fine.geometry, fine.rows, fine.cols);
      isocurves.children.forEach(function (l) { l.material.clippingPlanes = [planeC]; });
      var cage = buildControlCage(THREE, coarse.geometry);
      cage.material.clippingPlanes = [planeC];
      var groupC = new THREE.Group(); groupC.add(meshC); groupC.add(isocurves); groupC.add(cage); groupC.userData.plane = planeC;
      groupC.userData.materials = [meshCMat].concat(isocurves.children.map(function (l) { return l.material; })).concat([cage.material]);

      // ---- Stage D: SOLID/CARBON — fine + tabs, physical material, fresnel rim ----
      var planeD = makePlane();
      var carbonMat = new THREE.MeshPhysicalMaterial({
        map: twillTex, color: 0xffffff, roughness: 0.35, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25,
        clippingPlanes: [planeD], transparent: true, side: THREE.DoubleSide
      });
      carbonMat.onBeforeCompile = function (shader) {
        shader.uniforms.uRim = { value: new THREE.Color(C) };
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", "uniform vec3 uRim;\nvoid main() {")
          .replace("#include <dithering_fragment>",
            "float _fres = pow(1.0 - clamp(abs(dot(normalize(vNormal), normalize(vViewPosition))), 0.0, 1.0), 3.2);\n\
gl_FragColor.rgb += uRim * _fres * 0.5;\n\
#include <dithering_fragment>");
      };
      var meshD = new THREE.Mesh(fine.geometry, carbonMat);
      var tabsGroup = buildTabsGroup(THREE, curve);
      tabsGroup.traverse(function (o) { if (o.material) { o.material.clippingPlanes = [planeD]; o.material.transparent = true; } });
      var groupD = new THREE.Group(); groupD.add(meshD); groupD.add(tabsGroup); groupD.userData.plane = planeD;
      groupD.userData.materials = [carbonMat].concat(tabsGroup.children.map(function (o) { return o.material; }));

      var groups = [groupA, groupB, groupC, groupD];
      groups.forEach(function (g) { model.add(g); g.visible = false; });

      // Scale each material by ITS design opacity, not a flat 1.0 — otherwise the
      // rare-accent cyan (cage .14, edges .3) and isocurves (.4) burn to full
      // brightness at rest. baseOpacity is captured lazily on first call, before
      // any crossfade touches the group, so it reads the design value.
      function setGroupOpacity(g, v) { g.userData.materials.forEach(function (m) { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity; m.opacity = m.userData.baseOpacity * v; }); }
      function showGroupFull(g) { g.visible = true; g.userData.plane.normal.set(-1, 0, 0); g.userData.plane.constant = 1e6; setGroupOpacity(g, 1); }
      function hideGroup(g) { g.userData.plane.constant = -1e6; setGroupOpacity(g, 0); g.visible = false; }

      // start on stage A, hidden pending its own reveal animation
      groups.forEach(hideGroup);
      showGroupFull(groupA); // points themselves still draw nothing: drawRange starts at 0

      // ═══ pipeline timeline (rAF-driven; pausing rAF pauses the whole thing) ═══
      var FORM_A = 2500, HOLD_A_REST = 2000, HOLD_B = 2500, HOLD_C = 3000, HOLD_D = 4500, WIPE_MS = 900;
      var STAGE_HOLD = [FORM_A + HOLD_A_REST, HOLD_B, HOLD_C, HOLD_D];
      var mode = "hold", stageIdx = 0, wipeFrom = 0, wipeTo = 0, phaseElapsed = 0, manualHoldFloor = 0, pendingHoldFloor = 0;

      function setPointsReveal(t) {
        groupA.userData.pointsGeo.setDrawRange(0, Math.round(groupA.userData.pointsTotal * t));
      }

      function applyWipe(fromIdx, toIdx, e) {
        var wipeX = xMin + (xMax - xMin) * e;
        var to = groups[toIdx], from = groups[fromIdx];
        to.visible = true; from.visible = true;
        to.userData.plane.normal.set(-1, 0, 0); to.userData.plane.constant = wipeX;
        from.userData.plane.normal.set(1, 0, 0); from.userData.plane.constant = -wipeX;
        setGroupOpacity(to, e); setGroupOpacity(from, 1 - e);
      }

      function startWipe(fromIdx, toIdx) {
        mode = "wipe"; phaseElapsed = 0; wipeFrom = fromIdx; wipeTo = toIdx;
        // stage A's point cloud must draw nothing for the whole wipe-in —
        // its own "form" growth (drawRange 0→full) only starts once the
        // wipe has fully landed and the hold phase begins (sequential,
        // not overlapping, per spec: wipe THEN form THEN hold).
        if (toIdx === 0) setPointsReveal(0);
        applyWipe(fromIdx, toIdx, 0);
      }

      function onStageChange(idx) {
        stageIdx = idx;
        setActiveStep(idx);
        setHud(STAGES[idx].hud);
      }

      function finishWipe(fromIdx, toIdx) {
        hideGroup(groups[fromIdx]);
        showGroupFull(groups[toIdx]);
        mode = "hold"; phaseElapsed = 0;
        manualHoldFloor = pendingHoldFloor; pendingHoldFloor = 0;
        onStageChange(toIdx);
      }

      function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

      function advanceTimeline(dt) {
        phaseElapsed += dt;
        if (mode === "hold") {
          if (stageIdx === 0) setPointsReveal(Math.min(phaseElapsed / FORM_A, 1));
          var holdTarget = Math.max(STAGE_HOLD[stageIdx], manualHoldFloor);
          if (phaseElapsed >= holdTarget) startWipe(stageIdx, (stageIdx + 1) % 4);
        } else {
          var t = Math.min(phaseElapsed / WIPE_MS, 1);
          applyWipe(wipeFrom, wipeTo, easeInOutCubic(t));
          if (t >= 1) finishWipe(wipeFrom, wipeTo);
        }
      }

      // manual tab click: direct wipe to target stage, then hold >=6s idle
      function gotoStage(targetIdx) {
        if (staticFrame) { snapToStage(targetIdx); return; }
        if (mode === "wipe") finishWipe(wipeFrom, wipeTo); // snap in-flight transition first
        if (targetIdx === stageIdx) { manualHoldFloor = phaseElapsed + 6000; return; }
        pendingHoldFloor = 6000; // applied to manualHoldFloor once this wipe lands (see finishWipe)
        startWipe(stageIdx, targetIdx);
      }

      // reduced-motion / low-power path: one-shot, no animation, no rAF
      function snapToStage(targetIdx) {
        groups.forEach(function (g, i) { if (i === targetIdx) showGroupFull(g); else hideGroup(g); });
        if (targetIdx === 0) setPointsReveal(1); // static frame shows the full scan, not a growing one
        onStageChange(targetIdx);
        sizeToHost();
        renderer.render(scene, camera);
      }

      // ═══ camera rig: independent auto-rotate + mouse/pen drag orbit ═══
      var autoRotY = 0;
      var dragging = false, lastX = 0, lastY = 0, dragAz = 0, dragEl = 0, dragAzVel = 0, dragElVel = 0;
      var ELEV_MIN = -60 * Math.PI / 180, ELEV_MAX = 75 * Math.PI / 180;

      function onPointerDown(e) {
        if (staticFrame || e.pointerType === "touch") return; // touch = auto-rotate only
        dragging = true; lastX = e.clientX; lastY = e.clientY; dragAzVel = 0; dragElVel = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
      function onPointerMove(e) {
        if (!dragging) return;
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        var sens = 0.0032;
        dragAzVel = dx * sens; dragElVel = dy * sens;
        dragAz += dragAzVel; dragEl += dragElVel;
        dragEl = Math.max(ELEV_MIN, Math.min(ELEV_MAX, dragEl));
      }
      function onPointerUp() { dragging = false; }

      if (!staticFrame) {
        canvas.style.pointerEvents = "auto";
        canvas.addEventListener("pointerdown", onPointerDown);
        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerup", onPointerUp);
        canvas.addEventListener("pointercancel", onPointerUp);
      } else {
        canvas.style.pointerEvents = "none";
      }

      function sizeToHost() {
        var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
        var mobile = w < 768;
        var maxDpr = mobile ? 1.5 : 2;
        var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(1, h);
        camera.updateProjectionMatrix();
      }
      sizeToHost();

      // ═══ static branch: exactly stage D, single paint, zero rAF ═══
      if (staticFrame) {
        snapToStage(3);
        var fadeRafS = requestAnimationFrame(function () { canvas.style.opacity = "1"; setReady(true); });
        engineRef.current = { gotoStage: gotoStage };

        var roS = null;
        if ("ResizeObserver" in window) { roS = new ResizeObserver(function () { sizeToHost(); renderer.render(scene, camera); }); roS.observe(el); }
        else window.addEventListener("resize", sizeToHost);

        cleanup = function () {
          if (fadeRafS) cancelAnimationFrame(fadeRafS);
          if (roS) roS.disconnect(); else window.removeEventListener("resize", sizeToHost);
          disposeObject3D(model);
          dotTex.dispose(); twillTex.dispose();
          try { renderer.forceContextLoss(); } catch (e) {}
          renderer.dispose();
          if (el && el.contains(canvas)) el.removeChild(canvas);
        };
        return; // no rAF loop, no timeline, no visibility plumbing needed
      }

      // ═══ animated branch ═══
      var visible = true, raf = null, lastNow = null;
      var FRAME_MS = 16.6667, DAMP = 0.92;

      function loop(now) {
        if (!mounted) return;
        var dt = lastNow == null ? FRAME_MS : Math.min(now - lastNow, 50);
        lastNow = now;

        autoRotY += 0.05 * (dt / 1000); // rad/s, independent of the pipeline

        if (!dragging) {
          var decay = Math.pow(DAMP, dt / FRAME_MS);
          dragAzVel *= decay; dragElVel *= decay;
          dragAz += dragAzVel; dragEl += dragElVel;
          dragEl = Math.max(ELEV_MIN, Math.min(ELEV_MAX, dragEl));
        }
        root.rotation.y = autoRotY + dragAz;
        root.rotation.x = dragEl;

        advanceTimeline(dt); // drag never pauses the pipeline clock — only rAF-pause does
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      }

      function startLoop() {
        if (raf || !visible || document.hidden) return;
        lastNow = null;
        raf = requestAnimationFrame(loop);
      }
      function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

      renderer.render(scene, camera);
      var fadeRaf = requestAnimationFrame(function () { canvas.style.opacity = "1"; setReady(true); });
      startLoop();
      engineRef.current = { gotoStage: gotoStage };

      var ro = null;
      if ("ResizeObserver" in window) { ro = new ResizeObserver(function () { sizeToHost(); if (!raf) renderer.render(scene, camera); }); ro.observe(el); }
      else window.addEventListener("resize", sizeToHost);

      var io = null;
      if ("IntersectionObserver" in window) {
        io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) { visible = entry.isIntersecting; if (!visible) stopLoop(); else startLoop(); });
        }, { threshold: 0 });
        io.observe(el);
      }
      function onVisibility() { if (document.hidden) stopLoop(); else startLoop(); }
      document.addEventListener("visibilitychange", onVisibility);

      function onContextLost(e) { e.preventDefault(); stopLoop(); canvas.style.opacity = "0"; }
      function onContextRestored() { sizeToHost(); renderer.render(scene, camera); canvas.style.opacity = "1"; startLoop(); }
      canvas.addEventListener("webglcontextlost", onContextLost, false);
      canvas.addEventListener("webglcontextrestored", onContextRestored, false);

      cleanup = function () {
        stopLoop();
        if (fadeRaf) cancelAnimationFrame(fadeRaf);
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("pointercancel", onPointerUp);
        window.removeEventListener("resize", sizeToHost);
        document.removeEventListener("visibilitychange", onVisibility);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        disposeObject3D(model);
        dotTex.dispose(); twillTex.dispose();
        try { renderer.forceContextLoss(); } catch (e) {}
        renderer.dispose();
        if (el && el.contains(canvas)) el.removeChild(canvas);
      };
    });

    return function () { mounted = false; engineRef.current = null; if (cleanup) cleanup(); };
  }, []);

  function handleTabClick(i) {
    if (engineRef.current) engineRef.current.gotoStage(i);
    else { setActiveStep(i); setHud(STAGES[i].hud); }
  }

  return (
    <div
      ref={host}
      style={{
        position: "relative", width: "100%", height: "100%", minHeight: 340, overflow: "hidden",
        background: "radial-gradient(circle at 38% 66%, rgba(" + CR + ",.07), " + BASE + " 72%)"
      }}
    >
      {/* HUD overlay — real DOM, keyboard/AT accessible; canvas is decorative */}
      <div style={{ position: "absolute", top: 12, left: 14, zIndex: 3, display: "flex", flexDirection: "column", gap: 10, maxWidth: "calc(100% - 28px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }} role="tablist" aria-label="Reverse-engineering pipeline stage">
          {STAGES.map(function (s, i) {
            var isActive = activeStep === i;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={function () { handleTabClick(i); }}
                style={{
                  fontFamily: MONO, fontSize: 8, letterSpacing: ".2em", textTransform: "uppercase",
                  padding: "6px 10px", background: isActive ? "rgba(" + CR + ",.08)" : "transparent",
                  border: "1px solid " + (isActive ? "rgba(" + CR + ",.5)" : "rgba(245,245,240,.1)"),
                  color: isActive ? C : INK2, cursor: "pointer", transition: "color .2s " + EASE + ",border-color .2s " + EASE
                }}
              >
                {String(i + 1).padStart(2, "0") + " " + s.label}
              </button>
            );
          })}
        </div>
        <div aria-live="polite" style={{ fontFamily: MONO, fontSize: 8, letterSpacing: ".06em", color: INK2, lineHeight: 1.75 }}>
          {hud.map(function (line, i) {
            return <div key={i} style={{ color: i === 0 ? C : INK2 }}>{line}</div>;
          })}
        </div>
      </div>
      <div aria-hidden="true" style={{ position: "absolute", bottom: 10, right: 14, zIndex: 2, fontFamily: MONO, fontSize: 7, letterSpacing: ".2em", color: INK2, opacity: ready ? 0.6 : 0 }}>
        REVERSE LAB · PROCESS VISUALIZATION
      </div>
    </div>
  );
}
