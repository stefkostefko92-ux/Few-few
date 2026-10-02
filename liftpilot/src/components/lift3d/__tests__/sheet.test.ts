// The Panev brackets built by the sheet-metal engine (sheet/): every part is one closed solid, oriented outward (each
// edge shared by two triangles running opposite ways, a positive volume), with the catalogue's outer sizes; A cut to a
// sill's depth keeps its joint to B and only the sill slots that fit.
// Motion: none, nothing is drawn here; the scene's prefers-reduced-motion handling is in LiftStage.tsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type * as THREE from 'three/webgpu';
import { A_LEGS, B_SECTIONS, bracketB, guideSG, plateA, supportArm, supportSliding } from '../sheet/panev';
import { DOOR_PAIRS, SC_SUPPORTS, doorPair } from '@/shaft';
import type { Sheet } from '../sheet/part';

/** Welded vertex count, open and non-manifold edges, volume [mm³] and size [mm] of the part's two geometries. */
function analyse(geos: readonly THREE.BufferGeometry[]): { open: number; bad: number; volume: number; size: number[] } {
  const key = (x: number, y: number, z: number): string => `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;
  const ids = new Map<string, number>(), edges = new Map<string, number>(), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let volume = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position'), index = g.getIndex();
    if (!index) continue;
    const id = (i: number): number => {
      const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (!ids.has(k)) ids.set(k, ids.size);
      return ids.get(k) ?? -1;
    };
    for (let i = 0; i < pos.count; i++) {
      const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], p[a] * 1000);
        max[a] = Math.max(max[a], p[a] * 1000);
      }
    }
    for (let i = 0; i < index.count; i += 3) {
      const [a, b, c] = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      const [A, B, C] = [id(a), id(b), id(c)];
      if (A === B || B === C || A === C) continue;
      for (const [u, v] of [[A, B], [B, C], [C, A]]) edges.set(`${u}>${v}`, (edges.get(`${u}>${v}`) ?? 0) + 1);
      const [ax, ay, az] = [pos.getX(a), pos.getY(a), pos.getZ(a)].map((v) => v * 1000);
      const [bx, by, bz] = [pos.getX(b), pos.getY(b), pos.getZ(b)].map((v) => v * 1000);
      const [cx, cy, cz] = [pos.getX(c), pos.getY(c), pos.getZ(c)].map((v) => v * 1000);
      volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
  }
  let open = 0, bad = 0;
  for (const [k, n] of edges) {
    const [u, v] = k.split('>');
    if (n > 1) bad += 1;
    else if (edges.get(`${v}>${u}`) !== 1) open += 1;
  }
  return { open, bad, volume, size: max.map((m, a) => Math.round(m - min[a])) };
}

const solid = (name: string, part: Sheet, size: readonly number[]): void => {
  const r = analyse(part.build().geometries());
  assert.equal(r.open, 0, `${name}: open edges`);
  assert.equal(r.bad, 0, `${name}: edges shared by more than two triangles`);
  assert.ok(r.volume > 0, `${name}: the solid faces inward`);
  assert.deepEqual([...r.size].sort((a, b) => a - b), [...size].sort((a, b) => a - b), `${name}: outer size`);
};

test('staffe Panev: piastra A e staffa B, intere e A tagliata alla soglia', () => {
  solid('B 65 320', bracketB(65, 320), [65, 320, 65]);
  solid('B 45 220', bracketB(45, 220), [60, 220, 45]);
  solid('B 37 320', bracketB(37, 320), [60, 320, 37]);
  solid('A 65 170 7', plateA(65, 170, 75, 'cross', 7), [170, 75, 165]);
  solid('A 45 175 2', plateA(45, 175, 60, 'long'), [175, 60, 140]);
  solid('A 65 170 7 tagliata a 75', plateA(65, 170, 75, 'cross', 7, 75), [75, 75, 165]);
  solid('A 37 150 7 tagliata a 60', plateA(37, 150, 70, 'cross', 6, 60), [60, 70, 120]);
});

test('staffe Panev: supporti SU, SD, SC e staffa guida SG', () => {
  solid('SU 220 160', supportArm('SU', 160), [220, 160, 65]);
  solid('SD 150 200', supportArm('SD150', 200), [150, 200, 65]);
  solid('SD 220 180', supportArm('SD220', 180), [220, 180, 65]);
  solid('SC 50 200', supportSliding(50, 200), [200, 50, 65]);
  solid('SC 80 220', supportSliding(80, 220), [220, 80, 65]);
  solid('SG 80 150', guideSG(80, 150), [150, 80, 50]);
  solid('SG 50 190', guideSG(50, 190), [190, 50, 50]);
});

test('staffe Panev: ogni articolo che un progetto può prendere è un corpo chiuso delle misure del catalogo', () => {
  for (const id of DOOR_PAIRS) {
    const { a, b } = doorPair(id), s = B_SECTIONS[a.section];
    solid(a.code, plateA(a.section, a.length, a.width, a.slots, a.count), [a.length, a.width, A_LEGS[a.section].legIn[1]]);
    solid(b.code, bracketB(a.section, b.length), [s.face, b.length, s.rib]);
  }
  for (const sc of SC_SUPPORTS) {
    solid(sc.code, supportSliding(sc.W, sc.L), [sc.L, sc.W, 65]);
    solid(`SG ${sc.sg.w} ${sc.sg.l}`, guideSG(sc.sg.w, sc.sg.l), [sc.sg.l, sc.sg.w, 50]);
  }
});
