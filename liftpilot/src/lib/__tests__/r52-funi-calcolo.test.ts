// Round 52, the owner's decision: for a modification under UNI 10411-1 the rope checks of «Calcolo argano» are those of
// the owner's rope sheet (lift/funi-modello.ts) — z against 12/16 standing in for S_f with D.2 met (14.1 c)–d)), D.1 and
// D.2 as the sheet computes them (with the ratio as documented: D.1 «Attenzione», D.2 information; with the ratio
// changed the engine's tr_d1 and tr_d2 count), D/d of the compensation's tensioner — counted the same in the
// calculation's verdict, the acceptance test's, the pill's panel and the relazione; none under UNI 10411-11 or for a
// lift tested as new, none without the parts that bring the ropes in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compute } from '@/calc/compute';
import { readInputs } from '@/calc/inputs';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { snapshotOf } from '@/calc/snapshot';
import { makePres } from '@/lib/present/tr';
import calcIt from '../../../messages/calc/it.json';
import { calcExtra, calcVerdictOf } from '../lift/calc-verdict';
import { collaudoOf, collaudoVerdict, type Collaudo } from '../lift/collaudo';
import { funiModelloChecks } from '../lift/funi-modello';
import { carichiOf, type Carichi } from '../lift/modifica';
import { senzaSostituite, sostituite } from '../lift/sostituite';
import { funiModelloBlocks } from '../report/funi-modello';
import { agrees, calcList, extraOfVersion } from '../verdict-checks';

// preset B with a 400 mm sheave: S_f not met (17,20 against 17,88), z and D.2 of the sheet met
const V: FormValues = { ...PRESETS.B, context: 'repl', n_D: '400' };
const C1: Collaudo = collaudoOf(V, { norma: '10411-1', parti: ['machine'] });
const { I, N } = readInputs(V), res = compute(I, N);
const ids = (C: Collaudo, W: FormValues = V): string[] => funiModelloChecks(C, W).map((c) => `${c.id}:${c.status}`);

test('r52: il foglio funi entra nell’esito del calcolo — z al posto di S_f con la D.2 verificata', () => {
  assert.equal(res.checks.find((c) => c.id === 'r_sfa')?.status, 'fail', 'S_f del motore non verificato');
  assert.deepEqual(ids(C1), ['fm_z:ok', 'fm_d1:warn', 'fm_d2:ok']);
  const v = calcVerdictOf(res, C1, V);
  assert.deepEqual(v.sostituite, ['r_sfa']);
  assert.equal(v.fails, senzaSostituite(res.fails, v.extra).length, 'S_f non conteggiato');
  assert.equal(v.fails, res.fails.filter((c) => c.id !== 'r_sfa').length);
  assert.ok(v.warns >= 1, 'la D.1 del foglio è un avviso');
  // the acceptance test's verdict over the same checks: S_f out too
  const all = [...res.checks, ...v.extra];
  assert.equal(collaudoVerdict(C1, all).fails, collaudoVerdict(C1, all.filter((c) => c.id !== 'r_sfa')).fails);
});

test('r52: senza la D.2 verificata vale S_f, la D.2 è un’informazione', () => {
  // three ropes on preset A with a 400 mm sheave: D.2 not met
  const W: FormValues = { ...PRESETS.A, context: 'repl', n_n: '3', n_D: '400' };
  const C = collaudoOf(W, { norma: '10411-1', parti: ['machine'] });
  assert.deepEqual(ids(C, W), ['fm_d1:warn', 'fm_d2:info']);
  const r = compute(readInputs(W).I, readInputs(W).N), v = calcVerdictOf(r, C, W);
  assert.deepEqual(v.sostituite, []);
  assert.equal(v.fails, r.fails.length, 'S_f del motore conteggiato');
});

test('r52: nessuna verifica del foglio con la UNI 10411-11, per un impianto nuovo o senza le parti delle funi', () => {
  assert.deepEqual(ids(collaudoOf(V, { norma: '10411-11', parti: ['machine'] })), []);
  assert.deepEqual(ids(collaudoOf({ ...V, context: 'new' })), []);
  assert.deepEqual(ids(collaudoOf(V, { norma: '10411-1', parti: ['controller'] })), []);
  for (const p of ['ropes', 'machine', 'load', 'speed'] as const) assert.ok(ids(collaudoOf(V, { norma: '10411-1', parti: [p] })).length > 0, p);
  const nuovo = calcVerdictOf(res, collaudoOf({ ...V, context: 'new' }), V);
  assert.deepEqual([nuovo.extra, nuovo.sostituite, nuovo.fails], [[], [], res.fails.length]);
});

test('r52: con il rapporto tra i carichi cambiato contano la D.1 e la D.2 del motore, non quelle del foglio', () => {
  const o = carichiOf(V) as Carichi, C = collaudoOf(V, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P, Mcw: o.Mcw + 300 } });
  const extra = calcExtra(C, V).map((c) => c.id);
  assert.ok(extra.includes('tr_d1') && extra.includes('tr_d2'));
  assert.ok(!extra.includes('fm_d1') && !extra.includes('fm_d2'));
});

test('r52: la compensazione con funi e la sua puleggia tenditrice', () => {
  const W: FormValues = { ...V, compTipo: 'funi', compFune: '1', compN: '4', compDt: '200' };
  const c = funiModelloChecks(C1, W).find((x) => x.id === 'fm_comp');
  assert.ok(c && c.value !== null && c.limit === 30);
  assert.equal(c.status, c.value >= 30 ? 'ok' : 'fail');
});

test('r52: il pannello della pillola conta come il salvataggio; un calcolo 1.8.0 resta com’era', () => {
  const v = calcVerdictOf(res, C1, V), extra = calcExtra(C1, V);
  const list = calcList(snapshotOf(V).results, extra);
  assert.ok(agrees(list, { failCount: v.fails, warnCount: v.warns }), JSON.stringify(list));
  assert.ok(!list.fails.some((c) => c.id === 'r_sfa'));
  assert.deepEqual(extraOfVersion('1.8.0', extra), extra.filter((c) => c.id.startsWith('tr_')));
  assert.deepEqual(extraOfVersion('1.9.0', extra), extra);
  assert.deepEqual(sostituite(extraOfVersion('1.8.0', extra)), []);
});

test('r52: la relazione di calcolo stampa il foglio funi con l’esito di ogni riga', () => {
  const blocks = funiModelloBlocks(makePres(calcIt, 'it-IT'), C1, V);
  const grid = blocks.find((b) => b.t === 'grid');
  assert.ok(grid && grid.t === 'grid');
  assert.deepEqual(grid.rows.map((r) => r[3]), ['Soddisfatta', 'Attenzione', 'Attenzione', 'Soddisfatta']);
  const note = blocks.find((b) => b.t === 'p');
  assert.ok(note && note.t === 'p' && note.text.includes('z sostituisce il coefficiente S_f'));
  assert.deepEqual(funiModelloBlocks(makePres(calcIt, 'it-IT'), collaudoOf(V, { norma: '10411-11', parti: ['machine'] }), V), []);
});
