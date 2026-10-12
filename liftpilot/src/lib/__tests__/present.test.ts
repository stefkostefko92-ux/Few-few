// Screen and report text builders, and the Italian messages complete: Italian is the only language of the interface.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import calcIt from '../../../messages/calc/it.json';
import appIt from '../../../messages/it.json';
import { PRESETS } from '@/calc/presets';
import { analyse } from '../present/analysis';
import { quickRows } from '../present/quick';
import { summaryText } from '../present/summary';
import { techTables } from '../present/tables';
import { textsFor } from '../present/texts';
import { makePres, type CalcDict } from '../present/tr';

const keys = (o: object, prefix = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();

const root = path.resolve(new URL('../../..', import.meta.url).pathname);

test('una sola lingua: messages/ e messages/calc/ contengono solo it.json', () => {
  for (const dir of ['messages', 'messages/calc']) {
    assert.deepEqual(readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.json')), ['it.json'], dir);
  }
  // a placeholder is a name in braces: every one of the app's texts closes the braces it opens
  for (const [name, dict] of [['app', appIt], ['calc', calcIt]] as const) {
    for (const k of keys(dict)) {
      const v = k.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown>)[p], dict);
      if (typeof v === 'string') assert.equal((v.match(/\{/g) ?? []).length, (v.match(/\}/g) ?? []).length, `${name}.${k}`);
    }
  }
});

test('esempi A, B, C: testi completi, tabelle coerenti', () => {
  const P = makePres(calcIt as CalcDict, 'it-IT'), X = textsFor(P);
  for (const k of ['A', 'B', 'C'] as const) {
    const a = analyse(PRESETS[k]);
    const text = summaryText(P, X, a, { badVisible: 0, brand: 'Ditta' });
    for (const bad of ['undefined', 'NaN', '{', '}']) assert.ok(!text.includes(bad), `${k}: «${bad}»`);
    const q = quickRows(P, X, a.ctx.N, a.res, a.sens);
    assert.deepEqual(q.map((r) => r.key), ['c_trac', 'c_ropes', 'c_drive', 'c_brake', 'c_shaft', 'c_rescue', 'q_sens']);
    for (const tb of techTables(P, X, a)) for (const row of tb.rows) assert.equal(row.length, tb.head.length, `${k} ${tb.key}`);
  }
});

test('numeri uguali sul server e nel browser: separatori fissi, non quelli del runtime', () => {
  const cases: ReadonlyArray<readonly [string, number, number, string]> = [
    ['it-IT', 2500, 0, '2500'], ['it-IT', 12345.5, 1, '12.345,5'], ['it-IT', -1234567.891, 2, '-1.234.567,89'], ['it-IT', 0.456, 3, '0,456'],
    ['it-IT', 999.995, 2, '1000,00'], ['it-IT', 12345678, 0, '12.345.678'],
  ];
  for (const [loc, x, dec, want] of cases) assert.equal(makePres(calcIt as CalcDict, loc).fmt(x, dec), want, `${loc} ${x}`);
  const f = makePres(calcIt as CalcDict, 'it-IT').fmt;
  assert.equal(f(Infinity), '∞');
  assert.equal(f(Number.NaN), '—');
  assert.equal(f(null), '—');
});

test('nessun testo è vuoto', () => {
  const at = (o: object, k: string): unknown => k.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown>)[p], o);
  for (const [name, dict] of [['app', appIt], ['calc', calcIt]] as const) {
    for (const k of keys(dict)) {
      const v = at(dict, k);
      if (typeof v === 'string') assert.ok(v.trim().length > 0, `${name}: «${k}» è vuoto`);
    }
  }
});
