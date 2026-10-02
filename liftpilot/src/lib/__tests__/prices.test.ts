// The company's price list: every article once, Panev's starting from the 2026 list, prices typed in each language's
// way, the cost of a design's articles with the quantities the design has.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PANEV_ARTICLES, panevBom } from '../catalog/panev';
import { MACHINES } from '../catalog/machines';
import { deriveLift } from '../lift/derive';
import { defaultLift } from '../lift/defaults';
import { PRICE_ARTICLES, machineKey, priceArticle } from '../prices/articles';
import { calcBom, designBom, ropeLength } from '../prices/bom';
import { MAX_CENTS, costOf, parseCents, pricesOf } from '../prices/cost';
import { RAIL_LENGTH, bracketHeights, railSpan, section } from '@/shaft';

test('the list: one row per article, every machine of the catalogues, Panev from its list price', () => {
  const keys = PRICE_ARTICLES.map((a) => a.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const m of MACHINES) assert.ok(priceArticle(machineKey(m.brand, m.model)), `${m.brand} ${m.model}`);
  for (const a of PANEV_ARTICLES) {
    const p = priceArticle(`panev:${a.code}`);
    assert.ok(p, a.code);
    assert.equal(p.start?.cents, a.price === null ? undefined : Math.round(a.price * 100), a.code);
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
  assert.equal(q(`rail:${I.carRail}`), Math.ceil(((2 * span) / 1000) * 10 - 1e-9) / 10);
  assert.equal(q(`fishplate:${I.carRail}`), 2 * joints);
  assert.equal(q('bracket:car'), 2 * bracketHeights(z0, z1, I.carRail).length);
  for (const r of panevBom(dv.layout).rows) assert.equal(q(`panev:${r.article.code}`), r.qty, r.article.code);
  assert.equal(q(`door:landing:${I.door}`), I.vertical.floors.length);
  assert.equal(q('cw'), Math.round(dv.analysis.res.Mcw));
  // the ropes: every rope, the length on the pulleys longer than the travel
  const one = ropeLength(dv);
  assert.ok(one !== null && one > dv.sim.H);
  assert.equal(q(`rope:${dv.machine.d}`), Math.ceil(one * dv.machine.n * 10 - 1e-9) / 10);
  // every line once
  const keys = bom.flatMap((l) => (l.key ? [l.key] : []));
  assert.equal(new Set(keys).size, keys.length);
});

test('the replacement: the machine of the calculation, else a machine of no list', () => {
  const dv = deriveLift(defaultLift()), lines = calcBom(dv.values);
  assert.ok(lines.length >= 1);
  assert.equal(lines[0].label.item.startsWith('machine'), true);
});
