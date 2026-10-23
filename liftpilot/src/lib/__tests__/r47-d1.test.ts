// Round 47, owner's decision D2: D.1 (UNI 10411-1:2024) at the brake test. The verdict stays round 46's (C1 =
// max(band minimum, (g + a_e)/(g − a_e)), a_min and a_lim as information); whenever tr_d1 applies, the relazioni print a
// point to verify on site among UNI 10411-1's — the measured braking deceleration against a_lim (its value), above it
// D.1 done again does not hold; when not even the band minimum meets D.1, the variant. No new input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { ambitoOf, collaudoOf, type Collaudo } from '@/lib/lift';
import { carichiOf, type Carichi } from '../lift/modifica';
import { D1_NON_REGGE, D1_PROVA_FRENO } from '../lift/obblighi-variazioni';
import { d1Check, d1Di } from '../lift/rapporto';
import { NO_MARKS } from '../lift/marks';
import { buildReport } from '../report/build';
import { d1Sito } from '../report/cases';
import { adempimentiBlocks } from '../report/collaudo';

const DAY = new Date('2026-10-16T08:00:00Z');
const project = { name: 'Impianto D.1', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };
const calc = { id: 'cmtestd2', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.7.0', profileId: 'IT-2026.1', author: null };
const V = (x: FormValues = {}): FormValues => ({ ...PRESETS.C, context: 'repl', compare: false, ...x });
// the car 100 kg lighter on the documents than the design's, the counterweight the same: the ratio changed (6.1)
const spostato = (Vx: FormValues): Carichi => { const o = carichiOf(Vx) as Carichi; return { Q: o.Q, P: o.P - 100, Mcw: o.Mcw }; };
const test1 = (Vx: FormValues, documentato?: Carichi, norma: '10411-1' | '10411-11' = '10411-1'): Collaudo =>
  collaudoOf(Vx, { norma, parti: ['machine'], ...(documentato ? { documentato } : {}) });
const it2 = (x: number): string => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
const items = (C: Collaudo, Vx: FormValues): string[] => adempimentiBlocks(C, true, false, Vx).flatMap((b) => (b.t === 'list' ? b.items : []));
const PREFIX = 'UNI 10411-1:2024, 6.1 e D.1: ';

test('D.1 alla prova del freno: il punto con a_lim, nella sezione della UNI 10411-1', () => {
  const Vx = V(), C = test1(Vx, spostato(Vx)), d = d1Di(C, Vx);
  assert.ok(d && d.aLim !== null, 'D.1 asked, a limit deceleration');
  const p = d1Sito(C, Vx);
  assert.ok(p);
  assert.equal(p.stato, 'da_verificare');
  assert.ok(p.testo.includes(`= ${it2(d.aLim)} m/s²`) && p.testo.includes(`a = ${it2(d.a)} m/s²`), p.testo);
  assert.ok(p.testo.startsWith('alla prova del freno si misura la decelerazione di frenatura della cabina') && p.testo.includes('soggetto della verifica'));
  assert.ok(!p.testo.includes('con C1lim della relazione'), 'the template’s formula replaced by the values');
  // among the adempimenti, after the heading of UNI 10411-1
  const blocks = adempimentiBlocks(C, true, false, Vx), h = blocks.findIndex((b) => b.t === 'h3' && b.text.startsWith('UNI 10411-1'));
  assert.ok(h > 0);
  const list = blocks.slice(h).find((b) => b.t === 'list');
  assert.ok(list && list.t === 'list' && list.items.some((x) => x.startsWith(PREFIX) && x.includes(it2(d.aLim as number))));
});

test('D.1 alla prova del freno: la variante quando nemmeno il C1 minimo della fascia regge', () => {
  const Vx = V({ k: 0.4 }), C = test1(Vx, spostato(Vx)), d = d1Di(C, Vx);
  assert.ok(d && d.aLim === null, 'the fixture: no deceleration meets D.1');
  const p = d1Sito(C, Vx);
  assert.ok(p && p.testo.startsWith('la D.1 non regge nemmeno con il C1 minimo della fascia di velocità') && p.testo.includes('nessuna decelerazione misurata'), p?.testo);
  assert.ok(items(C, Vx).some((x) => x.startsWith(PREFIX) && x.includes('non regge nemmeno')));
});

test('D.1 alla prova del freno: mai senza tr_d1 (-11, carichi proporzionali, senza carichi documentati)', () => {
  const Vx = V(), o = carichiOf(Vx) as Carichi, none = (C: Collaudo): void => {
    assert.equal(d1Sito(C, Vx), null);
    assert.ok(!items(C, Vx).some((x) => x.startsWith(PREFIX)), JSON.stringify(C));
  };
  none(test1(Vx, spostato(Vx), '10411-11'));
  none(test1(Vx, { Q: o.Q / 1.04, P: o.P / 1.04, Mcw: o.Mcw / 1.04 }));
  none(test1(Vx));
  // without the calculation's values (a record read without them): nothing
  assert.ok(!adempimentiBlocks(test1(Vx, spostato(Vx)), true, false).flatMap((b) => (b.t === 'list' ? b.items : [])).some((x) => x.startsWith(PREFIX)));
});

test('D.1 alla prova del freno: il punto c’è esattamente quando tr_d1 si applica', () => {
  for (const k of [0.5, 0.45, 0.4, 0.3]) for (const dP of [-100, -20, 0, 40]) for (const norma of ['10411-1', '10411-11'] as const) {
    const Vx = V({ k }), o = carichiOf(Vx) as Carichi, C = test1(Vx, { Q: o.Q, P: o.P + dP, Mcw: o.Mcw }, norma);
    const applies = d1Check(C, Vx) !== null && ambitoOf(C, 'tr_d1') === 'applies';
    assert.equal(d1Sito(C, Vx) !== null, applies, `${k} ${dP} ${norma}`);
  }
});

// (the relazione tecnica di modifica prints the same point: report-rt-locale.test.ts, round 49)
test('D.1 alla prova del freno: nella relazione di calcolo e nella lista di verifica', () => {
  const Vx = V(), C = test1(Vx, spostato(Vx)), d = d1Di(C, Vx);
  assert.ok(d && d.aLim !== null);
  const rel = JSON.stringify(buildReport({ calc, project, company: 'Ditta di prova', values: Vx, reviews: [], marks: { ...NO_MARKS, collaudo: C } }).blocks);
  assert.ok(rel.includes(`${PREFIX}alla prova del freno`) && rel.includes(it2(d.aLim)), 'relazione di calcolo');
  // the list of verification names both templates, in the changes of UNI 10411-1
  const lista = readFileSync(new URL('../../../docs/lista-verifica-normativa.json', import.meta.url), 'utf8');
  for (const p of [D1_PROVA_FRENO, D1_NON_REGGE]) assert.ok(lista.includes(JSON.stringify(p.testo).slice(1, 60)), p.testo);
});
