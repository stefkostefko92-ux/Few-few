import React, { useEffect, useRef, useState } from "react";

// ═══════════════════════════════════════════════════════════════
// REVERSE LAB SHOWCASE — a real (procedural) 3D reverse-engineering
// pipeline for a carbon front hugger (120/70-ZR17, wrap R=308mm, 68°
// sweep, arc ≈365mm): SCAN → MESH → SURFACE → SOLID, auto-cycling,
// with 4 real DOM tab buttons for manual control.
//
// IMPORTANT — HUD integrity: every number on screen (1.24M pts,
// σ=0.05mm, patch counts, deviation, etc.) is a DEMONSTRATION label
// that visualizes the *shape* of a reverse-engineering process. It is
// not a measured result for any real client part. Do not repurpose
// these strings as factual claims.
//
// Rendering (2026-10 rewrite, "photoreal" pass):
//  * image-based lighting from three's RoomEnvironment (PMREM), Khronos
//    PBR Neutral tone mapping, sRGB output — reflections are what make
//    clear-coated carbon and machined aluminium read as real;
//  * SOLID is a true closed shell (outer skin, inner skin 2.4mm in, and
//    the four edge walls), 2×2 twill carbon generated on a canvas as
//    colour + normal + ANISOTROPY maps (the two tow directions catch the
//    light differently — that is the look of real carbon) under a glossy
//    clear coat, mounting tabs with real holes and aluminium bushings;
//  * SURFACE carries zebra stripes — the reflection-line check surfacing
//    engineers use for G2 continuity — and the patch boundaries;
//  * MESH is an irregular, noisy triangulation like a scanner STL;
//  * SCAN is a shaded point cloud swept by a laser line + fan;
//  * a soft contact shadow grounds every stage.
//
// Motion/accessibility model unchanged: dynamic import("three") only when
// the section approaches; staticFrame (prefers-reduced-motion OR
// low-power) renders stage 4 once with zero rAF and lets the tabs swap
// with a single render; rAF pauses off-screen and on hidden tabs; touch
// never hijacks the page scroll; full dispose + forceContextLoss.
// ═══════════════════════════════════════════════════════════════

var BASE = "#0A0C0E";
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
    hud: ["SCAN PASS 03/03 · 1.24M PTS (RAW)", "σ=0.05mm · SENSOR: LASER 0.05mm CLASS", "3 OUTLIERS FLAGGED"]
  },
  {
    key: "mesh", label: "MESH",
    hud: ["MESH: 96,400 → 12,600 TRIS (DECIMATED)", "HOLES FILLED: 4 · WATERTIGHT: PENDING"]
  },
  {
    key: "surface", label: "SURFACE",
    hud: ["SURFACE: 6 PATCHES · CONTINUITY G2 (ZEBRA)", "DEVIATION vs SCAN: ±0.06mm (σ) · CLASS-A: PASS"]
  },
  {
    key: "solid", label: "SOLID",
    hud: ["SOLID: WATERTIGHT ✓ · MANIFOLD ✓", "PLY: 8× 0.3mm 2×2 TWILL (2.4mm) · READY: STEP/IGES"]
  }
];

// ── Part geometry (front hugger, 120/70-ZR17, OD≈600mm), all in mm ──
var SPINE_R = 308;                          // wrap radius
var SPINE_HALF = 34 * Math.PI / 180;        // ±34° = 68° sweep, arc ≈365mm
var HALF_WIDTH = 66;                        // crown half-width
var CROWN = 10;                             // crown drop centre → edge
var FILLET_R = 7;                           // edge roll radius
var LIP_LEN = 9;                            // edge lip length
var THICK = 2.4;                            // laminate: 8 plies × 0.3mm
var TOW_TILE = 40;                          // mm covered by one weave tile (8 tows × 5mm)

// Spine as an arch (∩): top at the origin, both ends lower, part stands on
// its two ends like a product shot. Analytic frame per angle:
// T = tangent, W = (0,0,1) across the tyre, Nrm = outward (away from axle).
function spineAt(th) {
  return {
    P: [SPINE_R * Math.sin(th), SPINE_R * Math.cos(th) - SPINE_R, 0],
    T: [Math.cos(th), -Math.sin(th), 0],
    N: [Math.sin(th), Math.cos(th), 0]
  };
}

// Cross-section as a smooth 2D path (w = across, n = along outward normal):
// crowned top + rolled fillet + lip turning down toward the wheel; then
// resampled by arc length so the vertices are evenly spaced.
function buildProfile(count) {
  var pts = [];
  var CN = 48;
  for (var i = 0; i <= CN; i++) {
    var w = -HALF_WIDTH + (2 * HALF_WIDTH) * i / CN;
    pts.push([w, -CROWN * (w / HALF_WIDTH) * (w / HALF_WIDTH)]);
  }
  function edge(side) { // side = +1 right, -1 left
    var out = [];
    var slope = -2 * CROWN / HALF_WIDTH * side;              // dn/dw at the edge
    var a0 = Math.atan2(slope * side, 1);                     // edge tangent angle (in side-local frame)
    var ex = side * HALF_WIDTH, en = -CROWN;
    // fillet: rotate the tangent from a0 down to -80° around a centre below the edge
    var a1 = -80 * Math.PI / 180;
    // centre on the inner side of the turn; the roll moves outward and down
    var cx = ex + side * FILLET_R * Math.sin(a0), cn = en - FILLET_R * Math.cos(a0);
    for (var k = 1; k <= 10; k++) {
      var a = a0 + (a1 - a0) * k / 10;
      out.push([cx - side * FILLET_R * Math.sin(a), cn + FILLET_R * Math.cos(a)]);
    }
    var last = out[out.length - 1];
    var dx = side * Math.cos(a1), dn = Math.sin(a1);
    for (var m = 1; m <= 4; m++) out.push([last[0] + dx * LIP_LEN * m / 4, last[1] + dn * LIP_LEN * m / 4]);
    return out;
  }
  var right = edge(1), left = edge(-1).reverse();
  var path = left.concat(pts).concat(right);
  // resample by arc length
  var acc = [0];
  for (var p = 1; p < path.length; p++) acc.push(acc[p - 1] + Math.hypot(path[p][0] - path[p - 1][0], path[p][1] - path[p - 1][1]));
  var total = acc[acc.length - 1], res = [], seg = 0;
  for (var r = 0; r < count; r++) {
    var s = total * r / (count - 1);
    while (seg < path.length - 2 && acc[seg + 1] < s) seg++;
    var f = (s - acc[seg]) / Math.max(1e-6, acc[seg + 1] - acc[seg]);
    res.push({ w: path[seg][0] + (path[seg + 1][0] - path[seg][0]) * f, n: path[seg][1] + (path[seg + 1][1] - path[seg][1]) * f, s: s });
  }
  return { pts: res, length: total };
}

// width taper toward the rear (tyre narrows the silhouette), 1.0 → 0.84
function taperAt(t) { var x = Math.max(0, (t - 0.35) / 0.65); return 1 - 0.16 * x * x * (3 - 2 * x); }

// Outer skin as a grid of points (+ optional jitter for the scanner mesh)
function outerGrid(stations, profileCount, jitter, rnd) {
  var prof = buildProfile(profileCount);
  var rows = stations + 1, cols = profileCount;
  var P = new Float32Array(rows * cols * 3), UV = new Float32Array(rows * cols * 2);
  var arc = SPINE_R * 2 * SPINE_HALF;
  for (var i = 0; i < rows; i++) {
    for (var j = 0; j < cols; j++) {
      var ti = i / stations, pj = j;
      var jt = 0, jp = 0;
      if (jitter && i > 0 && i < rows - 1 && j > 0 && j < cols - 1) { jt = (rnd() - 0.5) * jitter / stations; jp = (rnd() - 0.5) * jitter; }
      var t = Math.min(1, Math.max(0, ti + jt));
      var th = -SPINE_HALF + 2 * SPINE_HALF * t;
      var f = spineAt(th), tap = taperAt(t);
      var a = Math.max(0, Math.min(cols - 1, pj + jp)), a0 = Math.floor(a), a1 = Math.min(cols - 1, a0 + 1), fa = a - a0;
      var w = (prof.pts[a0].w + (prof.pts[a1].w - prof.pts[a0].w) * fa) * tap;
      var n = prof.pts[a0].n + (prof.pts[a1].n - prof.pts[a0].n) * fa;
      var s = prof.pts[a0].s + (prof.pts[a1].s - prof.pts[a0].s) * fa;
      var k = (i * cols + j) * 3;
      P[k] = f.P[0] + f.N[0] * n; P[k + 1] = f.P[1] + f.N[1] * n; P[k + 2] = w;
      UV[(i * cols + j) * 2] = t * arc / TOW_TILE; UV[(i * cols + j) * 2 + 1] = s * (0.92 + 0.08 * tap) / TOW_TILE;
    }
  }
  return { P: P, UV: UV, rows: rows, cols: cols };
}

// per-vertex outward normals of a grid (central differences)
function gridNormals(g) {
  var rows = g.rows, cols = g.cols, P = g.P, Nn = new Float32Array(P.length);
  function at(i, j, o) { return P[(i * cols + j) * 3 + o]; }
  for (var i = 0; i < rows; i++) {
    for (var j = 0; j < cols; j++) {
      var i0 = Math.max(0, i - 1), i1 = Math.min(rows - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(cols - 1, j + 1);
      var ux = at(i1, j, 0) - at(i0, j, 0), uy = at(i1, j, 1) - at(i0, j, 1), uz = at(i1, j, 2) - at(i0, j, 2);
      var vx = at(i, j1, 0) - at(i, j0, 0), vy = at(i, j1, 1) - at(i, j0, 1), vz = at(i, j1, 2) - at(i, j0, 2);
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var l = Math.hypot(nx, ny, nz) || 1;
      // orient outward (away from the axle at (0,-R,0))
      var px = at(i, j, 0), py = at(i, j, 1) + SPINE_R;
      if (nx * px + ny * py < 0) l = -l;
      var k = (i * cols + j) * 3; Nn[k] = nx / l; Nn[k + 1] = ny / l; Nn[k + 2] = nz / l;
    }
  }
  return Nn;
}

function gridIndices(rows, cols, base, flip, out) {
  for (var r = 0; r < rows - 1; r++) for (var c = 0; c < cols - 1; c++) {
    var a = base + r * cols + c, b = a + 1, cc = a + cols, d = cc + 1;
    if (flip) out.push(a, b, cc, b, d, cc); else out.push(a, cc, b, b, cc, d);
  }
}

// Outer skin only (scan sampling, scanner mesh, class-A surface)
function buildSkin(THREE, stations, profileCount, jitter, rnd, noise) {
  var g = outerGrid(stations, profileCount, jitter, rnd);
  if (noise) { // scanner noise along the normal
    var Nn = gridNormals(g);
    for (var v = 0; v < g.P.length / 3; v++) {
      var e = (rnd() + rnd() + rnd() - 1.5) * noise;
      g.P[v * 3] += Nn[v * 3] * e; g.P[v * 3 + 1] += Nn[v * 3 + 1] * e; g.P[v * 3 + 2] += Nn[v * 3 + 2] * e;
    }
  }
  var idx = []; gridIndices(g.rows, g.cols, 0, false, idx);
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(g.P, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(g.UV, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geometry: geo, grid: g };
}

// Closed laminate shell: outer skin + inner skin (THICK inward) + 4 edge walls.
// Each region has its own vertices, so edges stay crisp and skins stay smooth.
function buildSolid(THREE, stations, profileCount) {
  var g = outerGrid(stations, profileCount, 0, null);
  var Nn = gridNormals(g);
  var rows = g.rows, cols = g.cols, n = rows * cols;
  var pos = [], uv = [], idx = [];
  function push(x, y, z, u, v) { pos.push(x, y, z); uv.push(u, v); return pos.length / 3 - 1; }
  // outer
  for (var k = 0; k < n; k++) push(g.P[k * 3], g.P[k * 3 + 1], g.P[k * 3 + 2], g.UV[k * 2], g.UV[k * 2 + 1]);
  gridIndices(rows, cols, 0, false, idx);
  // inner
  var innerBase = pos.length / 3;
  for (var k2 = 0; k2 < n; k2++) push(g.P[k2 * 3] - Nn[k2 * 3] * THICK, g.P[k2 * 3 + 1] - Nn[k2 * 3 + 1] * THICK, g.P[k2 * 3 + 2] - Nn[k2 * 3 + 2] * THICK, g.UV[k2 * 2], g.UV[k2 * 2 + 1]);
  gridIndices(rows, cols, innerBase, true, idx);
  // walls along a boundary polyline of grid vertex ids
  function wall(ids, flip) {
    var b = pos.length / 3;
    ids.forEach(function (id, q) {
      push(g.P[id * 3], g.P[id * 3 + 1], g.P[id * 3 + 2], q * 0.05, 0);
      push(g.P[id * 3] - Nn[id * 3] * THICK, g.P[id * 3 + 1] - Nn[id * 3 + 1] * THICK, g.P[id * 3 + 2] - Nn[id * 3 + 2] * THICK, q * 0.05, 0.04);
    });
    for (var q = 0; q < ids.length - 1; q++) {
      var a = b + q * 2, a2 = a + 1, c = a + 2, c2 = a + 3;
      if (flip) idx.push(a, a2, c, c, a2, c2); else idx.push(a, c, a2, c, c2, a2);
    }
  }
  var front = [], rear = [], left = [], right = [];
  for (var j = 0; j < cols; j++) { front.push(j); rear.push((rows - 1) * cols + j); }
  for (var i = 0; i < rows; i++) { left.push(i * cols); right.push(i * cols + cols - 1); }
  wall(front, true); wall(rear, false); wall(left, false); wall(right, true);
  var geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geometry: geo, grid: g, normals: Nn };
}

// Mounting tabs: vertical plates under the skin (bolt axis across the tyre),
// real holes (Shape holes, beveled extrusion) + pressed aluminium bushings.
function buildTabs(THREE, carbonMat, aluMat) {
  var grp = new THREE.Group();
  function plate(wMM, hMM, holeR) {
    var r = 3, sh = new THREE.Shape();
    var x0 = -wMM / 2, x1 = wMM / 2, y0 = -hMM, y1 = 0;
    sh.moveTo(x0 + r, y0); sh.lineTo(x1 - r, y0); sh.quadraticCurveTo(x1, y0, x1, y0 + r);
    sh.lineTo(x1, y1); sh.lineTo(x0, y1); sh.lineTo(x0, y0 + r); sh.quadraticCurveTo(x0, y0, x0 + r, y0);
    var hole = new THREE.Path(); hole.absarc(0, -hMM * 0.58, holeR, 0, Math.PI * 2, true); sh.holes.push(hole);
    var g = new THREE.ExtrudeGeometry(sh, { depth: 4, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 24 });
    g.translate(0, 0, -2);
    return g;
  }
  function bushing(holeR) {
    var pts = [new THREE.Vector2(holeR - 1.1, -3.4), new THREE.Vector2(holeR + 0.05, -3.4), new THREE.Vector2(holeR + 0.05, -2.6), new THREE.Vector2(holeR + 1.6, -2.6),
      new THREE.Vector2(holeR + 1.6, -2.0), new THREE.Vector2(holeR + 0.05, -2.0), new THREE.Vector2(holeR + 0.05, 3.0), new THREE.Vector2(holeR - 1.1, 3.0)];
    var g = new THREE.LatheGeometry(pts, 32);
    g.rotateX(Math.PI / 2);
    return g;
  }
  function place(t, w, wMM, hMM) {
    var th = -SPINE_HALF + 2 * SPINE_HALF * t, f = spineAt(th), tap = taperAt(t);
    var crownN = -CROWN * Math.pow(Math.min(1, Math.abs(w * tap) / HALF_WIDTH), 2);
    var o = new THREE.Object3D();
    o.position.set(f.P[0] + f.N[0] * (crownN - THICK), f.P[1] + f.N[1] * (crownN - THICK), w * tap);
    // plate plane = (T, N): local x = T, local y = N, local z = W (bolt axis)
    o.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(f.T[0], f.T[1], 0), new THREE.Vector3(f.N[0], f.N[1], 0), new THREE.Vector3(0, 0, 1)));
    var p = new THREE.Mesh(plate(wMM, hMM, 3.25), carbonMat);
    var b = new THREE.Mesh(bushing(3.25), aluMat); b.position.set(0, -hMM * 0.58, 0);
    o.add(p); o.add(b);
    grp.add(o);
  }
  place(0.07, 40, 30, 24); place(0.07, -40, 30, 24); place(0.93, 0, 25, 20);
  return grp;
}

// ── Area-weighted point sampling, shaded like a scanner viewport ──
function samplePointCloud(THREE, geometry, count, sigma, outlierCount) {
  var posAttr = geometry.attributes.position, normAttr = geometry.attributes.normal, idx = geometry.index.array;
  var triCount = idx.length / 3, cum = new Float64Array(triCount), total = 0;
  var a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
  for (var t = 0; t < triCount; t++) {
    a.fromBufferAttribute(posAttr, idx[t * 3]); b.fromBufferAttribute(posAttr, idx[t * 3 + 1]); c.fromBufferAttribute(posAttr, idx[t * 3 + 2]);
    ab.subVectors(b, a); ac.subVectors(c, a); cr.crossVectors(ab, ac); total += 0.5 * cr.length(); cum[t] = total;
  }
  function pickTri() { var r = Math.random() * total, lo = 0, hi = triCount - 1; while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; } return lo; }
  var positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  var L = new THREE.Vector3(0.35, 0.85, 0.4).normalize(), cyan = new THREE.Color(C);
  var outlierSet = {}; for (var o = 0; o < outlierCount; o++) outlierSet[Math.floor(Math.random() * count)] = true;
  var na = new THREE.Vector3(), nb = new THREE.Vector3(), nc = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (var i = 0; i < count; i++) {
    var tri = pickTri();
    a.fromBufferAttribute(posAttr, idx[tri * 3]); b.fromBufferAttribute(posAttr, idx[tri * 3 + 1]); c.fromBufferAttribute(posAttr, idx[tri * 3 + 2]);
    var sr1 = Math.sqrt(Math.random()), r2 = Math.random(), w0 = 1 - sr1, w1 = sr1 * (1 - r2), w2 = sr1 * r2;
    na.fromBufferAttribute(normAttr, idx[tri * 3]); nb.fromBufferAttribute(normAttr, idx[tri * 3 + 1]); nc.fromBufferAttribute(normAttr, idx[tri * 3 + 2]);
    nrm.set(na.x * w0 + nb.x * w1 + nc.x * w2, na.y * w0 + nb.y * w1 + nc.y * w2, na.z * w0 + nb.z * w1 + nc.z * w2).normalize();
    var isOut = !!outlierSet[i];
    var g = Math.sqrt(-2 * Math.log(Math.max(Math.random(), 1e-6))) * Math.cos(2 * Math.PI * Math.random());
    var j = g * sigma * (isOut ? 14 : 1);
    positions[i * 3] = a.x * w0 + b.x * w1 + c.x * w2 + nrm.x * j;
    positions[i * 3 + 1] = a.y * w0 + b.y * w1 + c.y * w2 + nrm.y * j;
    positions[i * 3 + 2] = a.z * w0 + b.z * w1 + c.z * w2 + nrm.z * j;
    var sh = 0.22 + 0.78 * Math.max(0, nrm.dot(L)) + (Math.random() - 0.5) * 0.08;
    if (isOut) { colors[i * 3] = cyan.r; colors[i * 3 + 1] = cyan.g; colors[i * 3 + 2] = cyan.b; }
    else { colors[i * 3] = sh * 0.86; colors[i * 3 + 1] = sh * 0.9; colors[i * 3 + 2] = sh * 0.94; }
  }
  // sort along X (the part's length) so a growing drawRange reads as the laser pass
  var order = []; for (var k = 0; k < count; k++) order.push(k);
  order.sort(function (p, q) { return positions[p * 3] - positions[q * 3]; });
  var sp = new Float32Array(count * 3), sc = new Float32Array(count * 3);
  for (var m = 0; m < count; m++) for (var d = 0; d < 3; d++) { sp[m * 3 + d] = positions[order[m] * 3 + d]; sc[m * 3 + d] = colors[order[m] * 3 + d]; }
  return { positions: sp, colors: sc };
}

// ── canvas-generated textures (no CDN, no binary assets) ──
function makeDotSpriteTexture(THREE) {
  var size = 64, cv = document.createElement("canvas"); cv.width = cv.height = size;
  var ctx = cv.getContext("2d"), g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.45, "rgba(255,255,255,.85)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  var tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true; return tex;
}

function makeShadowTexture(THREE) {
  var size = 256, cv = document.createElement("canvas"); cv.width = cv.height = size;
  var ctx = cv.getContext("2d"), g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,.62)"); g.addColorStop(0.45, "rgba(0,0,0,.34)"); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  var tex = new THREE.CanvasTexture(cv); tex.needsUpdate = true; return tex;
}

// 2×2 twill, one tile = 8×8 tows. Returns colour (sRGB), normal and
// anisotropy maps built from the same tow layout, so the weave's colour,
// relief and sheen direction line up exactly.
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

async function makeCarbonTextures(THREE, size, maxAniso) {
  var N = 8, cell = size / N;
  function horiz(cx, cy) { return (((cx - cy) % 4) + 4) % 4 < 2; }
  var H = new Float32Array(size * size), A = new Uint8ClampedArray(size * size * 4), Col = new Uint8ClampedArray(size * size * 4);
  var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  var towShade = []; for (var q = 0; q < N * N; q++) towShade.push(0.9 + rnd() * 0.2);
  var fib = new Float32Array(size); for (var f = 0; f < size; f++) fib[f] = (rnd() - 0.5);
  for (var y = 0; y < size; y++) {
    if (y && y % 128 === 0) await tick();   // ~15ms slices: never one long task
    for (var x = 0; x < size; x++) {
      var cx = Math.floor(x / cell), cy = Math.floor(y / cell), hz = horiz(cx, cy);
      var lx = (x % cell) / cell, ly = (y % cell) / cell;
      var across = hz ? ly : lx;                     // position across the tow width
      var gap = Math.min(across, 1 - across);        // distance to the tow edge
      var dome = Math.sin(Math.PI * across);         // tow cross-section
      var striation = hz ? fib[y] : fib[x];          // individual filament bundles
      var h = dome * 0.85 + striation * 0.08 - (gap < 0.04 ? 0.35 : 0);
      H[y * size + x] = h;
      var shade = towShade[cy * N + cx] * (0.82 + 0.18 * dome) * (gap < 0.04 ? 0.55 : 1) + striation * 0.05;
      var base = hz ? 24 : 18;                       // slight tone difference between directions
      var v = Math.max(0, Math.min(255, base * shade));
      var o = (y * size + x) * 4;
      Col[o] = v; Col[o + 1] = v * 1.04; Col[o + 2] = v * 1.1; Col[o + 3] = 255;
      // anisotropy: RG = direction (tangent space, 0..1 encoded), B = strength
      A[o] = hz ? 255 : 128; A[o + 1] = hz ? 128 : 255; A[o + 2] = gap < 0.04 ? 40 : 230; A[o + 3] = 255;
    }
  }
  var Nm = new Uint8ClampedArray(size * size * 4), k = 2.2;
  for (var yy = 0; yy < size; yy++) { if (yy && yy % 256 === 0) await tick(); for (var xx = 0; xx < size; xx++) {
    var l = H[yy * size + ((xx - 1 + size) % size)], r = H[yy * size + ((xx + 1) % size)];
    var u = H[((yy - 1 + size) % size) * size + xx], d = H[((yy + 1) % size) * size + xx];
    var nx = (l - r) * k, ny = (d - u) * k, nz = 1, len = Math.hypot(nx, ny, nz);
    var oo = (yy * size + xx) * 4;
    Nm[oo] = (nx / len * 0.5 + 0.5) * 255; Nm[oo + 1] = (ny / len * 0.5 + 0.5) * 255; Nm[oo + 2] = (nz / len * 0.5 + 0.5) * 255; Nm[oo + 3] = 255;
  } }
  function tex(data, srgb) {
    var t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
    t.anisotropy = maxAniso; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.needsUpdate = true; return t;
  }
  return { map: tex(Col, true), normalMap: tex(Nm, false), anisotropyMap: tex(A, false) };
}

// patch boundaries for the SURFACE stage (3 along × 2 across = 6 patches)
function buildPatchLines(THREE, grid) {
  var rows = grid.rows, cols = grid.cols, P = grid.P, Nn = gridNormals(grid);
  var lines = new THREE.Group();
  var mat = new THREE.LineBasicMaterial({ color: new THREE.Color(C), transparent: true, opacity: 0.85 });
  function pt(i, j) { var k = (i * cols + j) * 3; return new THREE.Vector3(P[k] + Nn[k] * 0.35, P[k + 1] + Nn[k + 1] * 0.35, P[k + 2] + Nn[k + 2] * 0.35); }
  [0, Math.round((rows - 1) / 3), Math.round(2 * (rows - 1) / 3), rows - 1].forEach(function (i) {
    var pts = []; for (var j = 0; j < cols; j++) pts.push(pt(i, j));
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  });
  [0, Math.round((cols - 1) / 2), cols - 1].forEach(function (j) {
    var pts = []; for (var i = 0; i < rows; i++) pts.push(pt(i, j));
    lines.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  });
  return lines;
}

function disposeObject3D(obj) {
  var keys = ["map", "normalMap", "anisotropyMap", "roughnessMap", "alphaMap", "clearcoatNormalMap"];
  obj.traverse(function (child) {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(function (m) {
        keys.forEach(function (k) { if (m[k] && m[k].dispose) m[k].dispose(); });
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

    // Don't build the scene until the section is approaching (it sits far
    // below the fold; a live WebGL context is not free).
    var startIO = null;
    function boot() {
      if (!mounted) return;
      Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]).then(async function (mods) {
      var THREE = mods[0], RoomEnvironment = mods[1].RoomEnvironment;
      if (!mounted || !el) return;

      var isMobile = window.innerWidth < 768;
      var SOLID_ST = isMobile ? 72 : 140, SOLID_PR = isMobile ? 30 : 56;
      var MESH_ST = isMobile ? 26 : 40, MESH_PR = isMobile ? 12 : 18;
      var POINT_COUNT = isMobile ? 12000 : 36000;
      var TEX = isMobile ? 512 : 1024;

      var renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "default" });
      } catch (e) {
        return; // no WebGL — the CSS backdrop stays as the visible layer
      }
      renderer.localClippingEnabled = true;
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 1.0;

      var canvas = renderer.domElement;
      canvas.setAttribute("aria-hidden", "true");
      canvas.tabIndex = -1;
      canvas.style.cssText = "display:block;width:100%;height:100%;position:absolute;inset:0;touch-action:pan-y;opacity:0;transition:opacity .7s " + EASE;
      el.appendChild(canvas);

      var scene = new THREE.Scene();
      // studio image-based lighting: soft boxes reflected in the clear coat
      var pmrem = new THREE.PMREMGenerator(renderer);
      var room = new RoomEnvironment();
      var envTex = pmrem.fromScene(room, 0.035).texture;
      room.dispose(); pmrem.dispose();
      scene.environment = envTex;
      scene.environmentIntensity = 0.9;
      scene.environmentRotation.set(0, 0.6, 0);

      var camera = new THREE.PerspectiveCamera(28, 1, 5, 4000);
      var key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(220, 420, 260); scene.add(key);
      var rim = new THREE.DirectionalLight(0xbfefff, 0.9); rim.position.set(-260, 160, -320); scene.add(rim);

      var root = new THREE.Group(); // auto-rotate + drag orbit
      var model = new THREE.Group(); // centred part
      root.add(model); scene.add(root);

      var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      // The build runs in steps that hand the main thread back between them (scrolling
      // stays smooth); if the section unmounts mid-build, everything is released.
      function abandoned() {
        if (mounted) return false;
        envTex.dispose(); try { renderer.forceContextLoss(); } catch (e) {} renderer.dispose();
        if (el && el.contains(canvas)) el.removeChild(canvas);
        return true;
      }
      await tick(); if (abandoned()) return;

      // ── geometry ──
      var solid = buildSolid(THREE, SOLID_ST, SOLID_PR);
      var skin = buildSkin(THREE, SOLID_ST, SOLID_PR, 0, null, 0);
      var scanMesh = buildSkin(THREE, MESH_ST, MESH_PR, 0.7, rnd, 0.35);

      var bbox = solid.geometry.boundingBox, center = bbox.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -center.y, -center.z);
      var radius = solid.geometry.boundingSphere.radius;
      var xMin = -radius - 6, xMax = radius + 6;

      await tick(); if (abandoned()) return;
      var dotTex = makeDotSpriteTexture(THREE), shadowTex = makeShadowTexture(THREE);
      var carbonTex = await makeCarbonTextures(THREE, TEX, renderer.capabilities.getMaxAnisotropy());
      if (abandoned()) return;

      // contact shadow under the arch (follows the part's rotation)
      var shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.set((bbox.max.x - bbox.min.x) * 1.25, (bbox.max.z - bbox.min.z) * 1.6, 1);
      shadow.position.set(center.x, bbox.min.y - 0.6, center.z);
      shadow.renderOrder = -1;
      model.add(shadow);

      function makePlane() { return new THREE.Plane(new THREE.Vector3(-1, 0, 0), -1e6); }

      // ---- Stage A: SCAN — shaded point cloud + laser line and fan ----
      await tick(); if (abandoned()) return;
      var sampled = samplePointCloud(THREE, skin.geometry, POINT_COUNT, 0.35, 3);
      STAGES[0].hud = ["SCAN PASS 03/03 · 1.24M PTS (RAW) · " + POINT_COUNT.toLocaleString("en-US") + " PTS (DISPLAY)", STAGES[0].hud[1], STAGES[0].hud[2]];
      setHud(STAGES[0].hud);
      var ptsGeo = new THREE.BufferGeometry();
      ptsGeo.setAttribute("position", new THREE.Float32BufferAttribute(sampled.positions, 3));
      ptsGeo.setAttribute("color", new THREE.Float32BufferAttribute(sampled.colors, 3));
      ptsGeo.setDrawRange(0, 0);
      var planeA = makePlane();
      var ptsMat = new THREE.PointsMaterial({ map: dotTex, size: 1.6, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05, toneMapped: false, clippingPlanes: [planeA] });
      var points = new THREE.Points(ptsGeo, ptsMat);
      // laser: a thin glowing ribbon across the part at the scan front + the fan from the head
      var prof = buildProfile(SOLID_PR);
      var laserGeo = new THREE.BufferGeometry(), laserPos = new Float32Array(SOLID_PR * 2 * 3), laserIdx = [];
      for (var li = 0; li < SOLID_PR - 1; li++) { var la = li * 2; laserIdx.push(la, la + 1, la + 2, la + 1, la + 3, la + 2); }
      laserGeo.setAttribute("position", new THREE.BufferAttribute(laserPos, 3)); laserGeo.setIndex(laserIdx);
      var laserMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.4, 2.8), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: [planeA] });
      var laser = new THREE.Mesh(laserGeo, laserMat);
      var fanGeo = new THREE.BufferGeometry(), fanPos = new Float32Array((SOLID_PR + 1) * 3), fanIdx = [];
      for (var fi = 0; fi < SOLID_PR - 1; fi++) fanIdx.push(SOLID_PR, fi, fi + 1);
      fanGeo.setAttribute("position", new THREE.BufferAttribute(fanPos, 3)); fanGeo.setIndex(fanIdx);
      var fanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(C), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, clippingPlanes: [planeA] });
      var fan = new THREE.Mesh(fanGeo, fanMat);
      laser.visible = fan.visible = false;
      function setLaser(x) {
        var t = Math.max(0, Math.min(1, (Math.asin(Math.max(-1, Math.min(1, x / SPINE_R))) + SPINE_HALF) / (2 * SPINE_HALF)));
        var th = -SPINE_HALF + 2 * SPINE_HALF * t, f = spineAt(th), tap = taperAt(t), off = 0.6, hw = 0.7;
        for (var j = 0; j < SOLID_PR; j++) {
          var p = prof.pts[j], bx = f.P[0] + f.N[0] * (p.n + off), by = f.P[1] + f.N[1] * (p.n + off), bz = p.w * tap;
          laserPos[j * 6] = bx - f.T[0] * hw; laserPos[j * 6 + 1] = by - f.T[1] * hw; laserPos[j * 6 + 2] = bz;
          laserPos[j * 6 + 3] = bx + f.T[0] * hw; laserPos[j * 6 + 4] = by + f.T[1] * hw; laserPos[j * 6 + 5] = bz;
          fanPos[j * 3] = bx; fanPos[j * 3 + 1] = by; fanPos[j * 3 + 2] = bz;
        }
        fanPos[SOLID_PR * 3] = f.P[0] + f.N[0] * 210; fanPos[SOLID_PR * 3 + 1] = f.P[1] + f.N[1] * 210; fanPos[SOLID_PR * 3 + 2] = 0;
        laserGeo.attributes.position.needsUpdate = true; fanGeo.attributes.position.needsUpdate = true;
        laserGeo.computeBoundingSphere(); fanGeo.computeBoundingSphere();
      }
      var groupA = new THREE.Group(); groupA.add(points); groupA.add(laser); groupA.add(fan); groupA.userData.plane = planeA;
      groupA.userData.materials = [ptsMat, laserMat, fanMat];
      groupA.userData.pointsGeo = ptsGeo; groupA.userData.pointsTotal = POINT_COUNT;

      // ---- Stage B: MESH — irregular noisy triangulation, scanner-grey, wireframe ----
      var planeB = makePlane();
      var meshBMat = new THREE.MeshStandardMaterial({ color: 0x5d6871, envMapIntensity: 0.55, roughness: 0.72, metalness: 0.0, flatShading: true, side: THREE.DoubleSide, transparent: true, clippingPlanes: [planeB] });
      var meshB = new THREE.Mesh(scanMesh.geometry, meshBMat);
      var wireMat = new THREE.LineBasicMaterial({ color: 0xe6edf1, transparent: true, opacity: 0.42, clippingPlanes: [planeB] });
      var wire = new THREE.LineSegments(new THREE.WireframeGeometry(scanMesh.geometry), wireMat);
      wire.renderOrder = 2;
      var groupB = new THREE.Group(); groupB.add(meshB); groupB.add(wire); groupB.userData.plane = planeB;
      groupB.userData.materials = [meshBMat, wireMat];

      // ---- Stage C: SURFACE — class-A skin with zebra reflection lines + patch boundaries ----
      var planeC = makePlane();
      var meshCMat = new THREE.MeshPhysicalMaterial({ color: 0xaeb6bd, envMapIntensity: 0.7, roughness: 0.18, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, side: THREE.DoubleSide, transparent: true, clippingPlanes: [planeC] });
      meshCMat.onBeforeCompile = function (shader) {
        shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>",
          "#include <opaque_fragment>\n" +
          "vec3 _zr = reflect(-normalize(vViewPosition), normalize(normal));\n" +
          "float _zs = abs(fract(_zr.y * 4.5 + 0.5) - 0.5) * 2.0;\n" +
          "float _zb = smoothstep(0.46, 0.54, _zs);\n" +
          "gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vec3(0.012), vec3(0.92), _zb), 0.58);");
      };
      var meshC = new THREE.Mesh(skin.geometry, meshCMat);
      var patchLines = buildPatchLines(THREE, skin.grid);
      patchLines.children.forEach(function (l) { l.material.clippingPlanes = [planeC]; });
      var groupC = new THREE.Group(); groupC.add(meshC); groupC.add(patchLines); groupC.userData.plane = planeC;
      groupC.userData.materials = [meshCMat, patchLines.children[0].material];

      // ---- Stage D: SOLID — laminate shell, 2×2 twill under clear coat, tabs + bushings ----
      var planeD = makePlane();
      var carbonMat = new THREE.MeshPhysicalMaterial({
        map: carbonTex.map, normalMap: carbonTex.normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
        anisotropy: 0.6, anisotropyMap: carbonTex.anisotropyMap,
        color: 0xffffff, roughness: 0.42, metalness: 0.18, envMapIntensity: 0.75,
        clearcoat: 1.0, clearcoatRoughness: 0.03, ior: 1.5,
        side: THREE.DoubleSide, transparent: true, clippingPlanes: [planeD]
      });
      var aluMat = new THREE.MeshPhysicalMaterial({ color: 0xc8cdd2, metalness: 1.0, roughness: 0.26, anisotropy: 0.6, transparent: true, clippingPlanes: [planeD] });
      var meshD = new THREE.Mesh(solid.geometry, carbonMat);
      var tabs = buildTabs(THREE, carbonMat, aluMat);
      var groupD = new THREE.Group(); groupD.add(meshD); groupD.add(tabs); groupD.userData.plane = planeD;
      groupD.userData.materials = [carbonMat, aluMat];

      var groups = [groupA, groupB, groupC, groupD];
      groups.forEach(function (g) { model.add(g); g.visible = false; });
      // compile every stage's shaders up front, in parallel where the GPU driver allows
      // (KHR_parallel_shader_compile) — no hitch at the first wipe, no long task now
      try { await renderer.compileAsync(scene, camera); } catch (e) {}
      if (abandoned()) { disposeObject3D(model); dotTex.dispose(); shadowTex.dispose(); return; }

      // Each material fades from ITS design opacity (wire .32, fan .07 …), captured once.
      function setGroupOpacity(g, v) { g.userData.materials.forEach(function (m) { if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity; m.opacity = m.userData.baseOpacity * v; }); }
      function showGroupFull(g) { g.visible = true; g.userData.plane.normal.set(-1, 0, 0); g.userData.plane.constant = 1e6; setGroupOpacity(g, 1); }
      function hideGroup(g) { g.userData.plane.constant = -1e6; setGroupOpacity(g, 0); g.visible = false; }

      groups.forEach(hideGroup);
      showGroupFull(groupA); // the points still draw nothing: drawRange starts at 0

      // ═══ pipeline timeline (rAF-driven; pausing rAF pauses the whole thing) ═══
      var FORM_A = 3200, HOLD_A_REST = 1800, HOLD_B = 2800, HOLD_C = 3200, HOLD_D = 5000, WIPE_MS = 900;
      var STAGE_HOLD = [FORM_A + HOLD_A_REST, HOLD_B, HOLD_C, HOLD_D];
      var mode = "hold", stageIdx = 0, wipeFrom = 0, wipeTo = 0, phaseElapsed = 0, manualHoldFloor = 0, pendingHoldFloor = 0;

      function setPointsReveal(t) {
        var n = Math.round(groupA.userData.pointsTotal * t);
        groupA.userData.pointsGeo.setDrawRange(0, n);
        var scanning = t > 0 && t < 1;
        laser.visible = fan.visible = scanning;
        if (scanning) setLaser(sampled.positions[Math.min(n, POINT_COUNT - 1) * 3]);
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
        if (toIdx === 0) setPointsReveal(0); // the scan forms only after its wipe has landed
        // the tab + HUD follow the click at once (on slow GPUs the wipe itself can take >1s)
        setActiveStep(toIdx); setHud(STAGES[toIdx].hud);
        applyWipe(fromIdx, toIdx, 0);
      }

      function onStageChange(idx) { stageIdx = idx; setActiveStep(idx); setHud(STAGES[idx].hud); }

      function finishWipe(fromIdx, toIdx) {
        hideGroup(groups[fromIdx]); showGroupFull(groups[toIdx]);
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

      // manual tab click: direct wipe to the target stage, then hold ≥6s
      function gotoStage(targetIdx) {
        if (staticFrame) { snapToStage(targetIdx); return; }
        if (mode === "wipe") finishWipe(wipeFrom, wipeTo);
        if (targetIdx === stageIdx) { manualHoldFloor = phaseElapsed + 6000; return; }
        pendingHoldFloor = 6000;
        startWipe(stageIdx, targetIdx);
      }

      // reduced-motion / low-power path: one-shot, no animation, no rAF
      function snapToStage(targetIdx) {
        groups.forEach(function (g, i) { if (i === targetIdx) showGroupFull(g); else hideGroup(g); });
        if (targetIdx === 0) { setPointsReveal(1); }
        onStageChange(targetIdx);
        sizeToHost();
        renderer.render(scene, camera);
      }

      // ═══ camera rig: 3/4 product view, auto-rotate + mouse/pen drag orbit ═══
      var autoRotY = -0.55;
      var dragging = false, lastX = 0, lastY = 0, dragAz = 0, dragEl = 0, dragAzVel = 0, dragElVel = 0;
      var ELEV_MIN = -0.5, ELEV_MAX = 0.9;

      function onPointerDown(e) {
        if (staticFrame || e.pointerType === "touch") return;
        dragging = true; lastX = e.clientX; lastY = e.clientY; dragAzVel = 0; dragElVel = 0;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      }
      function onPointerMove(e) {
        if (!dragging) return;
        var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
        dragAzVel = dx * 0.0032; dragElVel = dy * 0.0032;
        dragAz += dragAzVel; dragEl = Math.max(ELEV_MIN, Math.min(ELEV_MAX, dragEl + dragElVel));
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

      // frame the part: fit its bounding sphere into the view with a little air
      function sizeToHost() {
        var w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
        var dpr = Math.min(window.devicePixelRatio || 1, w < 768 ? 1.5 : 2);
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // fit the arch itself, not its bounding sphere: it is ~2r wide and only ~0.6r tall
        var vFov = camera.fov * Math.PI / 180, hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
        var narrow = camera.aspect < 1.25;
        var dist = Math.max(radius * 0.96 / Math.tan(hFov / 2), radius * 0.62 / Math.tan(vFov / 2)) * (narrow ? 1.12 : 1.0);
        var dir = new THREE.Vector3(0, 0.36, 1).normalize();
        camera.position.copy(dir.multiplyScalar(dist));
        // on a square/portrait panel push the part down, clear of the HUD
        camera.lookAt(0, narrow ? radius * 0.16 : radius * 0.05, 0);
        camera.near = Math.max(1, dist - radius * 3); camera.far = dist + radius * 3;
        camera.updateProjectionMatrix();
        // keep scan points ~2px on screen whatever the panel size
        ptsMat.size = 1.9 * dist / (h * 0.5) * (w < 768 ? 1.15 : 1);
      }
      sizeToHost();

      // ═══ static branch: stage 4, single paint, zero rAF ═══
      if (staticFrame) {
        root.rotation.y = autoRotY;
        snapToStage(3);
        var fadeRafS = requestAnimationFrame(function () { canvas.style.opacity = "1"; setReady(true); });
        engineRef.current = { gotoStage: gotoStage };
        var roS = null;
        if ("ResizeObserver" in window) { roS = new ResizeObserver(function () { sizeToHost(); renderer.render(scene, camera); }); roS.observe(el); }
        else window.addEventListener("resize", sizeToHost);
        cleanup = function () {
          if (fadeRafS) cancelAnimationFrame(fadeRafS);
          if (roS) roS.disconnect(); else window.removeEventListener("resize", sizeToHost);
          disposeObject3D(model); dotTex.dispose(); shadowTex.dispose(); envTex.dispose();
          try { renderer.forceContextLoss(); } catch (e) {}
          renderer.dispose();
          if (el && el.contains(canvas)) el.removeChild(canvas);
        };
        return;
      }

      // ═══ animated branch ═══
      var visible = true, raf = null, lastNow = null;
      var FRAME_MS = 16.6667, DAMP = 0.92;

      function loop(now) {
        if (!mounted) return;
        var dt = lastNow == null ? FRAME_MS : Math.min(now - lastNow, 50);
        lastNow = now;
        autoRotY += 0.12 * (dt / 1000);
        if (!dragging) {
          var decay = Math.pow(DAMP, dt / FRAME_MS);
          dragAzVel *= decay; dragElVel *= decay;
          dragAz += dragAzVel; dragEl = Math.max(ELEV_MIN, Math.min(ELEV_MAX, dragEl + dragElVel));
        }
        root.rotation.y = autoRotY + dragAz;
        root.rotation.x = dragEl;
        advanceTimeline(dt);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      }
      function startLoop() { if (raf || !visible || document.hidden) return; lastNow = null; raf = requestAnimationFrame(loop); }
      function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

      root.rotation.y = autoRotY;
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
        disposeObject3D(model); dotTex.dispose(); shadowTex.dispose(); envTex.dispose();
        try { renderer.forceContextLoss(); } catch (e) {}
        renderer.dispose();
        if (el && el.contains(canvas)) el.removeChild(canvas);
      };
      });
    }   // end boot()

    if ("IntersectionObserver" in window) {
      startIO = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && startIO) { startIO.disconnect(); startIO = null; boot(); } });
      }, { rootMargin: "300px" });
      startIO.observe(el);
    } else { boot(); }

    return function () { mounted = false; if (startIO) startIO.disconnect(); engineRef.current = null; if (cleanup) cleanup(); };
  }, []);

  function handleTabClick(i) {
    if (engineRef.current) engineRef.current.gotoStage(i);
    else { setActiveStep(i); setHud(STAGES[i].hud); }
  }

  return (
    <div
      ref={host}
      style={{
        position: "relative", width: "100%", height: "100%", minHeight: 360, overflow: "hidden",
        // studio sweep: a soft top light falling off into the page's carbon black
        background: "radial-gradient(ellipse 85% 70% at 50% 38%, #23282d 0%, #15181b 46%, " + BASE + " 100%)"
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
                  fontFamily: MONO, fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase",
                  padding: "7px 11px", background: isActive ? "rgba(" + CR + ",.1)" : "rgba(10,12,14,.55)",
                  border: "1px solid " + (isActive ? "rgba(" + CR + ",.55)" : "rgba(245,245,240,.12)"),
                  color: isActive ? C : "#9AA5AC", cursor: "pointer", transition: "color .2s " + EASE + ",border-color .2s " + EASE
                }}
              >
                {String(i + 1).padStart(2, "0") + " " + s.label}
              </button>
            );
          })}
        </div>
        <div aria-live="polite" style={{ fontFamily: MONO, fontSize: 9, letterSpacing: ".06em", color: "#9AA5AC", lineHeight: 1.75, textShadow: "0 1px 6px rgba(0,0,0,.8)" }}>
          {hud.map(function (line, i) {
            return <div key={i} style={{ color: i === 0 ? C : "#9AA5AC" }}>{line}</div>;
          })}
        </div>
      </div>
      <div aria-hidden="true" style={{ position: "absolute", bottom: 10, right: 14, zIndex: 2, fontFamily: MONO, fontSize: 8, letterSpacing: ".2em", color: INK2, opacity: ready ? 0.7 : 0 }}>
        REVERSE LAB · PROCESS VISUALIZATION · DRAG TO ORBIT
      </div>
    </div>
  );
}
