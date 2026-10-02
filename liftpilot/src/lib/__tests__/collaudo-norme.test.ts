// The standards an acceptance test can add to its base (research, chapter 16, §5.2): each where it fits — the
// supplementary EN 81 standards on a new lift, the improvement of existing lifts on a modification, the national
// obligations on both —, each with its citation and its points checked on site; NTC 2018 computes the beams under the
// machine, the others compute nothing ("non calcolata"); the relazione lists what DPR 162/1999 asks and every
// standard's points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADEMPIMENTI, NORME_AGGIUNTIVE, NORME_COLLAUDO, NORME_INFO, ammessa, collaudoOf, esitiNorme, underNorma, type Collaudo } from '@/lib/lift';
import { liftInputsSchema } from '@/lib/lift-input';
import { adempimentiBlocks, esitiBlocks } from '../report/collaudo';
import type { ReportBlock } from '../report/model';

const REPL = { context: 'repl' }, NEW = { context: 'new' };
const text = (b: readonly ReportBlock[]): string => b.map((x) => ('text' in x ? x.text : 'items' in x ? x.items.join('\n') : '')).join('\n');

test('compatibilità: le EN 81 supplementari sul nuovo, il miglioramento sulla modifica, gli obblighi nazionali su entrambi', () => {
  const all = { norma: 'en81' as const, parti: [], aggiuntive: [...NORME_AGGIUNTIVE] };
  assert.deepEqual(collaudoOf(NEW, all).aggiuntive, ['en81-21', 'en81-28', 'en81-58', 'en81-70', 'en81-71', 'en81-72', 'en81-73', 'en81-76', 'en81-77', 'dm236', 'antincendio', 'ntc2018']);
  assert.deepEqual(collaudoOf(REPL, { ...all, norma: '10411-1', parti: ['machine'] }).aggiuntive,
    ['en81', 'en81-28', 'en81-58', 'en81-73', 'en81-80', 'en81-82', 'en81-83', 'dm236', 'antincendio', 'ntc2018']);
  // a replacement tested as new takes what a new lift takes
  assert.equal(ammessa('en81-70', 'en81'), true);
  assert.equal(ammessa('en81-80', 'en81'), false);
  assert.equal(ammessa('en81-77', '10411-11'), false);
  // the server's schema takes every standard, and no other
  const base = { norma: '10411-1', parti: ['machine'] };
  assert.equal(liftInputsSchema.shape.collaudo.safeParse({ ...base, aggiuntive: ['en81-80', 'ntc2018'] }).success, true);
  assert.equal(liftInputsSchema.shape.collaudo.safeParse({ ...base, aggiuntive: ['en81-99'] }).success, false);
});

test('ogni normativa ha la sua citazione e i suoi punti; NTC 2018 calcola le putrelle, le altre nulla', () => {
  for (const n of [...NORME_COLLAUDO, ...NORME_AGGIUNTIVE]) {
    assert.ok(NORME_INFO[n].citazione.length > 10, n);
    assert.ok(NORME_INFO[n].punti.length > 0, n);
    for (const p of NORME_INFO[n].punti) assert.ok(p.rif && p.testo, n);
  }
  const C: Collaudo = { norma: '10411-1', parti: ['machine'], aggiuntive: ['en81-80', 'ntc2018'] };
  assert.equal(underNorma(C, 'ntc2018', 'm_beam'), true);
  assert.equal(underNorma(C, 'ntc2018', 'tr_load'), false);
  assert.equal(underNorma(C, 'en81-80', 'm_beam'), false);
  const E = esitiNorme(C, [{ id: 'm_beam', status: 'fail' }, { id: 'tr_load', status: 'ok' }]);
  assert.deepEqual(E.map((e) => [e.norma, e.ids.length, e.verdict]), [['10411-1', 2, 'fail'], ['en81-80', 0, 'ok'], ['ntc2018', 1, 'fail']]);
  // in the relazione: a standard without checks is «non calcolata», and the note says where its points are
  const t = text(esitiBlocks(C, [{ id: 'm_beam', status: 'ok' }], (s) => s));
  assert.match(t, /«Non calcolata»/);
});

test('relazione: gli adempimenti del DPR 162/1999 per il nuovo e per la modifica, i punti in sito di ogni normativa', () => {
  const nuovo = text(adempimentiBlocks({ norma: 'en81', parti: [], aggiuntive: ['en81-71', 'en81-77'] }, false));
  assert.match(nuovo, /art\. 12 c\.1–3: comunicazione al Comune entro 60 giorni/);
  assert.match(nuovo, /All\. V 3\.3/);
  assert.match(nuovo, /Attenzione: la UNI EN 81-71:2022 in vigore non è citata in GUUE/);
  assert.match(nuovo, /UNI EN 81-77:2022, 0\.3: non si applica agli impianti installati prima della sua pubblicazione/);
  const mod = text(adempimentiBlocks({ norma: '10411-1', parti: ['machine'], aggiuntive: ['antincendio'] }, true));
  assert.match(mod, /art\. 14 c\.3: verifica straordinaria/);
  assert.match(mod, /art\. 2 c\.1 lett\. cc\)/);
  assert.match(mod, /DM 15\/09\/2005, art\. 1 c\.2: sugli impianti esistenti vale per le modifiche sostanziali/);
  assert.doesNotMatch(mod, /All\. V 3\.3/);
  // a point from a secondary source says so
  assert.match(text(adempimentiBlocks({ norma: 'en81', parti: [], aggiuntive: ['en81-70'] }, false)), /5\.3\.1: tipi di cabina[^\n]*\(da verificare sul testo vigente\)/);
  assert.equal(ADEMPIMENTI.modifica.every((p) => p.stato === 'confermato'), true);
});
