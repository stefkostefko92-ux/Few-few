// Mesh toolkit for the head scan: reads the glTF binary, moves it into the rig's head frame,
// welds the UV seams for topology work and derives the per-vertex fields the skin shader needs
// (curvature for the pre-integrated scattering, thickness for light shining through the ears).

// glTF binary with a single indexed primitive (POSITION, NORMAL, TEXCOORD_0).
export function readGLB(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error('not a glTF binary');
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLen)));
  const bin = buf.subarray(20 + jsonLen + 8);
  const read = (i) => {
    const a = json.accessors[i];
    const bv = json.bufferViews[a.bufferView];
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const Ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    const start = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new Ctor(bin.buffer.slice(start, start + a.count * comps * Ctor.BYTES_PER_ELEMENT));
  };
  const prim = json.meshes[0].primitives[0];
  return {
    index: Uint32Array.from(read(prim.indices)),
    position: Float32Array.from(read(prim.attributes.POSITION)),
    normal: Float32Array.from(read(prim.attributes.NORMAL)),
    uv: Float32Array.from(read(prim.attributes.TEXCOORD_0)),
  };
}

// Scan units → metres in the head frame (origin at the rig's head joint, +Y up, +Z forward).
export function toHeadFrame(mesh, origin, scale) {
  const p = mesh.position;
  for (let i = 0; i < p.length; i += 3) {
    p[i] = (p[i] - origin[0]) * scale;
    p[i + 1] = (p[i + 1] - origin[1]) * scale;
    p[i + 2] = (p[i + 2] - origin[2]) * scale;
  }
}

// Vertices split only by UV seams share one representative, so topology ignores the seams.
export function weld(position) {
  const n = position.length / 3;
  const rep = new Int32Array(n);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(position[i * 3] * 1e6)},${Math.round(position[i * 3 + 1] * 1e6)},${Math.round(position[i * 3 + 2] * 1e6)}`;
    if (!seen.has(key)) seen.set(key, i);
    rep[i] = seen.get(key);
  }
  return rep;
}

export function adjacency(index, rep, n) {
  const adj = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < index.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = rep[index[t + e]];
      const b = rep[index[t + ((e + 1) % 3)]];
      adj[a].add(b);
      adj[b].add(a);
    }
  }
  return adj.map((s) => [...s]);
}

// Area-weighted smooth normals, identical on both sides of a UV seam.
export function vertexNormals(position, index, rep) {
  const n = position.length / 3;
  const acc = new Float64Array(n * 3);
  const P = position;
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t] * 3;
    const b = index[t + 1] * 3;
    const c = index[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [index[t], index[t + 1], index[t + 2]]) {
      const r = rep[v] * 3;
      acc[r] += nx;
      acc[r + 1] += ny;
      acc[r + 2] += nz;
    }
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = rep[i] * 3;
    const l = Math.hypot(acc[r], acc[r + 1], acc[r + 2]) || 1;
    out[i * 3] = acc[r] / l;
    out[i * 3 + 1] = acc[r + 1] / l;
    out[i * 3 + 2] = acc[r + 2] / l;
  }
  return out;
}

// Mean curvature magnitude (1/m) from the change of the normal along each edge, smoothed twice.
export function curvature(position, normal, adj, rep) {
  const n = position.length / 3;
  let k = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (rep[i] !== i) continue;
    let s = 0;
    for (const j of adj[i]) {
      const dp = Math.hypot(position[j * 3] - position[i * 3], position[j * 3 + 1] - position[i * 3 + 1], position[j * 3 + 2] - position[i * 3 + 2]);
      const dn = Math.hypot(normal[j * 3] - normal[i * 3], normal[j * 3 + 1] - normal[i * 3 + 1], normal[j * 3 + 2] - normal[i * 3 + 2]);
      s += dn / Math.max(dp, 1e-5);
    }
    k[i] = adj[i].length ? s / adj[i].length : 0;
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (rep[i] !== i) continue;
      let s = k[i];
      for (const j of adj[i]) s += k[j];
      next[i] = s / (adj[i].length + 1);
    }
    k = next;
  }
  for (let i = 0; i < n; i++) k[i] = k[rep[i]];
  return k;
}

// Uniform grid over the triangles, for short rays inside the head.
function triangleGrid(position, index, cell) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < position.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], position[i + a]);
      max[a] = Math.max(max[a], position[i + a]);
    }
  }
  const dims = min.map((m, a) => Math.max(1, Math.ceil((max[a] - m) / cell)));
  const cells = new Map();
  const at = (a, v) => Math.min(dims[a] - 1, Math.max(0, Math.floor((v - min[a]) / cell)));
  for (let t = 0; t < index.length; t += 3) {
    const lo = [0, 1, 2].map((a) => at(a, Math.min(position[index[t] * 3 + a], position[index[t + 1] * 3 + a], position[index[t + 2] * 3 + a])));
    const hi = [0, 1, 2].map((a) => at(a, Math.max(position[index[t] * 3 + a], position[index[t + 1] * 3 + a], position[index[t + 2] * 3 + a])));
    for (let x = lo[0]; x <= hi[0]; x++) {
      for (let y = lo[1]; y <= hi[1]; y++) {
        for (let z = lo[2]; z <= hi[2]; z++) {
          const key = (x * dims[1] + y) * dims[2] + z;
          if (!cells.has(key)) cells.set(key, []);
          cells.get(key).push(t);
        }
      }
    }
  }
  return { min, dims, cell, cells, at };
}

// Möller–Trumbore; returns the hit distance or Infinity.
function rayTriangle(o, d, P, index, t) {
  const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
  const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
  const e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const s = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
  const u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) * inv;
  if (u < 0 || u > 1) return Infinity;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return dist > 0 ? dist : Infinity;
}

// Distance through the flesh along the inward normal, capped at `maxDist` (m). Only a part the
// ray crosses once and leaves into open air counts as thin (ears, the rim of a nostril): an
// eyelid is thin too, but behind it lie the eye and the skull.
export function thickness(position, normal, index, maxDist = 0.03) {
  const grid = triangleGrid(position, index, 0.008);
  const n = position.length / 3;
  const out = new Float32Array(n);
  const step = grid.cell * 0.5;
  const steps = Math.ceil(maxDist / step);
  for (let i = 0; i < n; i++) {
    const d = [-normal[i * 3], -normal[i * 3 + 1], -normal[i * 3 + 2]];
    const o = [position[i * 3] + d[0] * 2e-4, position[i * 3 + 1] + d[1] * 2e-4, position[i * 3 + 2] + d[2] * 2e-4];
    const hits = new Set();
    const tested = new Set();
    for (let s = 0; s <= steps; s++) {
      const q = [0, 1, 2].map((a) => o[a] + d[a] * s * step);
      const key = (grid.at(0, q[0]) * grid.dims[1] + grid.at(1, q[1])) * grid.dims[2] + grid.at(2, q[2]);
      if (tested.has(key)) continue;
      tested.add(key);
      for (const t of grid.cells.get(key) ?? []) {
        const hit = rayTriangle(o, d, position, index, t);
        if (hit < maxDist) hits.add(Math.round(hit * 1e5));
      }
    }
    out[i] = hits.size === 1 ? [...hits][0] / 1e5 : maxDist;
  }
  return out;
}

// Keeps the triangles whose vertices all pass `keep(i)` and compacts every per-vertex array.
export function cropMesh(mesh, keep) {
  const n = mesh.position.length / 3;
  const tris = [];
  for (let t = 0; t < mesh.index.length; t += 3) {
    if (keep(mesh.index[t]) && keep(mesh.index[t + 1]) && keep(mesh.index[t + 2])) tris.push(mesh.index[t], mesh.index[t + 1], mesh.index[t + 2]);
  }
  const remap = new Int32Array(n).fill(-1);
  let m = 0;
  for (const v of tris) if (remap[v] < 0) remap[v] = m++;
  const out = { index: Uint32Array.from(tris, (v) => remap[v]) };
  for (const [name, arr] of Object.entries(mesh)) {
    if (name === 'index') continue;
    const size = arr.length / n;
    const next = new arr.constructor(m * size);
    for (let i = 0; i < n; i++) if (remap[i] >= 0) for (let k = 0; k < size; k++) next[remap[i] * size + k] = arr[i * size + k];
    out[name] = next;
  }
  return out;
}
