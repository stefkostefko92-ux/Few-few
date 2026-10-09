// The acceptance test in the documents (src/lib/report/collaudo.ts, build.ts) at its two edges: a lift tested as new
// (EN 81-20/50) never reads as a renovation, whatever was kept in the stored choice; and a record saved before the
// renovation existed (no `rifacimento`) reads as the replacement it always was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { collaudoSchema } from '@/lib/lift-input';
import { PARTI, collaudoOf, type Collaudo } from '@/lib/lift';
import { buildReport } from '../report/build';
import { collaudoNote, collaudoText } from '../report/collaudo';
import type { ReportDoc } from '../report/model';

// what a stored record's choice becomes: read through the schema, then normalised (src/server/records.ts storedCollaudo)
const storedCollaudo = (values: typeof PRESETS.B, raw: unknown): Collaudo => {
  const chosen = raw ? collaudoSchema.safeParse(raw) : null;
  return collaudoOf(values, chosen?.success ? chosen.data : undefined);
};

const REPL = { context: 'repl' } as const;
const RIF = { norma: '10411-1', parti: ['machine', 'ropes'], rifacimento: true } as const;
const EN81_RIF = { norma: 'en81', parti: [...PARTI], rifacimento: true } as const;

const report = (collaudo: Collaudo): ReportDoc => buildReport({
  calc: { id: 'cmtest0027', label: null, createdAt: new Date('2026-10-05T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
  project: { name: 'Impianto di prova', address: null, city: 'Milano', province: 'MI', plantNumber: null, client: null },
  company: 'Ditta di prova', values: PRESETS.B, reviews: [],
  marks: { pEstimate: false, geometry: [], machineProposed: false, collaudo },
});
const h1 = (doc: ReportDoc): string => doc.blocks.find((b) => b.t === 'h1')?.text ?? '';
const kv = (doc: ReportDoc): Map<string, string> => new Map(doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : [])));
const paras = (doc: ReportDoc): string => doc.blocks.flatMap((b) => (b.t === 'p' ? [b.text] : [])).join('\n');

test('collaudato come nuovo (EN 81-20/50) con un rifacimento rimasto nella scelta: il rifacimento cade', () => {
  const C = collaudoOf(REPL, EN81_RIF);
  assert.deepEqual(C, { norma: 'en81', parti: PARTI });
  assert.ok(!('rifacimento' in C));
});

test('la relazione di un record con norma EN 81 e rifacimento salvato: sostituzione, collaudo come nuovo, nessun testo del rifacimento', () => {
  const C = storedCollaudo(PRESETS.B, EN81_RIF), doc = report(C);
  assert.equal(h1(doc), "Relazione di calcolo — sostituzione dell’argano");
  assert.notEqual(kv(doc).get('Contesto'), 'Rifacimento con arcata esistente');
  assert.equal(kv(doc).get('Normativa di riferimento per il collaudo')?.includes('EN 81'), true);
  assert.ok(!/rifacimento|arcata/i.test(paras(doc)), 'nessun testo del rifacimento');
});

test('i testi della sezione: EN 81 non riporta mai il rifacimento, nemmeno se il dato lo avesse', () => {
  assert.ok(!/Rifacimento/.test(collaudoText(EN81_RIF, true)));
  assert.equal(collaudoNote(EN81_RIF, 'x'), null, 'foglio 1: nessuna nota senza norme aggiunte');
  const withAdded = collaudoNote({ ...EN81_RIF, aggiuntive: ['dm236'] }, 'x');
  assert.ok(withAdded && !/Rifacimento/.test(withAdded.text));
});

test('sotto UNI 10411 il rifacimento è dichiarato nel testo e nella nota del foglio 1', () => {
  assert.match(collaudoText(RIF, true), /Rifacimento dell’impianto con l’arcata esistente/);
  assert.match(collaudoNote(RIF, 'x')?.text ?? '', /Rifacimento con l’arcata esistente/);
});

test('un impianto nuovo non parla di rifacimento nemmeno con la norma UNI e il flag nel record', () => {
  assert.deepEqual(collaudoOf({ context: 'new' }, RIF), { norma: 'en81', parti: PARTI });
});

test('record vecchio senza `rifacimento`: si legge come prima, mai come rifacimento', () => {
  const old = { norma: '10411-1', parti: ['machine', 'ropes'] };
  const read = collaudoSchema.safeParse(old);
  assert.equal(read.success, true);
  assert.equal(read.success && read.data.rifacimento, undefined);
  const C = storedCollaudo(PRESETS.B, old);
  assert.deepEqual(C, { norma: '10411-1', parti: ['machine', 'ropes'] });
  assert.ok(!('rifacimento' in C));
  const doc = report(C);
  assert.equal(h1(doc), "Relazione di calcolo — sostituzione dell’argano");
  assert.ok(!/rifacimento|arcata/i.test(paras(doc)));
  assert.ok(!/Rifacimento/.test(collaudoNote(C, 'x')?.text ?? ''));
});

test('record vecchio senza scelta (null): il predefinito della sostituzione', () => {
  assert.deepEqual(storedCollaudo(PRESETS.B, null), { norma: '10411-1', parti: ['machine'] });
});

test('`rifacimento` che non è `true` non passa mai lo schema', () => {
  for (const bad of [false, 'true', 1, null]) assert.equal(collaudoSchema.safeParse({ ...RIF, rifacimento: bad }).success, false, String(bad));
});
