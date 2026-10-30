// The pit's kit as one model for the plan, section A-A and the 3D (round 37): the ladder in use with its stiles over the
// sill clear of the landing doors' stacked panels (else under them, its stiles ending at the sill and a handhold asked
// on sheet 1), its rungs from the one flush with the sill down at the registry's pitch, the section drawing the stiles to
// their top with that height; the pit's lamp clear of the ladder and the box; the openings of the pit's slab under a
// machine below one rule (pitSlabHoles) for the plan and A-A, KV_VERT.holeGap round the ropes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Box, Chain, Entity } from '../../drawing';
import { defaultInputs, KV_VERT, layout, type ShaftInputs } from '../index';
import { ladderRungs, pitKit, pitKitSection } from '../pit-kit';
import { quad } from '../plan-walls';
import { pitHoles, rigPlan } from '../rig-view';
import { pitSlabHoles, type ShaftRig } from '../shaft-rig';
import { landingOf } from '../landing';
import type { Layout } from '../types';

const CASES: readonly (readonly [string, ShaftInputs])[] = [
  ['contrappeso sul fondo', defaultInputs(1600, 1750)],
  ['contrappeso a sinistra', { ...defaultInputs(1600, 1750), cw: 'left' }],
  ['contrappeso a destra, porte centrali', { ...defaultInputs(1600, 1750), cw: 'right', door: 'C2' }],
  ['accessi opposti', { ...defaultInputs(1600, 1750), entrances: 'opposite', D: 2000 }],
  ['accessi adiacenti', { ...defaultInputs(1900, 1900), entrances: 'adjacent', side2: 'right' }],
  ['fossa 1800', { ...defaultInputs(1600, 1750), vertical: { ...defaultInputs(1600, 1750).vertical, pit: 1800 } }],
  ['vano stretto', { ...defaultInputs(1450, 1500), Q: 400, access: 'none' }],
];

const boxOf = (pts: readonly (readonly [number, number])[]): Box => ({
  x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
});
const meet = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** The landing doors' frames with their panels stacked, on the shaft's side of their walls, in plan. */
const frames = (L: Layout): Box[] => L.doors.map((d) => boxOf(quad(L, d.wall, d.frame0, 0, d.frame1, L.inputs.landingDepth)));
const chains = (es: readonly Entity[]): Chain[] => es.flatMap((e) => (e.e === 'chain' ? [e.c] : []));

test('scala: i pioli dal primo a filo della soglia (F.5 d)) in giù al passo del registro, l’ultimo almeno mezzo passo sopra il fondo', () => {
  const p = KV_VERT.ladderPitch;
  assert.deepEqual(ladderRungs(1400), [0, -280, -560, -840, -1120]);
  for (let pit = 600; pit <= KV_VERT.pitLadderMax; pit += 50) {
    const r = ladderRungs(pit), last = r.at(-1) ?? 0;
    assert.equal(r[0], 0, `${pit}`);
    r.slice(1).forEach((z, i) => assert.equal(r[i] - z, p, `${pit}`));
    assert.ok(last + pit >= p / 2 && last - p + pit < p / 2, `${pit}: il più basso a ${last + pit} dal fondo`);
  }
});

test('scala in uso: i montanti sopra la soglia fuori dal pacco delle ante delle porte di piano; altrimenti fino alla soglia', () => {
  for (const [name, I] of CASES) {
    const L = layout(I), k = pitKit(L);
    assert.ok(k.ladder, name);
    if (k.ladderTop === KV_VERT.ladderOverSill) {
      for (const f of frames(L)) assert.ok(!meet(k.ladder.box, f), `${name}: i montanti nel pacco delle ante`);
    } else {
      // only when every place within reach stands under a frame
      assert.equal(k.ladderTop, 0, name);
      assert.ok(frames(L).some((f) => meet(k.ladder?.box ?? f, { x0: f.x0 - 15, y0: f.y0 - 15, x1: f.x1 + 15, y1: f.y1 + 15 })), name);
    }
    // in the pit clear of each landing sill with the plate under it (the car's entrance and toeSide each side)
    for (const d of L.doors) {
      const l = landingOf(d), sill = boxOf(quad(L, d.wall, Math.min(l.u0, d.u0 - KV_VERT.toeSide), 0, Math.max(l.u1, d.u1 + KV_VERT.toeSide), L.inputs.landingDepth));
      assert.ok(!meet(k.ladder.box, sill), `${name}: scala sotto la soglia`);
    }
  }
});

test('sezione A-A: la scala in uso fino alla cima dei montanti con la quota «Scala +1100», i pioli dove li mette il modello', () => {
  for (const [name, I] of CASES) {
    const L = layout(I), k = pitKit(L), pit = I.vertical.pit, es = pitKitSection(L, (x, z) => [x, z], -pit), b = k.ladder?.box;
    assert.ok(b, name);
    const outline = es.find((e) => e.e === 'path' && e.st !== 'outline');
    assert.ok(outline?.e === 'path', name);
    assert.deepEqual(outline.pts.map((p) => p[1]), [-pit, -pit, k.ladderTop, k.ladderTop], name);
    const rungs = es.flatMap((e) => (e.e === 'line' ? [e.a[1]] : []));
    assert.deepEqual(rungs, ladderRungs(pit), name);
    const top = chains(es).find((c) => c.text?.[0] === 'Scala +{v}');
    if (k.ladderTop > 0) {
      assert.deepEqual(top?.pts, [0, KV_VERT.ladderOverSill], name);
      assert.equal(top?.edit, undefined, `${name}: un riferimento, non si cambia`);
    } else assert.equal(top, undefined, name);
  }
  // past 2500 mm a door, no ladder in the section
  const D = defaultInputs(1600, 1750), deep = layout({ ...D, vertical: { ...D.vertical, pit: 2800 } });
  assert.equal(pitKit(deep).ladder, null);
  assert.ok(!pitKitSection(deep, (x, z) => [x, z], -2800).some((e) => e.e === 'text' && e.text === 'SCALA'));
});

test('lampada della fossa: con e senza scala, sotto il piano più basso, fuori da scala e pulsantiera', () => {
  const D = defaultInputs(1600, 1750);
  for (const [name, I] of [...CASES, ['fossa 2800', { ...D, vertical: { ...D.vertical, pit: 2800 } }] as const]) {
    const L = layout(I), k = pitKit(L), l = k.lamp;
    assert.ok(l, name);
    assert.ok(l.at + l.h / 2 < 0 && l.at - l.h / 2 > -I.vertical.pit, `${name}: ${l.at}`);
    for (const it of [k.ladder, k.box]) if (it) assert.ok(!meet(l.box, it.box), name);
  }
});

test('fori nella soletta della fossa (argano sotto la fossa): una regola per pianta e sezione A-A, a holeGap dalle funi', () => {
  const D = defaultInputs(1600, 1750), L0 = layout(D), g = KV_VERT.holeGap;
  const rig: ShaftRig = {
    scheme: 'under', head: [], hung: true, runs: [], down: [[886, 1669.5], [406, 1669.5]], across: [0, 1], downTo: -3668, ropes: 30.5, d: 10,
    car: null, cw: null, dead: [], governor: null, holes: [], ceiling: 15700, roof: 0,
  };
  const L: Layout = { ...L0, rig }, holes = pitSlabHoles(rig);
  assert.equal(holes.length, 2);
  for (const [i, h] of holes.entries()) {
    const b = boxOf(h), m = rig.down[i];
    // across the pack the rope's half and holeGap, along `across` the ropes' half width and holeGap
    assert.deepEqual([b.x0, b.x1, b.y0, b.y1].map((v) => Math.round(v * 10) / 10), [m[0] - rig.d / 2 - g, m[0] + rig.d / 2 + g, m[1] - rig.ropes - g, m[1] + rig.ropes + g]);
  }
  // the plan of the pit draws them, section A-A cuts the slab across the same depth
  const drawn = rigPlan(L, 'pit').flatMap((e) => (e.e === 'path' && e.st === 'thin' ? [JSON.stringify(e.pts)] : []));
  assert.deepEqual(drawn, holes.map((h) => JSON.stringify(h)));
  assert.deepEqual(pitHoles(L), holes.map((h) => [boxOf(h).y0, boxOf(h).y1]));
  // none for the other schemes
  assert.deepEqual(pitSlabHoles({ ...rig, scheme: 'head' }), []);
  assert.deepEqual(pitHoles({ ...L, rig: { ...rig, scheme: 'room' } }), []);
});
