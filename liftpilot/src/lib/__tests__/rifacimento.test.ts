// The renovation that keeps the existing sling (arcata): a third intervention of the one form, a modification tested to
// UNI 10411 with every part replaced but the sling; going to it and back sets the parts and the ropes kept, a new lift
// in between loses nothing, nor does a standard added there; the mark goes through the server's schema, the
// derivation, the relazione, sheet 1, the order and the summary; a design without it reads as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { analyse } from '@/lib/present/analysis';
import { summaryText } from '@/lib/present/summary';
import { textsFor } from '@/lib/present/texts';
import { makePres } from '@/lib/present/tr';
import { defaultInputs, layout, type ShaftInputs } from '@/shaft';
import { liftInputsSchema } from '@/lib/lift-input';
import { AMBITO_VERIFICHE, INTERVENTI, PARTI, PARTI_RIFACIMENTO, VOCI_IMPIANTO, ambitoOf, collaudoOf, defaultLift, deriveLift, interventoOf, interventoTo,
  withAggiunta, type Collaudo } from '@/lib/lift';
import { liftAdvice } from '@/lib/lift/advice';
import { buildOrder } from '@/lib/order/build';
import { designOrder } from '@/lib/order/machine';
import { buildReport } from '../report/build';
import type { ReportDoc } from '../report/model';
import { buildTavole } from '../tavole/build';
import type { TavoleInput } from '../tavole/input';
import calcIt from '../../../messages/calc/it.json';

const REPL = { context: 'repl' }, NEW = { context: 'new' };
const RIF: Collaudo = { norma: '10411-1', parti: PARTI_RIFACIMENTO, rifacimento: true };
const marks = (collaudo: Collaudo) => ({ pEstimate: false, geometry: [], machineProposed: false, collaudo });

test('le parti del rifacimento: tutte tranne l’arcata e le variazioni', () => {
  assert.deepEqual(PARTI_RIFACIMENTO, PARTI.filter((p) => !['sling', 'speed', 'load', 'travel'].includes(p)));
  assert.deepEqual([...INTERVENTI], ['repl', 'rifacimento', 'new']);
});

test('collaudoOf: il rifacimento tiene l’arcata fuori dalle parti, solo sotto la UNI 10411', () => {
  assert.deepEqual(collaudoOf(REPL, RIF), RIF);
  // the sling ticked by hand stays out; a change of speed stays in
  assert.deepEqual(collaudoOf(REPL, { ...RIF, parti: ['sling', 'machine', 'speed'] }), { norma: '10411-1', parti: ['machine', 'speed'], rifacimento: true });
  assert.deepEqual(collaudoOf(REPL, { ...RIF, norma: '10411-11', aggiuntive: ['en81-80'] }), { norma: '10411-11', parti: PARTI_RIFACIMENTO, rifacimento: true, aggiuntive: ['en81-80'] });
  // tested to EN 81-20/50 the lift is tested as new: no renovation; a new lift likewise
  assert.deepEqual(collaudoOf(REPL, { ...RIF, norma: 'en81' }), { norma: 'en81', parti: PARTI });
  assert.deepEqual(collaudoOf(NEW, RIF), { norma: 'en81', parti: PARTI });
  // without the mark nothing changes: the sling can be replaced in a modification (DPR 162/1999, art. 2 c.1 lett. cc))
  assert.deepEqual(collaudoOf(REPL, { norma: '10411-1', parti: ['machine', 'sling'] }), { norma: '10411-1', parti: ['machine', 'sling'] });
});

test('ambito: con il rifacimento restano «esistente» solo l’arcata e il locale dell’edificio', () => {
  const existing = (C: Collaudo) => Object.keys(AMBITO_VERIFICHE).filter((id) => ambitoOf(C, id as keyof typeof AMBITO_VERIFICHE) === 'existing');
  assert.deepEqual(existing(RIF), ['m_height', 'm_door', 'sg_type']);
  // a new speed brings the safety gear's type into the test
  assert.deepEqual(existing({ ...RIF, parti: [...PARTI_RIFACIMENTO, 'speed'] }), ['m_height', 'm_door']);
});

test('intervento: le tre scelte, e andata e ritorno', () => {
  assert.equal(interventoOf(REPL), 'repl');
  assert.equal(interventoOf(REPL, { norma: '10411-1', parti: PARTI.filter((p) => p !== 'sling') }), 'repl', 'le parti da sole non fanno il rifacimento');
  // to the renovation: every part but the sling, new ropes free of those in place; the part of UNI 10411 and the standards added stay
  const toRif = interventoTo('rifacimento', { norma: '10411-11', parti: ['machine'], aggiuntive: ['en81-28'] });
  assert.deepEqual(toRif, { calc: { context: 'repl', keepRopes: false }, collaudo: { norma: '10411-11', parti: PARTI_RIFACIMENTO, rifacimento: true, aggiuntive: ['en81-28'] } });
  assert.equal(interventoOf({ ...REPL, ...toRif.calc }, toRif.collaudo), 'rifacimento');
  // from EN 81-20/50 chosen on a modification: UNI 10411-1
  assert.equal(interventoTo('rifacimento', { norma: 'en81', parti: [] }).collaudo?.norma, '10411-1');
  // a new lift keeps what was chosen; back to the renovation it is the same, with its parts as left
  const mine: Collaudo = { ...RIF, parti: PARTI_RIFACIMENTO.filter((p) => p !== 'landingDoors') };
  assert.deepEqual(interventoTo('new', mine), { calc: { context: 'new' } });
  assert.equal(interventoOf(NEW, mine), 'new');
  assert.deepEqual(interventoTo('rifacimento', mine), { calc: { context: 'repl' }, collaudo: mine });
  // back to the machine's replacement: the machine alone, the ropes' number and diameter in place
  assert.deepEqual(interventoTo('repl', { ...RIF, aggiuntive: ['en81-80'] }), { calc: { context: 'repl', keepRopes: true }, collaudo: { norma: '10411-1', parti: ['machine'], aggiuntive: ['en81-80'] } });
  // a replacement as it was chosen stays
  assert.deepEqual(interventoTo('repl', { norma: '10411-1', parti: ['machine', 'ropes'] }), { calc: { context: 'repl' } });
  assert.deepEqual(interventoTo('repl'), { calc: { context: 'repl' } });
});

test('norme aggiunte sotto «Nuovo impianto»: la modifica scelta resta, al ritorno non si perde nulla', () => {
  // the renovation under UNI 10411-11 without the landing doors, then a new lift with EN 81-28 ticked, then back
  const mine: Collaudo = { norma: '10411-11', parti: PARTI_RIFACIMENTO.filter((p) => p !== 'landingDoors'), rifacimento: true };
  const ticked = withAggiunta(true, mine, collaudoOf(NEW, mine), 'en81-28', true);
  assert.deepEqual(ticked, { ...mine, aggiuntive: ['en81-28'] });
  assert.deepEqual(collaudoOf(NEW, ticked), { norma: 'en81', parti: PARTI, aggiuntive: ['en81-28'] });
  assert.deepEqual(interventoTo('rifacimento', ticked), { calc: { context: 'repl' }, collaudo: ticked });
  assert.deepEqual(collaudoOf(REPL, ticked), { ...mine, aggiuntive: ['en81-28'] });
  // the machine's replacement likewise: UNI 10411-11 stays its base
  const repl11: Collaudo = { norma: '10411-11', parti: ['machine', 'ropes'] };
  assert.deepEqual(collaudoOf(REPL, withAggiunta(true, repl11, collaudoOf(NEW, repl11), 'dm236', true)), { ...repl11, aggiuntive: ['dm236'] });
  // nothing chosen yet: the replacement's default, not the new lift's EN 81-20/50
  assert.deepEqual(withAggiunta(true, undefined, collaudoOf(NEW), 'dm236', true), { norma: '10411-1', parti: ['machine'], aggiuntive: ['dm236'] });
  // a standard only for a new lift (EN 81-21) stays chosen when another is ticked under a modification
  const only: Collaudo = { norma: '10411-1', parti: ['machine'], aggiuntive: ['en81-21'] };
  const both = withAggiunta(false, only, collaudoOf(REPL, only), 'en81-28', true);
  assert.deepEqual(both.aggiuntive, ['en81-21', 'en81-28']);
  assert.deepEqual(collaudoOf(REPL, both).aggiuntive, ['en81-28']);
  assert.deepEqual(collaudoOf(NEW, both).aggiuntive, ['en81-21', 'en81-28']);
  // taken off again
  assert.deepEqual(withAggiunta(false, ticked, collaudoOf(REPL, ticked), 'en81-28', false), mine);
});

test('dal modulo al server: lo schema accetta il segno, la derivazione lo porta, il resto come prima', () => {
  const base = defaultLift(), repl = { ...base, calc: { ...base.calc, context: 'repl' } };
  assert.ok(liftInputsSchema.safeParse({ ...repl, collaudo: RIF }).success);
  for (const bad of [false, 'sì', 1]) assert.equal(liftInputsSchema.safeParse({ ...repl, collaudo: { ...RIF, rifacimento: bad } }).success, false, String(bad));
  assert.deepEqual(deriveLift({ ...repl, collaudo: RIF }).collaudo, RIF);
  assert.deepEqual(deriveLift({ ...repl, collaudo: { norma: '10411-11', parti: ['ropes'] } }).collaudo, { norma: '10411-11', parti: ['ropes'] });
  // the registry has the practice, with its status
  const v = VOCI_IMPIANTO.find((x) => x.id === 'impianto.rifacimento');
  assert.ok(v && v.stato === 'prassi' && v.riferimento.includes('art. 2 c.1 lett. cc)'));
});

const report = (collaudo?: Collaudo): ReportDoc => buildReport({
  calc: { id: 'cmtest0027', label: null, createdAt: new Date('2026-10-05T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
  project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
  company: 'Ditta di prova', values: PRESETS.B, generatedAt: new Date('2026-10-05T09:00:00Z'), reviews: [],
  ...(collaudo ? { marks: marks(collaudo) } : {}),
});
const kv = (doc: ReportDoc): Map<string, string> => new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
const h1 = (doc: ReportDoc): string => doc.blocks.find((b) => b.t === 'h1')?.text ?? '';
const paras = (doc: ReportDoc): string => doc.blocks.flatMap((b) => (b.t === 'p' ? [b.text] : [])).join('\n');

test('relazione: titolo, oggetto, contesto e voce del registro del rifacimento; la sostituzione come prima', () => {
  const rif = report(RIF), machine = report();
  assert.equal(h1(rif), "Relazione di calcolo — rifacimento dell’impianto con l’arcata esistente");
  assert.equal(h1(machine), "Relazione di calcolo — sostituzione dell’argano");
  assert.equal(kv(rif).get('Contesto'), 'Rifacimento con arcata esistente');
  assert.equal(kv(machine).get('Contesto'), "Sostituzione dell’argano");
  assert.equal(kv(rif).get('Normativa di riferimento per il collaudo'), 'UNI 10411-1:2024');
  assert.ok(!(kv(rif).get('Parti sostituite o modificate') ?? '').includes('arcata'), 'l’arcata non è tra le parti sostituite');
  const p = paras(rif);
  assert.ok(p.includes("per il rifacimento di un impianto esistente che ne mantiene l’arcata"));
  assert.ok(p.includes('art. 2, comma 1, lettera cc)') && p.includes('«impianto.rifacimento»') && p.includes('Il collaudo segue la UNI 10411-1:2024'));
  assert.ok(!paras(machine).includes('rifacimento'));
  const reg = (doc: ReportDoc) => doc.blocks.find((b) => b.t === 'grid' && b.head[0] === 'Voce');
  const rows = reg(rif), rows0 = reg(machine);
  assert.ok(rows && rows.t === 'grid' && rows.rows.some((r) => r[0] === "Rifacimento con l’arcata esistente" && r[3] === 'prassi di cantiere'));
  assert.ok(rows0 && rows0.t === 'grid' && !rows0.rows.some((r) => r[0] === "Rifacimento con l’arcata esistente"));
});

const sheet1 = (collaudo?: Collaudo): string => {
  const I: ShaftInputs = { ...defaultInputs(1740, 1445), Q: 630, access: 'none', room: null };
  const x: TavoleInput = {
    values: PRESETS.C, layout: layout(I), plant: {}, ...(collaudo ? { marks: marks(collaudo) } : {}),
    project: { name: 'Impianto di prova', address: null, city: null, province: null, plantNumber: null, client: null },
    company: { name: 'Ditta di prova', logo: null }, set: { number: '26-027', issuedAt: new Date('2026-10-05T10:00:00Z'), author: 'LP', revisions: [] },
  };
  return (buildTavole(x).doc.pages[0]?.shapes.flatMap((s) => (s.t === 'text' ? [s.text] : [])) ?? []).join(' ');
};

test('foglio 1: arcata esistente e la nota del collaudo', () => {
  const rif = sheet1(RIF), machine = sheet1({ norma: '10411-1', parti: ['machine'] });
  assert.ok(rif.includes('ARCATA tipo ESISTENTE') && rif.includes('PORTE DI PIANO tipo AUTOMATICHE'), 'arcata esistente, porte nuove');
  assert.ok(rif.includes("Collaudo secondo UNI 10411-1:2024. Rifacimento con l’arcata esistente"), 'nota del rifacimento');
  assert.ok(!machine.includes('Rifacimento'), 'la sostituzione come prima');
});

test('bozza d’ordine e riepilogo: il rifacimento accanto alla norma', () => {
  const L = defaultLift(), d = deriveLift(L), order = designOrder(L, liftAdvice(L), d);
  assert.ok(order);
  const input = {
    company: 'Ascensori di prova S.r.l.', companyCity: 'Milano', logo: null, author: null,
    project: { name: 'Condominio di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null },
    record: { kind: 'design' as const, id: 'cmtestorder27', sha256: 'a'.repeat(64), createdAt: new Date('2026-10-05T08:00:00Z'), label: null },
    order, room: [], generatedAt: new Date('2026-10-05T10:00:00Z'),
  };
  const norma = (C: Collaudo) => new Map(buildOrder({ ...input, collaudo: C }).blocks.flatMap((b) => (b.t === 'kv' ? b.rows : []))).get('Norma del collaudo');
  assert.equal(norma(RIF), 'UNI 10411-1:2024 (rifacimento con l’arcata esistente)');
  assert.equal(norma({ norma: '10411-1', parti: ['machine'] }), 'UNI 10411-1:2024');
  const P = makePres(calcIt, 'it-IT'), X = textsFor(P), a = analyse(PRESETS.B);
  assert.ok(summaryText(P, X, a, { badVisible: 0, rifacimento: true }).includes('— Rifacimento con arcata esistente'));
  assert.ok(summaryText(P, X, a, { badVisible: 0 }).includes("— Sostituzione dell’argano"));
});
