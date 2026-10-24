// Solid checks for generated parts: vertices welded by position, every edge shared by exactly two
// triangles with opposite directions (closed, consistently oriented), enclosed volume and bounds.

export function analyse(mesh, tol = 1e-4) {
  const P = mesh.pos;
  const key = (i) => `${Math.round(P[i * 3] / tol)},${Math.round(P[i * 3 + 1] / tol)},${Math.round(P[i * 3 + 2] / tol)}`;
  const weld = new Map();
  const id = new Int32Array(P.length / 3);
  for (let i = 0; i < id.length; i++) {
    const k = key(i);
    if (!weld.has(k)) weld.set(k, weld.size);
    id[i] = weld.get(k);
  }
  const edges = new Map();
  let volume = 0;
  let tris = 0;
  let degenerate = 0;
  for (const g of mesh.idx) {
    for (let i = 0; i < g.length; i += 3) {
      const [a, b, c] = [g[i], g[i + 1], g[i + 2]];
      const [A, B, C] = [id[a], id[b], id[c]];
      tris++;
      if (A === B || B === C || A === C) {
        degenerate++;
        continue;
      }
      for (const [u, v] of [[A, B], [B, C], [C, A]]) {
        const k = `${u}>${v}`;
        edges.set(k, (edges.get(k) || 0) + 1);
      }
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
      const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
      volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
  }
  let open = 0;
  let nonManifold = 0;
  for (const [k, n] of edges) {
    const [u, v] = k.split('>');
    const back = edges.get(`${v}>${u}`) || 0;
    if (n > 1) nonManifold++;
    else if (back !== 1) open++;
  }
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], P[i + a]);
      max[a] = Math.max(max[a], P[i + a]);
    }
  }
  return { vertices: weld.size, tris, degenerate, open, nonManifold, volume, min, max, size: max.map((m, a) => m - min[a]) };
}
