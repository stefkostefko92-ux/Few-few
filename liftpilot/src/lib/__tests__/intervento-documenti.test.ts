// The documents by the type of intervention (round 45, phase 3 step 4): a calculation saved with its type names it in
// the relazione's title, object and context row, in the sentence of a modernisation, in the registry's list, in sheet
// 1's note, in the draft order and in the copied summary; a machine kept is verified with no proposal; a record saved
// before the type (null) keeps every word it was printed with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { analyse } from '@/lib/present/analysis';
import { summaryText } from '@/lib/present/summary';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { PARTI, PARTI_RIFACIMENTO, VOCI_IMPIANTO, defaultLift, deriveLift, type Collaudo } from '@/lib/lift';
import type { TipoIntervento } from '@/lib/lift/intervento';
import { liftAdvice } from '@/lib/lift/advice';
import { buildOrder } from '@/lib/order/build';
import { designOrder } from '@/lib/order/machine';
import { buildReport } from '../report/build';
import { collaudoNote, partiText } from '../report/collaudo';
import { oggettoTecnica, titoloTecnica } from '../report/intervento-text';
import type { ReportDoc } from '../report/model';
import { buildTavole } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';
import calcIt from '../../../messages/calc/it.json';

const SOLO: Collaudo = { norma: '10411-1', parti: ['machine', 'ropes'] };
const AMMOD: Collaudo = { norma: '10411-11', parti: ['machine', 'controller', 'landingDoors'] };
const RIF: Collaudo = { norma: '10411-1', parti: PARTI_RIFACIMENTO, rifacimento: true };
const KEPT: Collaudo = { norma: '10411-1', parti: ['controller', 'ropes'] };
const TRASF: Collaudo = { norma: 'en81', parti: PARTI };
const marks = (collaudo: Collaudo) => ({ pEstimate: false, geometry: [], machineProposed: false, collaudo });

const report = (collaudo: Collaudo, tipo?: TipoIntervento | null, values = PRESETS.B): ReportDoc => buildReport({
  calc: { id: 'cmtest0045', label: null, createdAt: new Date('2026-10-14T08:00:00Z'), sha256: 'e'.repeat(64), engineVersion: '1.6.0', profileId: 'IT-2026.1', author: null },
  project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
  company: 'Ditta di prova', values, reviews: [], marks: marks(collaudo), ...(tipo !== undefined ? { tipo } : {}),
});
const kv = (doc: ReportDoc): Map<string, string> => new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
const h1 = (doc: ReportDoc): string => doc.blocks.find((b) => b.t === 'h1')?.text ?? '';
const h2 = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'h2' ? [b.text] : []));
const paras = (doc: ReportDoc): string => doc.blocks.flatMap((b) => (b.t === 'p' ? [b.text] : [])).join('\n');
const voci = (doc: ReportDoc): string[] => {
  const g = doc.blocks.find((b) => b.t === 'grid' && b.head[0] === 'Voce');
  return g && g.t === 'grid' ? g.rows.map((r) => r[0] ?? '') : [];
};
const VOCE = VOCI_IMPIANTO.find((v) => v.id === 'impianto.intervento');

test('relazione senza tipo (salvata prima del tipo): identica, nessuna voce del tipo', () => {
  for (const [C, values] of [[SOLO, PRESETS.B], [RIF, PRESETS.B], [TRASF, PRESETS.A]] as const) {
    assert.deepEqual(report(C, null, values), report(C, undefined, values));
  }
  assert.equal(h1(report(SOLO, null)), 'Relazione di calcolo — sostituzione dell’argano');
  assert.equal(kv(report(SOLO, null)).get('Contesto'), 'Sostituzione dell’argano');
  assert.equal(h1(report(TRASF, null, PRESETS.A)), 'Relazione di calcolo — argano per impianto nuovo');
  assert.ok(VOCE && VOCE.stato === 'scelta');
  assert.ok(!voci(report(SOLO, null)).includes(VOCE.titolo));
});

test('relazione «Solo argano»: titolo della sostituzione, contesto e voce del registro', () => {
  const doc = report(SOLO, 'SOLO_ARGANO');
  assert.equal(h1(doc), 'Relazione di calcolo — sostituzione dell’argano');
  assert.equal(kv(doc).get('Contesto'), 'Solo argano');
  assert.ok(paras(doc).startsWith('Verifica dell’argano a riduttore in sostituzione su impianto esistente'));
  assert.ok(paras(doc).includes('La sostituzione del macchinario è una modifica costruttiva'));
  assert.ok(VOCE && voci(doc).includes(VOCE.titolo));
});

test('relazione «Ammodernamento»: le parti nominate, il rifacimento e l’argano che resta', () => {
  const doc = report(AMMOD, 'AMMODERNAMENTO'), p = paras(doc);
  assert.equal(h1(doc), 'Relazione di calcolo — ammodernamento dell’impianto');
  assert.equal(kv(doc).get('Contesto'), 'Ammodernamento');
  assert.ok(p.includes('Verifica dell’argano a riduttore per l’ammodernamento di un impianto esistente'));
  assert.ok(p.includes(`Ammodernamento dell’impianto esistente: le parti sostituite o modificate (${partiText(AMMOD)}) sono modifiche costruttive`), p);
  assert.ok(p.includes('art. 2, comma 1, lettera cc)') && p.includes('Il collaudo segue la UNI 10411-11:2024'));
  // the renovation keeps its title, sentence and context row
  const rif = report(RIF, 'AMMODERNAMENTO');
  assert.equal(h1(rif), 'Relazione di calcolo — rifacimento dell’impianto con l’arcata esistente');
  assert.equal(kv(rif).get('Contesto'), 'Rifacimento con arcata esistente');
  assert.ok(paras(rif).includes('«impianto.rifacimento»'));
  // the machine kept: verified as it is, no proposal and no advice
  const kept = report(KEPT, 'AMMODERNAMENTO');
  assert.ok(paras(kept).startsWith('Verifica dell’argano esistente con le modifiche dell’ammodernamento ('));
  assert.ok(paras(kept).includes('con l’argano che resta e si verifica con i dati dell’impianto modificato'));
  assert.ok(!h2(kept).some((x) => x.includes(calcIt.c_prop)), 'nessuna proposta');
  assert.ok(h2(doc).some((x) => x.includes(calcIt.c_prop)), 'la proposta resta quando l’argano si sostituisce');
});

test('relazione «Trasformazione completa»: il titolo, l’oggetto e il contesto', () => {
  const doc = report(TRASF, 'TRASFORMAZIONE_COMPLETA', PRESETS.A);
  assert.equal(h1(doc), 'Relazione di calcolo — trasformazione completa dell’impianto (collaudo come impianto nuovo)');
  assert.equal(kv(doc).get('Contesto'), 'Trasformazione completa');
  assert.ok(paras(doc).startsWith('Verifica dell’argano a riduttore per la trasformazione completa dell’impianto'));
});

const sheet1 = (collaudo: Collaudo, tipo?: TipoIntervento): string => {
  const I: ShaftInputs = { ...defaultInputs(1740, 1445), Q: 630, access: 'none', room: null };
  const x: TavoleInput = {
    values: PRESETS.C, layout: layout(I), plant: {}, marks: marks(collaudo), ...(tipo ? { tipo } : {}),
    project: { name: 'Impianto di prova', address: null, city: null, province: null, plantNumber: null, client: null },
    company: { name: 'Ditta di prova', logo: null }, set: { number: '26-045', issuedAt: new Date('2026-10-14T10:00:00Z'), author: 'LP', revisions: [] },
  };
  return (buildTavole(x).doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? []).join(' ');
};

test('foglio 1: la nota del collaudo si apre con il tipo; senza tipo come prima', () => {
  assert.ok(sheet1(RIF, 'AMMODERNAMENTO').includes('Intervento: Ammodernamento — rifacimento con l’arcata esistente. Collaudo secondo UNI 10411-1:2024'));
  assert.ok(!sheet1(RIF).includes('Intervento:'));
  assert.deepEqual(collaudoNote(SOLO, 'NOTA 1'), collaudoNote(SOLO, 'NOTA 1', undefined, null));
  assert.equal(collaudoNote(SOLO, 'NOTA 1', undefined, 'SOLO_ARGANO')?.text.startsWith('Intervento: Solo argano. Collaudo secondo UNI 10411-1:2024.'), true);
  assert.equal(collaudoNote(KEPT, 'NOTA 1', undefined, 'AMMODERNAMENTO')?.text.startsWith('Intervento: Ammodernamento con l’argano esistente.'), true);
  // tested as new to EN 81-20/50 alone: no note before, the type's note now
  assert.equal(collaudoNote(TRASF, 'NOTA 1'), null);
  assert.equal(collaudoNote(TRASF, 'NOTA 1', undefined, 'TRASFORMAZIONE_COMPLETA')?.text, 'Intervento: Trasformazione completa. Collaudo secondo UNI EN 81-20:2020 e UNI EN 81-50:2020.');
});

test('relazione tecnica del locale macchina: il titolo e l’oggetto dell’ammodernamento', () => {
  assert.equal(titoloTecnica('SOLO_ARGANO'), 'sostituzione dell’argano');
  assert.equal(titoloTecnica('AMMODERNAMENTO'), 'ammodernamento dell’impianto');
  assert.equal(oggettoTecnica('SOLO_ARGANO', SOLO, 'SICOR MR12'), null, 'la sostituzione come prima');
  assert.equal(oggettoTecnica('AMMODERNAMENTO', AMMOD, 'SICOR MR12'), 'Sostituzione dell’argano nell’ammodernamento dell’impianto, con un argano a riduttore (SICOR MR12)');
  assert.equal(oggettoTecnica('AMMODERNAMENTO', KEPT, null), 'Verifica dell’argano esistente, che resta nell’ammodernamento dell’impianto');
});

test('bozza d’ordine e riepilogo: il tipo accanto alla norma; senza tipo come prima', () => {
  const L = defaultLift(), d = deriveLift(L), order = designOrder(L, liftAdvice(L), d);
  assert.ok(order);
  const input = {
    company: 'Ascensori di prova S.r.l.', companyCity: 'Milano', logo: null, author: null,
    project: { name: 'Condominio di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null },
    record: { kind: 'design' as const, id: 'cmtestorder45', sha256: 'a'.repeat(64), createdAt: new Date('2026-10-14T08:00:00Z'), label: null },
    order, room: [], values: d.values, collaudo: RIF,
  };
  const rows = (tipo?: TipoIntervento) => new Map(buildOrder({ ...input, ...(tipo ? { tipo } : {}) }).blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
  assert.equal(rows('AMMODERNAMENTO').get('Intervento'), 'Ammodernamento — rifacimento con l’arcata esistente');
  assert.equal(rows().get('Intervento'), undefined);
  assert.deepEqual(buildOrder(input), buildOrder({ ...input, tipo: null }));
  const P = makePres(calcIt, 'it-IT'), X = textsFor(P), a = analyse(PRESETS.B);
  assert.ok(summaryText(P, X, a, { badVisible: 0, intervento: { tipo: 'SOLO_ARGANO', collaudo: SOLO } }).includes('— Solo argano'));
  assert.ok(summaryText(P, X, a, { badVisible: 0, intervento: { tipo: 'AMMODERNAMENTO', collaudo: AMMOD } }).includes('— Ammodernamento'));
  assert.ok(summaryText(P, X, a, { badVisible: 0, intervento: null }).includes('— Sostituzione dell’argano'));
});
