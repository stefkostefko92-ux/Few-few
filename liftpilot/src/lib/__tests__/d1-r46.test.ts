// Round 46, B10: D.1 (UNI 10411-1:2024) with the ratio of the suspended loads changed (6.1). The check tr_d1 is emitted
// as the existing sling's: only under UNI 10411-1 and only with the ratio changed; it enters the test with the load the
// changed ratio brings, under -11 and for a new lift it is 'existing'; it reaches the lift design's checks, the
// relazione (its two cases, the sentence of the change of the loads, the results by standard, the registry's entries)
// and sheet 1. Without documented loads nothing changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import appIt from '../../../messages/it.json';
import { PRESETS } from '@/calc/presets';
import { VOCI } from '@/calc/norme';
import type { FormValues } from '@/calc/types';
import { SHAFT_ENGINE_VERSION, VOCI_VANO } from '@/shaft';
import { ambitoOf, collaudoOf, defaultLift, deriveLift, type Collaudo, type LiftInputs } from '@/lib/lift';
import { NO_MARKS, valueMarks } from '../lift/marks';
import { carichiOf, type Carichi } from '../lift/modifica';
import { d1Check, d1Di, rapportoVariato } from '../lift/rapporto';
import { analyse } from '../present/analysis';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';
import { dataSheet } from '../tavole/data';

const DAY = new Date('2026-10-15T08:00:00Z');
const project = { name: 'Impianto D.1', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };
const calc = { id: 'cmtestd1', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.8.0', profileId: 'IT-2026.1', author: null };
const V: FormValues = { ...PRESETS.C, context: 'repl', compare: false };
const ora = carichiOf(V) as Carichi;
// the counterweight's documented ratio kept, the car 100 kg lighter: T* and P away from the documented proportion
const SPOSTATO: Carichi = { Q: ora.Q, P: ora.P - 100, Mcw: ora.Mcw };
// every load in the same proportion: the ratio stays (only the load's increase may bring its checks)
const PROPORZIONALE: Carichi = { Q: ora.Q / 1.04, P: ora.P / 1.04, Mcw: ora.Mcw / 1.04 };
const test1 = (documentato?: Carichi): Collaudo => collaudoOf(V, { norma: '10411-1', parti: ['machine'], ...(documentato ? { documentato } : {}) });
const text = (doc: ReportDoc): string => JSON.stringify(doc.blocks);
const S = appIt.shaft;

test('D.1 solo con la UNI 10411-1 e il rapporto cambiato', () => {
  const C = test1(SPOSTATO);
  assert.ok(rapportoVariato(C, V));
  assert.ok(C.parti.includes('load'), 'il rapporto cambiato porta il carico');
  const ck = d1Check(C, V);
  assert.equal(ck?.id, 'tr_d1');
  assert.equal(ck?.limit, 1);
  assert.equal(ck?.status, (d1Di(C, V)?.worst.util ?? Infinity) <= 1 ? 'ok' : 'fail');
  assert.equal(ambitoOf(C, 'tr_d1'), 'applies');
  // the ratio kept, no documented loads, -11, a new lift: none
  assert.equal(rapportoVariato(test1(PROPORZIONALE), V), false);
  assert.equal(d1Check(test1(PROPORZIONALE), V), null);
  assert.equal(d1Check(test1(), V), null);
  const C11 = collaudoOf(V, { norma: '10411-11', parti: ['machine'], documentato: SPOSTATO });
  assert.equal(d1Check(C11, V), null);
  assert.equal(ambitoOf(C11, 'tr_d1'), 'existing', 'con la -11 la D.1 non entra');
  assert.equal(ambitoOf({ norma: 'en81', parti: C.parti }, 'tr_d1'), 'existing');
  assert.equal(ambitoOf({ norma: '10411-1', parti: ['machine'] }, 'tr_d1'), 'existing', 'senza il carico tra le parti');
});

test('D.1 nella relazione di calcolo senza progetto: i due casi, la frase, l’esito per normativa, le voci', () => {
  const report = (C: Collaudo): ReportDoc => buildReport({ calc, project, company: 'Ditta di prova', values: V, reviews: [], marks: { ...NO_MARKS, collaudo: C } });
  const C = test1(SPOSTATO), with1 = text(report(C)), d = d1Di(C, V);
  assert.ok(d);
  assert.ok(with1.includes('Stabilità allo scorrimento con il rapporto tra i carichi cambiato (UNI 10411-1:2024, 6.1 e D.1)'));
  assert.ok(with1.includes('Cabina al piano più basso con 1,25·Q') && with1.includes('Cabina vuota al piano più alto'));
  assert.ok(with1.includes('Stabilità allo scorrimento (D.1): utilizzo'), 'la frase nella variazione dei carichi');
  // counted under UNI 10411-1: two checks more than the calculation's, D.1 and D.2 (round 48)
  const res = analyse(V).res, esiti = report(C).blocks.find((b) => b.t === 'grid' && b.head[0] === 'Normativa');
  assert.ok(esiti && esiti.t === 'grid');
  assert.equal(esiti.rows[0]?.[2], String(res.checks.length + 2));
  // the calculation's registry entry of D.1 among those used
  const voce = VOCI.find((v) => v.id === 'modifica.d1');
  assert.ok(voce && with1.includes(voce.titolo));
  // the ratio kept: nothing of D.1
  const without = text(report(test1(PROPORZIONALE)));
  for (const s of ['6.1 e D.1', 'Stabilità allo scorrimento', voce.titolo]) assert.ok(!without.includes(s), s);
});

test('D.1 nel progetto dell’ascensore: verifica, relazione con il riferimento, foglio 1', () => {
  const base: LiftInputs = { ...defaultLift(), calc: { ...defaultLift().calc, context: 'repl', keepRopes: false } };
  const now = carichiOf(deriveLift({ ...base, collaudo: { norma: '10411-1', parti: ['machine'] } }).values) as Carichi;
  const inp: LiftInputs = { ...base, collaudo: { norma: '10411-1', parti: ['machine'], documentato: { Q: now.Q, P: now.P - 100, Mcw: now.Mcw } } };
  const d = deriveLift(inp), ck = d.supportChecks.find((c) => c.id === 'tr_d1');
  assert.ok(ck, 'la verifica tra quelle del progetto');
  assert.equal(ambitoOf(d.collaudo, 'tr_d1'), 'applies');
  const doc = buildReport({
    calc, project, company: 'Ditta di prova', values: d.values, reviews: [],
    design: { id: 'cmdesignd1', label: null, createdAt: DAY, sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, layout: d.layout, source: null },
    marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), plant: null, drawings: [],
  });
  const plain = S.c_tr_d1.replace(/\s*\((UNI|DM) [^)]*\)$/, '');
  const row = doc.blocks.flatMap((b) => (b.t === 'grid' ? b.rows : [])).find((r) => r[0] === plain);
  assert.ok(row, 'la riga della verifica nel vano');
  assert.equal(row[4], 'UNI 10411-1:2024, 6.1 e D.1');
  assert.ok(VOCI_VANO.some((v) => v.id === 'rapporto.d1' && v.verifiche?.includes('tr_d1')));
  const sheet = dataSheet({
    values: d.values, layout: d.layout, plant: {}, marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), project,
    company: { name: 'Ditta di prova', logo: null }, set: { number: '26-046', issuedAt: DAY, author: 'LP', revisions: [] },
  }, analyse(d.values), 6).sheet;
  assert.ok(sheet.checks.some((c) => c[0] === S.c_tr_d1 && c[2] === '≤ 1,00'), 'la riga del foglio 1');
  // without documented loads: no D.1
  assert.ok(!deriveLift({ ...base, collaudo: { norma: '10411-1', parti: ['machine'] } }).supportChecks.some((c) => c.id === 'tr_d1'));
});
