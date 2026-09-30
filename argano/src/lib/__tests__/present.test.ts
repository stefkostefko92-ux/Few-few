// Screen and report text builders: the same texts in every language, and the three languages complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import calcIt from '../../../messages/calc/it.json';
import calcEn from '../../../messages/calc/en.json';
import calcBg from '../../../messages/calc/bg.json';
import appIt from '../../../messages/it.json';
import appEn from '../../../messages/en.json';
import appBg from '../../../messages/bg.json';
import { PRESETS } from '@/calc/presets';
import { analyse } from '../present/analysis';
import { quickRows } from '../present/quick';
import { summaryText } from '../present/summary';
import { techTables } from '../present/tables';
import { textsFor } from '../present/texts';
import { makePres, type CalcDict } from '../present/tr';

const keys = (o: object, prefix = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

test('le tre lingue hanno le stesse chiavi e gli stessi segnaposto', () => {
  for (const [name, it, others] of [['app', appIt, [appEn, appBg]], ['calc', calcIt, [calcEn, calcBg]]] as const) {
    for (const other of others) assert.deepEqual(keys(other), keys(it), name);
    const flat = (o: object): Record<string, string> => Object.fromEntries(keys(o).map((k) => [k, k.split('.').reduce<unknown>((x, p) => (x as Record<string, unknown>)[p], o) as string]));
    const base = flat(it);
    for (const other of others) for (const [k, v] of Object.entries(flat(other))) assert.deepEqual(placeholders(v), placeholders(base[k] ?? ''), `${name}.${k}`);
  }
});

test('esempi A, B, C in tre lingue: testi completi, tabelle coerenti', () => {
  for (const [dict, loc] of [[calcIt, 'it-IT'], [calcEn, 'en-GB'], [calcBg, 'bg-BG']] as const) {
    const P = makePres(dict as CalcDict, loc), X = textsFor(P);
    for (const k of ['A', 'B', 'C'] as const) {
      const a = analyse(PRESETS[k]);
      const text = summaryText(P, X, a, { badVisible: 0, brand: 'Ditta' });
      for (const bad of ['undefined', 'NaN', '{', '}']) assert.ok(!text.includes(bad), `${loc} ${k}: «${bad}»`);
      const q = quickRows(P, X, a.ctx.N, a.res, a.sens);
      assert.deepEqual(q.map((r) => r.key), ['c_trac', 'c_ropes', 'c_drive', 'c_brake', 'c_shaft', 'c_rescue', 'q_sens']);
      for (const tb of techTables(P, X, a)) for (const row of tb.rows) assert.equal(row.length, tb.head.length, `${loc} ${k} ${tb.key}`);
    }
  }
});

test('numeri uguali sul server e nel browser: separatori fissi, non quelli del runtime', () => {
  const cases: ReadonlyArray<readonly [string, number, number, string]> = [
    ['it-IT', 2500, 0, '2500'], ['it-IT', 12345.5, 1, '12.345,5'], ['it-IT', -1234567.891, 2, '-1.234.567,89'], ['it-IT', 0.456, 3, '0,456'],
    ['bg-BG', 2500, 0, '2500'], ['bg-BG', 12345.5, 1, '12 345,5'],
    ['en-GB', 2500, 0, '2,500'], ['en-GB', 12345.5, 1, '12,345.5'], ['en-GB', 999.995, 2, '1,000.00'],
  ];
  for (const [loc, x, dec, want] of cases) assert.equal(makePres(calcIt as CalcDict, loc).fmt(x, dec), want, `${loc} ${x}`);
  const f = makePres(calcIt as CalcDict, 'it-IT').fmt;
  assert.equal(f(Infinity), '∞');
  assert.equal(f(Number.NaN), '—');
  assert.equal(f(null), '—');
});
