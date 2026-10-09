// Growable indexed triangle mesh with two material groups: 0 = coated surfaces (faces, bends,
// bevels), 1 = cut edges (walls around outlines and holes). Positions in millimetres.

export const ZINC = 0;
export const EDGE = 1;

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [[], []];
  }

  get count() {
    return this.pos.length / 3;
  }

  vertex(p, n, uv) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    return this.count - 1;
  }

  // Triangle a, b, c; its winding is flipped when it disagrees with the reference direction
  // `facing` (the intended outward normal), so callers never juggle orientation by hand.
  tri(group, a, b, c, facing) {
    if (facing) {
      const P = this.pos;
      const ux = P[b * 3] - P[a * 3];
      const uy = P[b * 3 + 1] - P[a * 3 + 1];
      const uz = P[b * 3 + 2] - P[a * 3 + 2];
      const vx = P[c * 3] - P[a * 3];
      const vy = P[c * 3 + 1] - P[a * 3 + 1];
      const vz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (nx * facing[0] + ny * facing[1] + nz * facing[2] < 0) {
        this.idx[group].push(a, c, b);
        return;
      }
    }
    this.idx[group].push(a, b, c);
  }

  // Quad a-b-c-d (in order around its border), split along the shorter diagonal.
  quad(group, a, b, c, d, facing) {
    const P = this.pos;
    const d2 = (i, j) => (P[i * 3] - P[j * 3]) ** 2 + (P[i * 3 + 1] - P[j * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[j * 3 + 2]) ** 2;
    if (d2(a, c) <= d2(b, d)) {
      this.tri(group, a, b, c, facing);
      this.tri(group, a, c, d, facing);
    } else {
      this.tri(group, a, b, d, facing);
      this.tri(group, b, c, d, facing);
    }
  }

  append(other) {
    const base = this.count;
    for (const v of other.pos) this.pos.push(v);
    for (const v of other.nor) this.nor.push(v);
    for (const v of other.uv) this.uv.push(v);
    for (let g = 0; g < 2; g++) for (const i of other.idx[g]) this.idx[g].push(i + base);
    return this;
  }

  // Mirror across x = 0 (DX ↔ SX): positions and normals flip x, triangles flip winding.
  mirrorX() {
    for (let i = 0; i < this.pos.length; i += 3) {
      this.pos[i] = -this.pos[i];
      this.nor[i] = -this.nor[i];
    }
    for (const g of this.idx) for (let i = 0; i < g.length; i += 3) [g[i + 1], g[i + 2]] = [g[i + 2], g[i + 1]];
    return this;
  }

  // Applies a rigid transform given as a 3x4 row-major matrix [r00 r01 r02 tx r10 ...].
  transform(m) {
    for (let i = 0; i < this.pos.length; i += 3) {
      const [x, y, z] = [this.pos[i], this.pos[i + 1], this.pos[i + 2]];
      this.pos[i] = m[0] * x + m[1] * y + m[2] * z + m[3];
      this.pos[i + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
      this.pos[i + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
      const [a, b, c] = [this.nor[i], this.nor[i + 1], this.nor[i + 2]];
      this.nor[i] = m[0] * a + m[1] * b + m[2] * c;
      this.nor[i + 1] = m[4] * a + m[5] * b + m[6] * c;
      this.nor[i + 2] = m[8] * a + m[9] * b + m[10] * c;
    }
    return this;
  }

  // Flat typed arrays with the groups laid out one after another (for BufferGeometry / glTF).
  build() {
    const index = new Uint32Array(this.idx[0].length + this.idx[1].length);
    index.set(this.idx[0], 0);
    index.set(this.idx[1], this.idx[0].length);
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      uv: new Float32Array(this.uv),
      index,
      groups: [
        { start: 0, count: this.idx[0].length, material: ZINC },
        { start: this.idx[0].length, count: this.idx[1].length, material: EDGE },
      ],
    };
  }
}
