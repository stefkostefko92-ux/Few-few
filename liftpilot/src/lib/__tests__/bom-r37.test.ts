// The bill of materials after round 37: Panev's landing-door pairs go with the landing doors and the counterweight
// rails' brackets with the rails, in the bill and in the Panev table alike (a modification tested to UNI 10411 counts
// the parts it replaces); the N1 clips on every SG; the bearing plates under the HEB beams; with the machine under the
// pit the counterweight's safety gear and what trips it — its own governor on sheet 1 and in the bill, the device on
// the suspension's breakage, the safety rope —; a machine replacement says which replaced parts it cannot count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type PanevBom from '@/components/shaft/PanevBom';
import { panevBom } from '@/lib/catalog/panev';
import { defaultLift, deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { PARTI, collaudoOf, type Collaudo, type Parte } from '@/lib/lift/collaudo';
import type { LiftDerived } from '@/lib/lift/derive';
import { valueMarks } from '@/lib/lift/marks';
import { governorRopeLength } from '@/lib/lift/support';
import type { Plant } from '@/lib/plant';
import { analyse } from '@/lib/present/analysis';
import { HEB_PLATE_KEY, N1_KEY, PRICE_ARTICLES, hebPlateSize, priceArticle } from '@/lib/prices/articles';
import { calcBom, calcUncounted, designBom } from '@/lib/prices/bom';
import type { BomLine } from '@/lib/prices/cost';
import { panevCounted, panevPart } from '@/lib/prices/parts';
import { deriveRoom } from '@/lib/room/derive';
import { startSurvey } from '@/lib/room/survey';
import { storedInput } from '@/lib/tavole/compose';
import { cwTripOf } from '@/lib/tavole/cw-gear';
import { dataSheet } from '@/lib/tavole/data';
import { section } from '@/shaft';
import { govSize } from '@/shaft/governor';
import { KV_VERT } from '@/shaft/norme-vert';
import { N1_PER_SG } from '@/shaft/staffe';
import it from '../../../messages/it.json';
import en from '../../../messages/en.json';
import bg from '../../../messages/bg.json';

const qty = (bom: readonly BomLine[], key: string): number => bom.find((l) => l.key === key)?.qty ?? 0;
const panevKeys = (bom: readonly BomLine[]): Map<string, number> => new Map(bom.filter((l) => l.key?.startsWith('panev:')).map((l) => [l.key ?? '', l.qty]));
const modification = (dv: LiftDerived, parti: readonly Parte[]): LiftDerived => ({ ...dv, collaudo: { ...dv.collaudo, norma: '10411-1', parti } });
const SET = { number: '26-037', createdAt: new Date('2026-10-09T10:00:00Z'), authorInitials: 'T', companyName: 'X', revisions: [],
  projectData: { name: 'x', address: null, city: null, province: null, plantNumber: null, client: null } };

/** Sheet 1's specs of a design with the data of the installation `plant`. */
function specs(inp: LiftInputs, plant: Plant): Map<string, string> {
  const d = deriveLift(inp), x = storedInput(d.values, d.layout, { ...SET, plant }, null, valueMarks(inp.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return new Map(dataSheet(x, analyse(d.values), 9).sheet.specs.map((r) => [r[0], r[2]]));
}

test('W2-G7-01: the landing doors’ Panev pairs go with the landing doors, the counterweight rails’ brackets with the rails', () => {
  const dv = deriveLift(defaultLift()), rows = panevBom(dv.layout).rows;
  const door = rows.filter((r) => r.use === 'door'), cw = rows.filter((r) => r.use === 'cw');
  assert.ok(door.length && cw.length, 'pairs under the sills and brackets on the counterweight rails');
  // one row per use and article: a door's never merges with a rail's
  assert.equal(new Set(rows.map((r) => `${r.use} ${r.article.code}`)).size, rows.length);
  assert.ok(door.every((r) => panevPart(r.use) === 'landingDoors') && cw.every((r) => panevPart(r.use) === 'rails'));
  // new landing doors: their pairs with them, nothing of the rails that stay
  const doors = panevKeys(designBom(modification(dv, ['machine', 'landingDoors'])));
  assert.deepEqual([...doors.keys()].sort(), door.map((r) => `panev:${r.article.code}`).sort());
  for (const r of door) assert.equal(doors.get(`panev:${r.article.code}`), r.qty, r.article.code);
  // new rails: their brackets, none of the doors that stay
  const rails = designBom(modification(dv, ['machine', 'rails']));
  assert.deepEqual([...panevKeys(rails).keys()].sort(), cw.map((r) => `panev:${r.article.code}`).sort());
  assert.ok(qty(rails, N1_KEY) > 0);
  // the machine alone: none; a new lift: every one
  assert.equal(panevKeys(designBom(modification(dv, ['machine']))).size, 0);
  const all = panevKeys(designBom({ ...dv, collaudo: { norma: 'en81', parti: PARTI } }));
  for (const r of rows) assert.equal(all.get(`panev:${r.article.code}`), r.qty, r.article.code);
});

test('W2-G7-05: the Panev table counts with the acceptance test, as the bill', () => {
  const dv = deriveLift(defaultLift()), pb = panevBom(dv.layout);
  // a shaft design alone, and a new lift: every row
  assert.deepEqual(panevCounted(pb, null), pb);
  assert.deepEqual(panevCounted(pb, { norma: 'en81', parti: PARTI }).rows, pb.rows);
  // the machine alone: nothing (the panel is not drawn), as the bill; the doors or the rails: theirs
  const parts: readonly (readonly Parte[])[] = [['machine'], ['machine', 'landingDoors'], ['machine', 'rails'], ['machine', 'landingDoors', 'rails']];
  for (const parti of parts) {
    const C: Collaudo = { norma: '10411-1', parti }, shown = panevCounted(pb, C), bill = panevKeys(designBom(modification(dv, parti)));
    assert.deepEqual(new Map(shown.rows.map((r) => [`panev:${r.article.code}`, r.qty])), bill, parti.join(','));
    if (!parti.includes('rails')) assert.equal(shown.missing, 0);
  }
  assert.equal(panevCounted(pb, { norma: '10411-1', parti: ['machine'] }).rows.length, 0);
  // the table's acceptance test is required (tsc fails here if it turns optional): no caller can forget it and show the
  // brackets of the parts a modification keeps; a shaft design alone passes null
  const required: Record<string, never> extends Pick<Parameters<typeof PanevBom>[0], 'C'> ? false : true = true;
  assert.equal(required, true);
  // the table's note on the rows left out, in the three languages
  for (const m of [it, en, bg]) assert.ok(m.bom.kept.includes('UNI 10411'));
});

test('W2-G7-06: two N1 clips on every SG of the counterweight rails, with the rails; anchors said to be left out', () => {
  const dv = deriveLift(newLift()), rows = panevBom(dv.layout).rows, bom = designBom(dv);
  const sg = rows.filter((r) => r.use === 'cw' && (r.article.kind === 'guideSG' || r.article.kind === 'madeSG')).reduce((n, r) => n + r.qty, 0);
  assert.ok(sg > 0);
  assert.equal(N1_PER_SG, 2);
  assert.equal(qty(bom, N1_KEY), N1_PER_SG * sg);
  assert.equal(priceArticle(N1_KEY)?.group, 'brackets');
  // generic counterweight brackets: no SG, no clip
  const generic = deriveLift({ ...newLift(), shaft: { ...newLift().shaft, cwBrackets: 'generic' } });
  assert.equal(qty(designBom(generic), N1_KEY), 0);
  // the rails kept in a modification: the clips stay with them
  assert.equal(qty(designBom(modification(dv, ['machine', 'landingDoors'])), N1_KEY), 0);
  // the cost's note says the clips are counted and the anchors and bolts are not: a new lift's and a modification's
  // (a lift design tested to UNI 10411 shows costNoteModification)
  for (const [m, w] of [[it, 'tasselli'], [en, 'anchors'], [bg, 'анкерите']] as const) {
    for (const note of [m.prices.costNoteDesign, m.prices.costNoteModification]) assert.ok(note.includes('N1') && note.includes(w), `${w}: ${note}`);
  }
});

test('W2-L1b-05: the bearing plate under each end of the HEB beams, in the design’s bill and in the replacement’s', () => {
  const b = newLift(), R = b.shaft.room;
  assert.ok(R);
  const dv = deriveLift({ ...b, shaft: { ...b.shaft, room: { ...R, heb: {} } } });
  assert.ok(dv.heb);
  const bom = designBom(dv), plates = 2 * dv.heb.chosen.at.length;
  assert.equal(plates, 4);
  assert.equal(qty(bom, HEB_PLATE_KEY), plates);
  assert.equal(hebPlateSize, `${KV_VERT.hebBearing} × ${KV_VERT.hebPlateW} × ${KV_VERT.hebPlateT}`);
  assert.equal(bom.find((l) => l.key === HEB_PLATE_KEY)?.label.name, hebPlateSize);
  assert.equal(qty(bom, `heb:${dv.heb.chosen.profile}`), (2 * dv.heb.chosen.length) / 1000);
  assert.equal(priceArticle(HEB_PLATE_KEY)?.group, 'supports');
  // none without the beams
  assert.equal(qty(designBom(deriveLift(newLift())), HEB_PLATE_KEY), 0);
  // the replacement's survey with the beams
  const V = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 }, s0 = startSurvey(780), room = deriveRoom(V, { ...s0, room: { ...s0.room, heb: {} } });
  assert.ok(room.heb);
  assert.equal(qty(calcBom(V, null, room), HEB_PLATE_KEY), 4);
  assert.equal(qty(calcBom(V, null, deriveRoom(V, s0)), HEB_PLATE_KEY), 0);
});

test('W2-G3-02: with the machine under the pit, the counterweight’s safety gear and what trips it — sheet 1 and the bill', () => {
  const under = (v: number): LiftInputs => {
    const b = newLift();
    return { ...b, calc: { ...b.calc, layout: 'bottom' }, shaft: { ...b.shaft, room: null, vertical: { ...b.shaft.vertical, v } }, bottom: 'under' };
  };
  // tripped by a governor (above 1 m/s): a second governor of the same model, with its tension weight and rope
  const fast = under(1.6), d = deriveLift(fast), g = govSize(1.6, d.shaft.governor), rope = governorRopeLength(d.shaft.vertical, section(d.layout).top, null, 'under');
  const byGov: Plant = { safetyGear: 'progressive', cwSafetyGear: 'progressive', cwGearTrip: 'governor' }, bom = designBom(d, byGov);
  assert.equal(cwTripOf(true, byGov), 'governor');
  assert.equal(qty(bom, `governor:${g.brand}:${g.model}`), 2);
  assert.equal(qty(bom, 'tension'), 2);
  assert.equal(qty(bom, `governor-rope:${2 * g.rope}`), 2 * rope);
  assert.equal(qty(bom, 'safety-gear-cw:progressive'), 1);
  assert.equal(qty(bom, 'safety-gear:progressive'), 1);
  const sheet = specs(fast, byGov);
  assert.equal(sheet.get('PARACADUTE CONTRAPPESO'), 'PROGRESSIVO DA LIMITATORE');
  assert.equal(sheet.get('LIMITATORE CONTRAPPESO'), `${g.brand} ${g.model}`);
  assert.equal(sheet.get('FUNE DEL LIMITATORE CONTRAPPESO'), sheet.get('FUNE DEL LIMITATORE'));
  assert.equal(sheet.get('FUNE DEL LIMITATORE'), `${rope} - ${2 * g.rope}`);
  // up to 1 m/s on the breakage of the suspension, or by a safety rope: the gear and its device, one governor
  const slow = deriveLift(under(1));
  const rupture = designBom(slow, { cwSafetyGear: 'instantaneous', cwGearTrip: 'rupture' });
  assert.equal(qty(rupture, 'safety-gear-cw:instantaneous'), 1);
  assert.equal(qty(rupture, 'cw-trip:rupture'), 1);
  assert.equal(qty(rupture, 'tension'), 1);
  const safetyRope = designBom(slow, { cwSafetyGear: 'roller', cwGearTrip: 'rope' });
  assert.equal(qty(safetyRope, 'safety-gear-cw:roller'), 1);
  assert.equal(safetyRope.find((l) => l.key === 'cw-trip:rope')?.unit, 'lot');
  assert.equal(specs(under(1), { cwSafetyGear: 'instantaneous', cwGearTrip: 'rupture' }).has('LIMITATORE CONTRAPPESO'), false);
  // the trip not yet given: the gear sheet 1 loads P7 with (progressive), nothing else; a pillar in its place: none
  const open = designBom(slow, {});
  assert.equal(qty(open, 'safety-gear-cw:progressive'), 1);
  assert.ok(!open.some((l) => l.key?.startsWith('cw-trip:')) && qty(open, 'tension') === 1);
  assert.ok(!designBom(slow, { cwSafetyGear: 'pillar' }).some((l) => l.key?.startsWith('safety-gear-cw:')));
  // no space under the shaft (the machine above, or below at the head): no counterweight gear whatever the data say
  for (const dv of [deriveLift(newLift()), deriveLift({ ...under(1.6), bottom: 'head' })]) {
    const b = designBom(dv, byGov);
    assert.ok(!b.some((l) => l.key?.startsWith('safety-gear-cw:')), String(dv.bottom));
    assert.equal(qty(b, 'tension'), 1);
  }
  // a modification: the counterweight's gear with the counterweight, its governor with the governors
  const kept = designBom(modification(d, ['machine', 'cw']), byGov);
  assert.equal(qty(kept, 'safety-gear-cw:progressive'), 1);
  assert.equal(qty(kept, 'tension'), 0);
  assert.equal(qty(designBom(modification(d, ['machine', 'governor']), byGov), 'tension'), 2);
  // every article the bill takes is in the price list, in the three languages
  for (const k of ['safety-gear-cw:progressive', 'safety-gear-cw:roller', 'safety-gear-cw:instantaneous', 'cw-trip:rupture', 'cw-trip:rope']) {
    const a = priceArticle(k);
    assert.ok(a, k);
    for (const m of [it, en, bg]) assert.ok((m.prices.items as Record<string, string>)[a.label.item], `${k}: ${a.label.item}`);
  }
});

test('W2-G7-04: a machine replacement names the replaced parts it cannot count', () => {
  const V = deriveLift(defaultLift()).values;
  assert.deepEqual(calcUncounted(null), { parts: [], newLift: false });
  assert.deepEqual(calcUncounted(collaudoOf(V, { norma: '10411-1', parti: ['machine', 'ropes', 'controller', 'speed', 'load', 'travel'] })).parts, []);
  const C = collaudoOf(V, { norma: '10411-1', parti: ['machine', 'ropes', 'governor', 'buffers', 'cw', 'sling', 'car'] });
  assert.deepEqual(calcUncounted(C), { parts: ['car', 'sling', 'cw', 'buffers', 'governor'], newLift: false });
  // what it counts: the ropes, not the others
  const bom = calcBom(V, C);
  assert.ok(bom.some((l) => l.key?.startsWith('rope:')) && !bom.some((l) => /^(governor|buffer|cw|sling|car)\b/.test(l.key ?? '')));
  assert.deepEqual(calcUncounted(collaudoOf(V, { norma: '10411-1', parti: ['machine', 'landingDoors', 'carDoors', 'rails'] })).parts, ['rails', 'landingDoors', 'carDoors']);
  // a new lift calculated without its design (a standalone calculation saved with context 'new'): nothing is replaced,
  // every part the design would count is new — named so, never as "replaced"
  const fresh = calcUncounted(collaudoOf({ ...V, context: 'new' }));
  assert.deepEqual(fresh, { parts: ['car', 'sling', 'cw', 'rails', 'landingDoors', 'carDoors', 'buffers', 'governor'], newLift: true });
  assert.equal(calcUncounted({ norma: 'en81', parti: ['machine', 'ropes', 'controller'] }).newLift, true);
  // the cost's warning names them with the acceptance test's words, in the three languages, a new lift's in words of
  // its own that never call them replaced
  for (const [m, w] of [[it, 'sostitu'], [en, 'replaced'], [bg, 'смен']] as const) {
    assert.ok(m.prices.uncounted.includes('{list}') && m.prices.uncountedNew.includes('{list}'));
    assert.ok(m.prices.uncounted.includes(w) && !m.prices.uncountedNew.includes(w), w);
    for (const p of PARTI) assert.ok((m.lift as Record<string, string>)[`parte_${p}`], p);
  }
});

test('the new articles once each in the list, none with a price of its own', () => {
  for (const k of [HEB_PLATE_KEY, N1_KEY, 'safety-gear-cw:progressive', 'cw-trip:rupture', 'cw-trip:rope']) {
    assert.equal(PRICE_ARTICLES.filter((a) => a.key === k).length, 1, k);
    assert.equal(priceArticle(k)?.start, undefined, k);
  }
});
