// The free area beside an outline shorter than the area on every side (round 37, W2-G4-02: a governor 400 × 300 had its
// area drawn 400 × 600 and written 500 × 600, the check reading the depth only): the area as long as it needs along a
// side's line past its ends, within the walls, its depth what stands beside that whole stretch leaves — the area the
// check reads is the area the plan hatches, 500 × 600 whichever way round.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ROOM, KV_VERT } from '../index';
import type { Box } from '../room-floor';
import { freeBeside } from '../room-free';

const R = { ...DEFAULT_ROOM, W: 1500, D: 1500 };
const sides = (b: Box): number[] => [b[2] - b[0], b[3] - b[1]].map(Math.round).sort((p, q) => p - q);
const GOV: Box = [600, 600, 900, 850];

test('superficie accanto a un ingombro più corto di 500 mm per lato: 500 × 600 per intero, non lunga quanto il lato', () => {
  const f = freeBeside(R, GOV, []);
  assert.deepEqual(sides(f.area), [KV_VERT.maintW, KV_VERT.maintD].sort((p, q) => p - q));
  assert.ok(f.depth >= f.need, `${f.depth} ≥ ${f.need}`);
  // the area against the outline, along all of the side it is beside, inside the room
  const [a0, a1, a2, a3] = f.area;
  assert.ok(a0 >= 0 && a1 >= 0 && a2 <= R.W && a3 <= R.D);
  const touches = a2 === GOV[0] || a0 === GOV[2] || a3 === GOV[1] || a1 === GOV[3];
  assert.ok(touches, JSON.stringify(f.area));
  const along = a2 === GOV[0] || a0 === GOV[2] ? [a1, a3, GOV[1], GOV[3]] : [a0, a2, GOV[0], GOV[2]];
  assert.ok(along[0] <= along[2] && along[1] >= along[3], 'lungo tutto il lato');
});

test('accanto a un lato corto: quello che sta oltre i suoi spigoli conta — la superficie non entra, la verifica non passa', () => {
  // four things off the corners, none beside a side's own length: until round 37 the depth to the walls (600) passed
  const corners: Box[] = [[300, 300, 590, 590], [910, 300, 1200, 590], [300, 860, 590, 1200], [910, 860, 1200, 1200]];
  const f = freeBeside(R, GOV, corners);
  assert.ok(f.depth < f.need, `${f.depth} < ${f.need}`);
  assert.equal(Math.round(f.depth), 10);
  // one corner left free: the area slides along the side's line to it, still beside the whole side
  const g = freeBeside(R, GOV, corners.slice(1));
  assert.ok(g.depth >= g.need, `${g.depth} ≥ ${g.need}`);
  assert.deepEqual(sides(g.area), [500, 600]);
});

test('vicino a un muro: la superficie resta nel locale, spostata lungo il lato', () => {
  const f = freeBeside(R, [0, 100, 300, 350], []);
  const [a0, a1, a2, a3] = f.area;
  assert.ok(a0 >= 0 && a1 >= 0 && a2 <= R.W && a3 <= R.D, JSON.stringify(f.area));
  assert.deepEqual(sides(f.area), [500, 600]);
});

test('un lato lungo almeno quanto la superficie: come sempre (il lato con più spazio, lunga quanto serve)', () => {
  const f = freeBeside(R, [500, 600, 1100, 900], []);
  assert.deepEqual(sides(f.area), [500, 600]);
  assert.ok(f.depth >= f.need);
});
