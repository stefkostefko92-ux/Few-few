// The texts of the results (src/lib/present/texts.ts) that stand in every PDF: a value never reads as meeting its limit
// when it does not (the rounding), the sense of each limit (≥ or ≤), the verdict of the test, the limits of a groove.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import calcIt from '../../../messages/calc/it.json';
import { K } from '@/calc/norme';
import { PRESETS } from '@/calc/presets';
import type { Check, CheckId, Groove, Results } from '@/calc/types';
import { analyse } from '../present/analysis';
import { textsFor } from '../present/texts';
import { makePres, type CalcDict } from '../present/tr';

const P = makePres(calcIt as CalcDict, 'it-IT'), X = textsFor(P);
const a = analyse(PRESETS.B), N = a.ctx.N;
const check = (id: CheckId, over: Partial<Check>): Check => ({ id, status: 'ok', value: 0, limit: 1, util: null, dec: 2, cs: null, ...over });

test('valore che rispetta il limite: le sue cifre, senza precisione in più', () => {
  assert.equal(X.checkValue(check('tr_load', { value: 0.5, limit: 1, dec: 2 }), N), '0,50');
  assert.equal(X.checkValue(check('tr_load', { value: 0.9999, limit: 1, dec: 2, status: 'ok' }), N), '1,00', 'passa: arrotondare sul limite non contraddice l’esito');
});

test('limite massimo non rispettato: più decimali quando arrotondato sembrerebbe uguale al limite', () => {
  assert.equal(X.checkValue(check('tr_load', { value: 1.004, limit: 1, dec: 2, status: 'fail' }), N), '1,004');
  assert.equal(X.checkValue(check('tr_load', { value: 1.0004, limit: 1, dec: 2, status: 'fail' }), N), '1,0004');
  assert.equal(X.checkValue(check('tr_load', { value: 1.2, limit: 1, dec: 2, status: 'fail' }), N), '1,20', 'già oltre: nessuna cifra in più');
});

test('limite minimo non rispettato (≥): più decimali per il verso giusto', () => {
  assert.equal(X.checkValue(check('r_dd', { value: 39.996, limit: 40, dec: 1, status: 'fail' }), N), '39,996');
  assert.equal(X.checkValue(check('r_sfa', { value: 12.004, limit: 12, dec: 2, status: 'ok' }), N), '12,00', 'passa: le sue cifre');
});

test('valore o limite mancante: trattino, senza cifre inventate', () => {
  assert.equal(X.checkValue(check('tr_load', { value: null }), N), '—');
  assert.equal(X.checkLimit(check('tr_load', { limit: null }), N), '');
});

test('il segno del limite: ≥ per aderenza bloccata, fattori, numero di funi e freni; ≤ per gli altri', () => {
  for (const id of ['tr_stall', 'r_dd', 'r_ddp', 'r_sfa', 'b_sets'] as const) assert.match(X.checkLimit(check(id, { limit: 3, dec: 1 }), N), /^≥ 3,0/, id);
  for (const id of ['tr_load', 'tr_dn', 'tr_up', 'tr_real', 'd_pst', 'b_amax', 's_force'] as const) assert.match(X.checkLimit(check(id, { limit: 3, dec: 1 }), N), /^≤ 3,0/, id);
  assert.match(X.checkLimit(check('r_nd', { limit: 6, dec: 0 }), N), /^≥ /);
});

test('r_nd: il valore è numero × diametro della macchina', () => {
  assert.equal(X.checkValue(check('r_nd', { value: 6, limit: 6, dec: 0 }), N), `${N.n} × Ø${Number.isInteger(N.d) ? N.d : N.d.toFixed(1).replace('.', ',')}\u00a0mm`);
});

test('esito: nessun errore e nessun avviso → verdict_ok', () => {
  const clean = { ...a.res, fails: [], checks: a.res.checks.map((c) => ({ ...c, status: 'ok' as const })) } as Results;
  assert.equal(X.verdictText(clean), 'Tutte le verifiche del software superate');
});

test('esito: 1 errore → verdict_ko1; 2 o più → verdict_ko con il numero', () => {
  const base = a.res.checks.map((c) => ({ ...c, status: 'ok' as const }));
  const failing = (n: number): Results => ({ ...a.res, fails: Array.from({ length: n }, (_, i) => `x${i}`), checks: base } as unknown as Results);
  assert.equal(X.verdictText(failing(1)), '1 verifica non superata');
  assert.equal(X.verdictText(failing(2)), '2 verifiche non superate');
  assert.equal(X.verdictText(failing(7)), '7 verifiche non superate');
});

test('solo avvisi: 1 → verdict_warn1; più → verdict_warn con il numero; gli errori vincono sugli avvisi', () => {
  const warn = (n: number): Results => ({ ...a.res, fails: [], checks: a.res.checks.map((c, i) => ({ ...c, status: i < n ? 'warn' as const : 'ok' as const })) } as unknown as Results);
  assert.equal(X.verdictText(warn(1)), 'Verifiche superate, 1 con «Attenzione»');
  assert.equal(X.verdictText(warn(3)), 'Verifiche superate, 3 con «Attenzione»');
  assert.equal(X.verdictText({ ...warn(3), fails: ['x'] } as unknown as Results), '1 verifica non superata');
});

test('limiti della gola: ognuno con i numeri della norma', () => {
  const g = (type: Groove['type']): Groove => ({ type, beta: 90, gamma: 40 });
  assert.equal(X.grooveLimit(g('U')), `γ ≥ ${K.gammaMinU}°`);
  assert.equal(X.grooveLimit(g('UU')), `β ≤ ${K.betaMax}° (${K.betaRecommended}°) · γ ≥ ${K.gammaMinU}°`);
  assert.equal(X.grooveLimit(g('VH')), `γ ≥ ${K.gammaMin}°`);
  assert.equal(X.grooveLimit(g('VN')), `β ≤ ${K.betaMax}° · γ ≥ ${K.gammaMin}°`);
  // the standard's values themselves (UNI EN 81-50:2020, 5.11.2.3.1): β 105° (90° advised), γ 35° on V grooves, 25° advised on round ones
  assert.deepEqual([K.betaMax, K.betaRecommended, K.gammaMin, K.gammaMinU], [105, 90, 35, 25]);
});
