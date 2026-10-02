// The company's price list: every article once, Panev's starting from the 2026 list, prices typed in each language's
// way, the cost of a design's articles with the quantities the design has, the plant counted from the design, the
// replacement's parts, the company's free lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { PANEV_ARTICLES, panevBom } from '../catalog/panev';
import { PANEV_LIST_PRICE } from '../catalog/panev-prices';
import { MACHINES } from '../catalog/machines';
import { deriveLift } from '../lift/derive';
import { defaultLift } from '../lift/defaults';
import { cableLength, ropeLength as ropeRun } from '../lift/support';
import { analyse } from '../present/analysis';
import { PRICE_ARTICLES, machineKey, priceArticle, ropeKey } from '../prices/articles';
import { calcBom, designBom, ropeLength } from '../prices/bom';
import { MAX_CENTS, costOf, parseCents, pricesOf } from '../prices/cost';
import { customLines, customPrices, customRowSchema, type CustomItem } from '../prices/custom';
import { designBasis } from '../prices/plant-bom';
import { deriveRoom } from '../room/derive';
import { startSurvey } from '../room/survey';
import { RAIL_LENGTH, bracketHeights, railSpan, section } from '@/shaft';

const tenth = (x: number): number => Math.ceil(x * 10 - 1e-9) / 10;

test('the list: one row per article, every machine of the catalogues, Panev from its list price', () => {
  const keys = PRICE_ARTICLES.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const m of MACHINES) assert.ok(priceArticle(machineKey(m.brand, m.model)), `${m.brand} ${m.model}`);
  for (const a of PANEV_ARTICLES) {
    const p = priceArticle(`panev:${a.code}`);
    assert.ok(p, a.code);
    const list = PANEV_LIST_PRICE[a.code];
    assert.equal(p.start?.cents, list === undefined ? undefined : Math.round(list * 100), a.code);
  }
  // nothing else starts with a price: the company enters it
  assert.ok(PRICE_ARTICLES.filter((a) => a.start).every((a) => a.group === 'panev'));
});

test('prices typed as each language writes them', () => {
  assert.equal(parseCents('', 'it'), null);
  assert.equal(parseCents('  ', 'it'), null);
  assert.equal(parseCents('1.250,50', 'it'), 125050);
  assert.equal(parseCents('1250,5', 'it'), 125050);
  assert.equal(parseCents('12.50', 'it'), 1250); // a point with two decimals is the decimal point
  assert.equal(parseCents('12.345', 'it'), 1234500); // grouped thousands
  assert.equal(parseCents('€ 99', 'it'), 9900);
  assert.equal(parseCents('1 250,50', 'bg'), 125050);
  assert.equal(parseCents('1,250.50', 'en'), 125050);
  assert.equal(parseCents('1250.5', 'en'), 125050);
  assert.equal(parseCents('12.345', 'en'), undefined); // three decimals
  assert.equal(parseCents('-5', 'it'), undefined);
  assert.equal(parseCents('1e3', 'it'), undefined);
  assert.equal(parseCents('abc', 'it'), undefined);
  assert.equal(parseCents(String(MAX_CENTS / 100 + 1), 'it'), undefined);
});

test('the company’s prices over the start; the cost counts only priced lines', () => {
  const m = pricesOf([{ key: 'panev:B 65 320', cents: 1000 }, { key: 'car', cents: 500000 }, { key: 'nonsense', cents: 1 }]);
  assert.equal(m.get('panev:B 65 320'), 1000);
  assert.equal(m.get('panev:A 65 170 7'), 1368);
  assert.equal(m.get('car'), 500000);
  assert.equal(m.has('nonsense'), false);
  const c = costOf([
    { key: 'car', label: { item: 'car' }, qty: 1, unit: 'pz' },
    { key: 'panev:B 65 320', label: { item: 'panev_bracketB' }, qty: 3, unit: 'pz' },
    { key: 'sling', label: { item: 'sling' }, qty: 1, unit: 'pz' },
    { key: null, label: { item: 'machine_other' }, qty: 1, unit: 'pz' },
  ], m);
  assert.equal(c.total, 503000);
  assert.equal(c.missing, 2);
});

test('the design’s bill: the quantities the design has', () => {
  const dv = deriveLift(defaultLift()), bom = designBom(dv), I = dv.shaft, S = section(dv.layout), [z0, z1] = railSpan(S);
  const q = (key: string): number => bom.find((l) => l.key === key)?.qty ?? 0;
  const span = z1 - z0, joints = Math.ceil(span / RAIL_LENGTH) - 1;
  assert.equal(q(`rail:${I.carRail}`), tenth((2 * span) / 1000));
  assert.equal(q(`fishplate:${I.carRail}`), 2 * joints);
  assert.equal(q('bracket:car'), 2 * bracketHeights(z0, z1, I.carRail).length);
  for (const r of panevBom(dv.layout).rows) assert.equal(q(`panev:${r.article.code}`), r.qty, r.article.code);
  assert.equal(q(`door:landing:${I.door}`), I.vertical.floors.length);
  assert.equal(q('cw'), Math.round(dv.analysis.res.Mcw));
  // the ropes: every rope, the length on the pulleys longer than the travel
  const one = ropeLength(dv);
  assert.ok(one !== null && one > dv.sim.H);
  assert.equal(q(`rope:${dv.machine.d}`), tenth(one * dv.machine.n));
  // every line once
  const keys = bom.flatMap((l) => (l.key ? [l.key] : []));
  assert.equal(new Set(keys).size, keys.length);
});

test('the replacement: the machine of the calculation, else a machine of no list', () => {
  const dv = deriveLift(defaultLift()), lines = calcBom(dv.values);
  assert.ok(lines.length >= 1);
  assert.equal(lines[0].label.item.startsWith('machine'), true);
});

test('the plant counted from the design: one each, a panel at every landing door, the lengths of the shaft', () => {
  const dv = deriveLift(defaultLift()), bom = designBom(dv), V = dv.shaft.vertical, S = section(dv.layout), [z0, z1] = railSpan(S);
  const q = (key: string): number => bom.find((l) => l.key === key)?.qty ?? 0;
  for (const k of ['controller', 'electrical:panel', 'push:car', 'push:inspection', 'stop:pit', 'stop:room', 'light:emergency', 'alarm:siren', 'alarm:remote']) assert.equal(q(k), 1, k);
  assert.equal(q('push:landing'), dv.layout.doors.reduce((n, d) => n + V.floors.filter((f) => f.door.includes(d.side)).length, 0));
  // the travelling cable as the loads count it; the light over the shaft's height; the wiring up to the room's floor,
  // the trunking also across the room to the machine
  assert.equal(q('cable:travelling'), tenth(cableLength(S.top / 1000)));
  const shaft = (V.pit + S.top + V.headroom) / 1000;
  assert.equal(q('light:shaft'), tenth(shaft));
  assert.ok(dv.shaft.room && !dv.bottom);
  assert.equal(q('wiring'), tenth(shaft + dv.shaft.room.slab / 1000));
  assert.ok(q('trunking') > q('wiring'));
  // a support under every spring or polyurethane buffer, none under a hydraulic one
  for (const t of ['spring', 'pu']) assert.equal(q(`buffer-support:${t}`), q(`buffer:${t}`), t);
  // two shoes on each car rail; the installer by the stop; every metre of rail cleaned
  assert.equal(q('shoes:car'), 2 * dv.layout.rails.filter((r) => r.kind === 'car').length);
  assert.equal(q('labour:installer'), V.floors.length);
  assert.equal(bom.find((l) => l.key === 'labour:installer')?.unit, 'stop');
  assert.equal(q('labour:rails'), tenth((dv.layout.rails.length * (z1 - z0)) / 1000));
  assert.deepEqual(designBasis(dv), { stops: V.floors.length, travel: S.top / 1000 });
});

test('the replacement: the parts the acceptance test replaces, the installer as a lump sum', () => {
  const V = deriveLift(defaultLift()).values;
  const only = calcBom(V, { norma: '10411-1', parti: ['machine'] });
  assert.ok(!only.some((l) => l.key?.startsWith('rope:') || l.key === 'controller'));
  const lab = only.find((l) => l.key === 'labour:replacement');
  assert.deepEqual([lab?.qty, lab?.unit], [1, 'lot']);
  const all = calcBom(V, { norma: '10411-1', parti: ['machine', 'ropes', 'controller'] }), { I, N } = analyse(V).ctx;
  assert.equal(all.find((l) => l.key === ropeKey(N.d))?.qty, tenth(N.n * ropeRun(I)));
  assert.equal(all.find((l) => l.key === 'controller')?.qty, 1);
  // the machine room surveyed: what stands there, once (our frame with the pulley made to h, no maker's bedplate)
  const DEFL: FormValues = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 }, d = deriveRoom(DEFL, startSurvey(780));
  assert.ok(d.M.rinvio?.on === 'frame' && !d.M.rinvio.maker);
  const base = calcBom(DEFL, null, d).filter((l) => l.key?.startsWith('bedplate:') || l.key?.startsWith('support:'));
  assert.deepEqual(base.map((l) => l.key), ['support:rinvio']);
});

test('free lines: counted by their basis in the projects they go into; by the stop not in a replacement', () => {
  const items: CustomItem[] = [
    { id: 'a', text: 'Trasporto', cents: 50000, basis: 'LOT', scope: 'ALL' },
    { id: 'b', text: 'Ponteggio', cents: 12000, basis: 'STOP', scope: 'ALL' },
    { id: 'c', text: 'Verifica ente', cents: 30000, basis: 'LOT', scope: 'REPLACEMENT' },
    { id: 'd', text: 'Pulizia vano', cents: 800, basis: 'TRAVEL', scope: 'FULL' },
  ];
  const full = customLines(items, 'full', { stops: 6, travel: 15.234 });
  assert.deepEqual(full.lines.map((l) => [l.key, l.qty, l.unit]), [['custom:a', 1, 'lot'], ['custom:b', 6, 'stop'], ['custom:d', 15.2, 'm']]);
  assert.deepEqual(full.skipped, []);
  const repl = customLines(items, 'replacement', { stops: null, travel: 15.234 });
  assert.deepEqual(repl.lines.map((l) => l.key), ['custom:a', 'custom:c']);
  assert.deepEqual(repl.skipped, ['Ponteggio']);
  const c = costOf(full.lines, new Map(customPrices(items)));
  assert.equal(c.total, 50000 + 6 * 12000 + 12160);
  assert.equal(c.missing, 0);
  // a saved line: words and a price, a known basis and projects
  assert.ok(customRowSchema.safeParse({ text: 'Trasporto', cents: 100, basis: 'LOT', scope: 'ALL' }).success);
  assert.ok(!customRowSchema.safeParse({ text: '  ', cents: 100, basis: 'LOT', scope: 'ALL' }).success);
  assert.ok(!customRowSchema.safeParse({ text: 'x', cents: -1, basis: 'LOT', scope: 'ALL' }).success);
  assert.ok(!customRowSchema.safeParse({ text: 'x', cents: 1, basis: 'KG', scope: 'ALL' }).success);
  assert.ok(!customRowSchema.safeParse({ text: 'x', cents: MAX_CENTS + 1, basis: 'LOT', scope: 'ALL' }).success);
});
