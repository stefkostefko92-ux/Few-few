// The brackets of a design's rails from one place (round 37): the last length of rail never so short that its joint's
// fishplate or its top bracket would not find it, no bracket off the rail; the counts the plans write at each level
// (the headroom's walls from the top floor up) adding up to the rail's; a side counterweight's bridge at the
// counterweight rails' brackets with the car rail it carries at the same heights.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FISHPLATES, KV_VERT, RAIL_LENGTH, defaultInputs, layout, planEntities, railSpan, section, type ShaftInputs } from '../index';
import { BRACKET_H, bracketHeights, lastPieceMin, plateKeep, railPieces } from '../brackets';
import { headOf } from '../head';
import { NO_PANEV, cwPlanCode } from '../plan-staffe';
import { bridgeHeights, designPieces, headFrom, levelHeights, maxSpanOf, onBridge, railHeights, wallCarRail } from '../rail-brackets';
import { carBracketCode } from '../staffe-cabina';
import type { HeadWalls, Layout } from '../types';

const base = defaultInputs(1600, 1750);
const withRises = (I: ShaftInputs, rises: readonly number[]): ShaftInputs => ({
  ...I, vertical: { ...I.vertical, main: 0, floors: [...rises, 0].map((rise, i) => ({ label: String(i), rise, door: 'A' })) },
});
const withHead = (h: Partial<HeadWalls>, I: ShaftInputs = base): ShaftInputs => ({ ...I, head: { front: 0, rear: 0, left: 0, right: 0, ...h } });
const count = (code: string | null): number => Number(/^(\d+)× /.exec(code ?? '')?.[1] ?? 0);

test('ultimo spezzone: mai più corto della piastra e della sua staffa, il primo accorciato al suo posto', () => {
  // 15030 mm: 5000 + 5000 + 5000 + 30 left a 30 mm piece under a 250 mm fishplate; now the first is cut instead
  assert.deepEqual(railPieces(0, 15030, 365), { pieces: [4665, 5000, 5000, 365], joints: [4665, 9665, 14665] });
  assert.deepEqual(railPieces(0, 15150, 365), { pieces: [4785, 5000, 5000, 365], joints: [4785, 9785, 14785] });
  // a last piece long enough, a rail of one piece: as before
  assert.deepEqual(railPieces(0, 15400, 365), { pieces: [5000, 5000, 5000, 400], joints: [5000, 10000, 15000] });
  assert.deepEqual(railPieces(0, 3000, 365), { pieces: [3000], joints: [] });
  // the shortest last piece: half the longest fishplate of the design, the clearance, a bracket
  assert.equal(lastPieceMin('T70-1/A'), FISHPLATES['T70-1/A'].l / 2 + 90 + BRACKET_H);
  assert.equal(lastPieceMin(['T45/A', 'T89/B']), Math.ceil(FISHPLATES['T89/B'].l / 2 + 90 + BRACKET_H));
});

test('staffe: mai fuori dalla guida né sulla piastra, per ogni altezza dell’ultimo piano (W2-G7-02)', () => {
  for (let last = 2600; last <= 4600; last += 10) {
    const L = layout(withRises(base, [3000, 3000, last])), [z0, z1] = railSpan(section(L)), { pieces, joints } = designPieces(L);
    // as many bars and joints as the span needs, the last at least lastPieceMin
    assert.equal(pieces.length, Math.ceil((z1 - z0) / RAIL_LENGTH - 1e-9), `${last}`);
    assert.ok(Math.abs(pieces.reduce((a, b) => a + b, 0) - (z1 - z0)) < 1e-6);
    if (pieces.length > 1) assert.ok((pieces.at(-1) ?? 0) >= lastPieceMin([L.inputs.carRail, L.inputs.cwRail]) - 1e-6, `${last}: ${pieces.join('+')}`);
    for (const r of L.rails) {
      const hs = railHeights(L, r), type = r.kind === 'car' ? L.inputs.carRail : L.inputs.cwRail, keep = plateKeep(type);
      for (const h of hs) {
        assert.ok(h >= z0 - 1e-6 && h + BRACKET_H <= z1 + 1e-6, `${last} ${r.kind}: ${h} off ${z0}…${z1}`);
        for (const j of joints) assert.ok(Math.abs(h + BRACKET_H / 2 - j) >= keep - 1e-6, `${last} ${r.kind}: ${h} on ${j}`);
      }
    }
  }
  // the auditors' two cases: 3980 (a 30 mm piece) and 4100 (a bracket 140 mm over the rail's top)
  for (const last of [3980, 4100]) {
    const L = layout(withRises(base, [3000, 3000, last])), [, z1] = railSpan(section(L)), car = wallCarRail(L);
    assert.ok(car);
    assert.ok((railHeights(L, car).at(-1) ?? Infinity) + BRACKET_H <= z1, `${last}`);
    assert.equal(designPieces(L).pieces.at(-1), lastPieceMin([L.inputs.carRail, L.inputs.cwRail]));
  }
  // a bracket that would have to step off a fishplate past the rail's end takes the other side
  assert.ok(bracketHeights(0, 5400, 'T70-1/A', 2000, [5000]).every((h) => h + BRACKET_H <= 5400));
});

test('testata: le piante contano le staffe alle loro pareti, insieme quelle della guida (W2-L1b-01)', () => {
  const I = withHead({ rear: -10 }), L = layout(I), zHead = headFrom(L);
  assert.equal(zHead, section(L).levels.at(-1));
  for (const r of L.rails.filter((x) => x.kind === 'cw')) {
    const all = railHeights(L, r), main = levelHeights(L, r, false), up = levelHeights(L, r, true);
    assert.equal(main.length + up.length, all.length);
    assert.ok(up.length > 0 && up.every((h) => h >= zHead) && main.every((h) => h < zHead));
    // the plan at the main floor and the plan in the headroom write their own count, the two together the rail's
    assert.equal(count(cwPlanCode(L, r)) + count(cwPlanCode(L, r, headOf(I))), all.length);
  }
  const car = wallCarRail(L);
  assert.ok(car);
  assert.equal(count(carBracketCode(L)) + count(carBracketCode(L, true)), railHeights(L, car).length);
  // the plans themselves: the headroom's labels its brackets, the main floor's its own
  const codes = (level: 'top' | 'main'): string[] => planEntities(L, level, level === 'top' ? I.vertical.floors.length - 1 : 0)
    .flatMap((e) => (e.e === 'text' && /^\d+× /.test(e.text) ? [e.text] : []));
  assert.ok(codes('top').every((t) => count(t) === levelHeights(L, car, true).length), codes('top').join(' | '));
  assert.ok(codes('main').every((t) => count(t) === levelHeights(L, car, false).length), codes('main').join(' | '));
  // without walls elsewhere every plan counts every bracket, as before
  const L0 = layout(base), r0 = L0.rails.find((x) => x.kind === 'cw');
  assert.ok(r0);
  assert.equal(count(cwPlanCode(L0, r0, headOf(base))), railHeights(L0, r0).length);
  assert.equal(count(cwPlanCode(L0, r0)), railHeights(L0, r0).length);
});

test('testata senza staffa Panev: la pianta lo scrive, non tace (W2-L1b-01)', () => {
  const I = withHead({ rear: 110 }), L = layout(I), r = L.rails.find((x) => x.kind === 'cw');
  assert.ok(r);
  assert.equal(cwPlanCode(L, r, headOf(I)), `${levelHeights(L, r, true).length}× ${NO_PANEV}`);
  assert.ok(planEntities(L, 'top', I.vertical.floors.length - 1).some((e) => e.e === 'text' && e.text.endsWith(NO_PANEV)), 'sigla nella pianta in testata');
});

test('contrappeso laterale: la staffa a ponte alle staffe del contrappeso, la guida di cabina sul ponte alle stesse quote (W2-G7-03)', () => {
  for (const cw of ['left', 'right'] as const) {
    const L: Layout = layout({ ...base, cw }), [z0, z1] = railSpan(section(L)), bh = bridgeHeights(L), { joints } = designPieces(L);
    assert.ok(L.bridge && bh.length > 0, cw);
    const on = L.rails.filter((r) => onBridge(L, r)), wall = wallCarRail(L);
    assert.equal(on.length, 1, cw);
    assert.ok(wall && !onBridge(L, wall));
    for (const r of [...on, ...L.rails.filter((x) => x.kind === 'cw')]) assert.deepEqual(railHeights(L, r), bh, `${cw} ${r.kind}`);
    // clear of the fishplates of both the counterweight rails and the car rail it carries
    const keep = plateKeep([L.inputs.carRail, L.inputs.cwRail]);
    for (const h of bh) {
      assert.ok(h >= z0 && h + BRACKET_H <= z1);
      for (const j of joints) assert.ok(Math.abs(h + BRACKET_H / 2 - j) >= keep - 1e-6);
    }
    // the car rails' l: the longest interval on either of them
    assert.equal(maxSpanOf(L, 'car'), Math.max(...L.rails.filter((r) => r.kind === 'car').flatMap((r) => {
      const hs = railHeights(L, r);
      return hs.slice(1).map((h, i) => h - (hs[i] ?? h));
    })));
  }
  // at the closer of two declared pitches
  const L = layout({ ...base, cw: 'left' }), P = { ...L, carBracketPitch: 1500, cwBracketPitch: 2500 };
  assert.ok(bridgeHeights(P).length > bridgeHeights({ ...L, cwBracketPitch: 2500 }).length);
  assert.equal(KV_VERT.bracketPitch, 2000);
  assert.deepEqual(bridgeHeights(layout(base)), []);
});
