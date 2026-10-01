// A growable triangle mesh with two groups: 0 the coated surfaces (faces and bends), 1 the cut edges (walls round the
// outlines and the holes). Positions in millimetres. Ported from Panev's 3D catalogue (panev/3d/src/geo/mesh.js).
import * as THREE from 'three/webgpu';

export type V3 = [number, number, number];
export const ZINC = 0, EDGE = 1;

export class MeshBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly idx: [number[], number[]] = [[], []];

  get count(): number {
    return this.pos.length / 3;
  }

  vertex(p: V3, n: V3): number {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    return this.count - 1;
  }

  /** Triangle a, b, c, its winding turned to face `facing` (the intended outward normal). */
  tri(group: 0 | 1, a: number, b: number, c: number, facing: V3): void {
    const P = this.pos;
    const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
    const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * facing[0] + ny * facing[1] + nz * facing[2] < 0) this.idx[group].push(a, c, b);
    else this.idx[group].push(a, b, c);
  }

  /** Quad a-b-c-d (in order round its border), split along the shorter diagonal. */
  quad(group: 0 | 1, a: number, b: number, c: number, d: number, facing: V3): void {
    const P = this.pos;
    const d2 = (i: number, j: number): number => (P[i * 3] - P[j * 3]) ** 2 + (P[i * 3 + 1] - P[j * 3 + 1]) ** 2 + (P[i * 3 + 2] - P[j * 3 + 2]) ** 2;
    if (d2(a, c) <= d2(b, d)) {
      this.tri(group, a, b, c, facing);
      this.tri(group, a, c, d, facing);
    } else {
      this.tri(group, a, b, d, facing);
      this.tri(group, b, c, d, facing);
    }
  }

  /** One geometry per group, each with only its own vertices, in metres (millimetres × 0.001), with planar texture
   *  coordinates (the batch merges it with parts that have them). */
  geometries(): [THREE.BufferGeometry, THREE.BufferGeometry] {
    const make = (tris: number[]): THREE.BufferGeometry => {
      const map = new Map<number, number>(), pos: number[] = [], nor: number[] = [], uv: number[] = [], index: number[] = [];
      for (const v of tris) {
        let k = map.get(v);
        if (k === undefined) {
          k = map.size;
          map.set(v, k);
          const x = this.pos[v * 3] / 1000, y = this.pos[v * 3 + 1] / 1000, z = this.pos[v * 3 + 2] / 1000;
          pos.push(x, y, z);
          nor.push(this.nor[v * 3], this.nor[v * 3 + 1], this.nor[v * 3 + 2]);
          uv.push(x + z, y);
        }
        index.push(k);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(index);
      return geo;
    };
    return [make(this.idx[ZINC]), make(this.idx[EDGE])];
  }
}
