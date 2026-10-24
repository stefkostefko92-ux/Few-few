// Verlet cape pinned to the shoulders, colliding with the body and blown by gusting wind.
import * as THREE from 'three';

export class Cape {
  constructor(material, { cols = 9, rows = 15, length = 1.0, flare = 0.7 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.length = length;
    this.flare = flare;
    const n = cols * rows;
    this.n = n;
    this.p = new Float32Array(n * 3);
    this.q = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const idx = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        uv[i * 2] = c / (cols - 1);
        uv[i * 2 + 1] = 1 - r / (rows - 1);
        if (r < rows - 1 && c < cols - 1) {
          const a = i;
          const b = i + 1;
          const d = i + cols;
          const e = d + 1;
          idx.push(a, d, b, b, d, e);
        }
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.posAttr);
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.constraints = [];
    this.ready = false;
    this.lastAnchor = new THREE.Vector3();
  }

  buildConstraints(anchors) {
    const { cols, rows } = this;
    const top = anchors[0].distanceTo(anchors[1]);
    const rv = this.length / (rows - 1);
    const rh = (r) => top * (1 + (this.flare * r) / (rows - 1));
    const C = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c < cols - 1) C.push(i, i + 1, rh(r));
        if (r < rows - 1) C.push(i, i + cols, rv);
        if (r < rows - 2) C.push(i, i + 2 * cols, rv * 2);
        if (r < rows - 1 && c < cols - 1) {
          const d = Math.hypot(rv, (rh(r) + rh(r + 1)) / 2);
          C.push(i, i + cols + 1, d);
          C.push(i + 1, i + cols, d);
        }
      }
    }
    this.constraints = Float32Array.from(C);
  }

  reset(anchors, back) {
    const { cols, rows, p, q } = this;
    if (!this.constraints.length) this.buildConstraints(anchors);
    const rv = this.length / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 3;
        const a = anchors[c];
        const spread = ((c - (cols - 1) / 2) / (cols - 1)) * this.flare * 0.5 * (r / (rows - 1));
        const x = a.x + back.x * 0.04 * r - back.z * spread;
        const z = a.z + back.z * 0.04 * r + back.x * spread;
        p[i] = x;
        p[i + 1] = a.y - rv * r;
        p[i + 2] = z;
        q[i] = x;
        q[i + 1] = p[i + 1];
        q[i + 2] = z;
      }
    }
    this.lastAnchor.copy(anchors[0]);
    this.ready = true;
  }

  step(dt, anchors, colliders, wind, back) {
    if (!this.ready || anchors[0].distanceTo(this.lastAnchor) > 0.6) this.reset(anchors, back);
    this.lastAnchor.copy(anchors[0]);
    if (dt <= 0) return;
    const { cols, n, p, q, constraints } = this;
    const sub = 2;
    const h = Math.min(dt, 1 / 30) / sub;
    const h2 = h * h;
    for (let s = 0; s < sub; s++) {
      for (let i = cols; i < n; i++) {
        const k = i * 3;
        const flutter = 0.6 + 0.4 * Math.sin(i * 1.7 + wind.phase * 3.1);
        for (let a = 0; a < 3; a++) {
          const cur = p[k + a];
          const vel = (cur - q[k + a]) * 0.986;
          q[k + a] = cur;
          const acc = a === 1 ? -9.81 + wind.y : (a === 0 ? wind.x : wind.z) * flutter;
          p[k + a] = cur + vel + acc * h2;
        }
      }
      for (let c = 0; c < cols; c++) {
        const k = c * 3;
        p[k] = anchors[c].x;
        p[k + 1] = anchors[c].y;
        p[k + 2] = anchors[c].z;
      }
      for (let it = 0; it < 4; it++) {
        for (let j = 0; j < constraints.length; j += 3) {
          const i1 = constraints[j];
          const i2 = constraints[j + 1];
          const rest = constraints[j + 2];
          const a = i1 * 3;
          const b = i2 * 3;
          const dx = p[b] - p[a];
          const dy = p[b + 1] - p[a + 1];
          const dz = p[b + 2] - p[a + 2];
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (len - rest) / len;
          const pinA = i1 < cols;
          const pinB = i2 < cols;
          const wa = pinA ? 0 : pinB ? 1 : 0.5;
          const wb = pinB ? 0 : pinA ? 1 : 0.5;
          p[a] += dx * diff * wa;
          p[a + 1] += dy * diff * wa;
          p[a + 2] += dz * diff * wa;
          p[b] -= dx * diff * wb;
          p[b + 1] -= dy * diff * wb;
          p[b + 2] -= dz * diff * wb;
        }
        for (let i = cols; i < n; i++) {
          const k = i * 3;
          for (const col of colliders) {
            const dx = p[k] - col.c.x;
            const dy = p[k + 1] - col.c.y;
            const dz = p[k + 2] - col.c.z;
            const r = col.r + 0.03;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < r * r) {
              const d = Math.sqrt(d2) || 1e-6;
              const push = (r - d) / d;
              p[k] += dx * push;
              p[k + 1] += dy * push;
              p[k + 2] += dz * push;
            }
          }
          if (p[k + 1] < 0.015) p[k + 1] = 0.015;
        }
      }
    }
    this.posAttr.array.set(p);
    this.posAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
