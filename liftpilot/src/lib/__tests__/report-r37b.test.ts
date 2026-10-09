// Round 37, the review of package A: the existing sling's check named by both ways the loads go beyond the limits (T*
// or, under UNI 10411-1, the rated load); the brake of a machine to UNI EN 81-1 with its clause and 14.1 b); the
// existing room's height and the pillar by the part of UNI 10411 of the test on sheet 1 and in the form's hints; one
// sentence for the sling and the missing loads in the relazione and on sheet 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import appBg from '../../../messages/bg.json';
import appEn from '../../../messages/en.json';
import appIt from '../../../messages/it.json';
import { PRESETS } from '@/calc/presets';
import { VOCI } from '@/calc/norme';
import type { FormValues } from '@/calc/types';
import { SHAFT_ENGINE_VERSION } from '@/shaft';
import { PARTI_RIFACIMENTO, defaultLift, deriveLift, newLift, type Collaudo, type LiftInputs } from '@/lib/lift';
import { slingCheck, tStarOf } from '../lift/arcata';
import { valueMarks } from '../lift/marks';
import { carichiOf, variazioneCarico } from '../lift/modifica';
import type { Plant } from '../plant';
import { analyse } from '../present/analysis';
import { buildReport } from '../report/build';
import { collaudoNote, collaudoRows, pilastroRif } from '../report/collaudo';
import type { ReportDoc } from '../report/model';
import { checkRefs } from '../report/refs';
import { dataSheet } from '../tavole/data';
import { clientNotes } from '../tavole/notes';

const DAY = new Date('2026-10-09T08:00:00Z');
const project = { name: 'Impianto di prova', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };
const calc = { id: 'cmtest0037', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null };
const repl = (L: LiftInputs, collaudo: Collaudo): LiftInputs => ({ ...L, calc: { ...L.calc, context: 'repl', keepRopes: false }, collaudo });
const RIF1: Collaudo = { norma: '10411-1', parti: PARTI_RIFACIMENTO, rifacimento: true };

/** The relazione of a lift design, as the server makes it from the one form. */
function relazione(inp: LiftInputs): ReportDoc {
  const d = deriveLift(inp);
  return buildReport({
    calc, project, company: 'Ditta di prova', values: d.values, reviews: [],
    design: { id: 'cmdesign37', label: null, createdAt: DAY, sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, layout: d.layout, source: null },
    marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), plant: null, drawings: [],
  });
}
/** Sheet 1 of a lift design, with the plant data `plant`. */
function sheet1(inp: LiftInputs, plant: Plant = {}) {
  const d = deriveLift(inp);
  return dataSheet({
    values: d.values, layout: d.layout, plant, marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), project,
    company: { name: 'Ditta di prova', logo: null }, set: { number: '26-037', issuedAt: DAY, author: 'LP', revisions: [] },
  }, analyse(d.values), 6).sheet;
}
const text = (doc: ReportDoc): string => JSON.stringify(doc.blocks);

test('arcata esistente: la verifica dice carichi oltre i limiti, T* o la portata (rev. A, 1)', () => {
  // UNI 10411-1, the rated load over 500 kg: +8,6 % beyond prospetto 1 (5 %) while T* goes down 3,6 %
  const doc = { Q: 580, P: 800, Mcw: 1100 }, ora = { Q: 630, P: 700, Mcw: 1015 }, v = variazioneCarico('10411-1', doc, ora);
  assert.ok(v.dQ > 0.05 && v.dT < 0, JSON.stringify(v));
  assert.equal(tStarOf({ ...RIF1, documentato: doc }, ora), 'aumento');
  assert.equal(slingCheck({ ...RIF1, documentato: doc }, ora)?.status, 'warn');
  // the label names both ways in every language, and never an increased T* alone
  assert.ok(appIt.shaft.c_sl_frame.includes('carichi oltre i limiti (T* o portata) o non documentati'), appIt.shaft.c_sl_frame);
  for (const s of [appIt.shaft.c_sl_frame, appEn.shaft.c_sl_frame, appBg.shaft.c_sl_frame]) {
    assert.ok(!/T\* aumentato|T\* increased|увеличено/.test(s), s);
    assert.ok(s.includes('T*') && s.endsWith('(UNI 10411, 6.9)'), s);
  }
  // the relazione of such a design: the variation beyond the limits and the sling's row, without «T* aumentato»
  const L = repl(defaultLift(), RIF1), now = carichiOf(deriveLift(L).values);
  assert.ok(now);
  const docd = { Q: Math.round(now.Q / 1.08), P: now.P + 100, Mcw: now.Mcw };
  const rel = relazione({ ...L, collaudo: { ...RIF1, documentato: docd } }), all = text(rel);
  assert.ok(all.includes('oltre i limiti') && all.includes('L’arcata esistente va verificata per i nuovi carichi (6.9)'));
  assert.ok(!all.includes('T* aumentato'));
  assert.ok(all.includes(appIt.shaft.c_sl_frame.replace(/\s*\(UNI [^)]*\)$/, '')), 'la riga della verifica');
});

test('freno di una macchina secondo la UNI EN 81-1: la sua clausola e la 14.1 b) (rev. A, 3)', () => {
  for (const id of ['b_sets', 'b_all', 'b_one', 'b_up']) {
    const one = checkRefs(VOCI, id, { norma: '10411-1', groove: 'U', std: 'en81-1' });
    assert.ok(one.includes('UNI EN 81-1:2010, 12.4.2.1') && one.includes('UNI 10411-1:2024, 14.1 b)') && !one.includes('14.1 a)'), `${id}: ${one}`);
    const eleven = checkRefs(VOCI, id, { norma: '10411-11', groove: 'U', std: 'en81-1' });
    assert.ok(eleven.includes('UNI EN 81-1 (edizione dell’impianto), 12.4.2.1') && eleven.endsWith('UNI 10411-11:2024, 14.1'), `${id}: ${eleven}`);
    // a machine to UNI EN 81-20: 14.1 a), no clause of the old standard
    const new20 = checkRefs(VOCI, id, { norma: '10411-1', groove: 'U', std: 'en81-20' });
    assert.ok(new20.includes('UNI 10411-1:2024, 14.1 a)') && !new20.includes('14.1 b)') && !new20.includes('UNI EN 81-1'), `${id}: ${new20}`);
  }
  // one set, the empty car going up: the check of UNI EN 81-20 the software applies, said so
  assert.ok(checkRefs(VOCI, 'b_up', { norma: '10411-1', groove: 'U', std: 'en81-1' }).startsWith('UNI EN 81-20:2020, 5.9.2.2.2.1 (verifica più completa scelta dal software)'));
  // the relazione of a replacement with a machine to UNI EN 81-1 under -1: the brake's rows as its object says (14.1 b))
  const old = { ...PRESETS.B, context: 'repl', machineStd: 'en81-1' } as FormValues;
  const doc = buildReport({ calc, project, company: 'Ditta di prova', values: old, reviews: [],
    marks: { pEstimate: false, geometry: [], machineProposed: false, collaudo: { norma: '10411-1', parti: ['machine'] } } });
  const rows = doc.blocks.flatMap((b) => (b.t === 'grid' && b.head.includes('Riferimento') ? b.rows : [])).filter((r) => r[0]?.startsWith('Freno · ') && !r[0].includes('Decelerazione'));
  assert.equal(rows.length, 4);
  for (const r of rows) assert.ok(r[4]?.includes('14.1 b)') && !r[4].includes('14.1 a)'), r.join(' | '));
});

test('foglio 1: l’altezza del locale esistente e il pilastro per la parte della UNI 10411 del collaudo (rev. A, 4 e 7)', () => {
  // the existing room's height: 9.2 of both parts, no clause of the other part nor of UNI EN 81-21 in the label
  for (const s of [appIt.shaft.c_m_hexist, appEn.shaft.c_m_hexist, appBg.shaft.c_m_hexist]) assert.ok(s.endsWith('(UNI 10411, 9.2)'), s);
  const row = sheet1(repl(defaultLift(), { norma: '10411-11', parti: ['machine'] })).checks.find((c) => c[0]?.startsWith(appIt.shaft.c_m_hexist.split(' (')[0] ?? '-'));
  assert.ok(row, 'la verifica nel foglio 1');
  assert.ok(!row[0]?.includes('10411-1') && !row[0]?.includes('81-21'), row[0]);
  // the pillar under the pit: from the test through dataSheet to the note, by the part of UNI 10411
  const under = (norma: Collaudo['norma']): string => {
    const N = newLift(), inp = repl({ ...N, calc: { ...N.calc, layout: 'bottom' }, shaft: { ...N.shaft, room: null }, bottom: 'under' }, { norma, parti: ['machine'] });
    return sheet1(inp, { cwSafetyGear: 'pillar' }).notes.find((n) => n.title === 'SPAZIO ACCESSIBILE SOTTO IL VANO')?.text ?? '';
  };
  const n11 = under('10411-11');
  assert.ok(n11.includes(`verificato per i nuovi carichi (${pilastroRif('10411-11')})`), n11);
  assert.ok(!n11.includes('UNI 10411-1:2024, 6.14'), n11);
  assert.ok(under('10411-1').includes('(UNI 10411-1:2024, 6.14)'));
  // no test given (a new lift): no pillar, never the clause of UNI 10411-1 by default
  const N = newLift(), Lu = deriveLift({ ...N, calc: { ...N.calc, layout: 'bottom' }, shaft: { ...N.shaft, room: null }, bottom: 'under' }).layout;
  assert.ok(!clientNotes(Lu, true, { scheme: 'under' }).some((n) => n.text.includes('pilastro')));
});

test('suggerimenti del pilastro: la via della UNI 10411-1 e quella della UNI 10411-11 (rev. A, 5)', () => {
  for (const s of [appIt.tavole.f_cwGearHint, appIt.lift.hint_bottom_under, appEn.tavole.f_cwGearHint, appEn.lift.hint_bottom_under,
    appBg.tavole.f_cwGearHint, appBg.lift.hint_bottom_under]) {
    assert.ok(s.includes('UNI 10411-1, 6.14; ') && s.includes('UNI 10411-11') && s.includes('UNI EN 81-1') && s.includes('5.5 a)'), s);
  }
});

test('una frase per l’arcata e i carichi mancanti, nella relazione e nel foglio 1 (rev. A, 6)', () => {
  const ora = { Q: 630, P: 700, Mcw: 1015 };
  for (const norma of ['10411-1', '10411-11'] as const) {
    const C: Collaudo = { ...RIF1, norma }, note = collaudoNote(C, 'NOTA 9', ora)?.text ?? '';
    const row = collaudoRows(C, true, ora).find(([k]) => k === 'Variazione dei carichi')?.[1] ?? '';
    for (const s of [`Carichi documentati mancanti: T* non confrontabile (UNI ${norma}, 6.1)`, 'L’arcata esistente va verificata per i nuovi carichi (6.9)']) {
      assert.ok(note.includes(s) && row.includes(s), `${norma}: ${s}\n${note}\n${row}`);
    }
    // the relazione adds what to do
    assert.ok(row.includes('con i dati del suo costruttore o il calcolo del tecnico') && row.includes('indicare nei dati del collaudo'), row);
  }
});
