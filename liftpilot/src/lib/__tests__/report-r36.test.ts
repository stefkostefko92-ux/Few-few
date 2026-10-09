// Round 36: the relazione di calcolo as a lift designer signs it — the references of the standard the lift is tested to,
// once per document (L1-05, L1-11); the machine called by its Italian name; the rails and the loads on the building
// with their numbers and the drawing sets it goes with (L2-10); the groove's specific pressure and the ropes'
// designation (L1-09); the whole machine's mass where the catalogue's is not (L1-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import { SHAFT_ENGINE_VERSION, defaultInputs, shaftSnapshot, type ShaftInputs } from '@/shaft';
import { buildReport, type ReportInput } from '../report/build';
import type { ReportDoc } from '../report/model';
import type { ReportDesign } from '../report/shaft';
import { checkRefs, mergeRefs, otherNorma } from '../report/refs';
import { VOCI } from '@/calc/norme';
import { NO_MARKS } from '../lift/marks';
import { PARTI } from '../lift/collaudo';

const input = (k: 'A' | 'B' | 'C'): ReportInput => ({
  calc: { id: 'cmtest0001', label: 'offerta 1', createdAt: new Date('2026-09-30T08:00:00Z'), sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: 'Mario Rossi' },
  project: { name: 'Impianto di prova', address: 'Via Roma 12', city: 'Milano', province: 'MI', plantNumber: 'MI 1/98', client: null },
  company: 'Ditta di prova', values: PRESETS[k], generatedAt: new Date('2026-09-30T09:00:00Z'), reviews: [],
});
const design = (inputs: ShaftInputs): ReportDesign => ({
  id: 'cmdesign01', label: 'rilievo', createdAt: new Date('2026-09-29T16:00:00Z'), sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION,
  profileId: 'IT-2026.1', author: 'Mario Rossi', layout: shaftSnapshot(inputs).layout, source: null,
});
const texts = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => {
  switch (b.t) {
    case 'kv': return b.rows.flat();
    case 'grid': return [...b.head, ...b.rows.flat()];
    case 'list': return b.items;
    case 'sign': return b.labels;
    case 'plan': return [b.scale];
    case 'letterhead': return [...b.from, ...b.to];
    default: return [b.text];
  }
});
const heads = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'h2' ? [b.text.replace(/^\d+\. /, '')] : []));
const refColumn = (doc: ReportDoc): Map<string, string> => {
  const g = doc.blocks.find((b) => b.t === 'grid' && b.head.includes('Riferimento') && b.rows.some((r) => r[0]?.includes('Aderenza')));
  assert.ok(g && g.t === 'grid');
  return new Map(g.rows.map((r) => [r[0] ?? '', r[4] ?? '']));
};

test('riferimenti delle verifiche: un documento una volta, le sue clausole in ordine', () => {
  assert.equal(mergeRefs(['UNI EN 81-50:2020, 5.11.2.1', 'UNI EN 81-50:2020, 5.11.3 e 5.11.2.1', 'UNI 10411-1:2024, 14.1 ⚠']),
    'UNI EN 81-50:2020, 5.11.2.1 e 5.11.3; UNI 10411-1:2024, 14.1 ⚠');
  assert.equal(mergeRefs(['UNI EN 81-50:2020, 5.11.3 (termine III)', 'UNI EN 81-50:2020, 5.11.3']), 'UNI EN 81-50:2020, 5.11.3');
  assert.equal(mergeRefs(['A', 'B', 'C'], 2), 'A; B');
  assert.ok(otherNorma('UNI 10411-1:2024, 14.1', '10411-11') && !otherNorma('UNI 10411-1:2024, 14.1', '10411-1'));
  assert.ok(otherNorma('UNI 10411-11:2024, 14.1', 'en81') && !otherNorma('UNI EN 81-20:2020, 5.5', 'en81'));
  // the groove's references: an entry of another groove is not cited
  assert.ok(!checkRefs(VOCI, 'tr_load', { norma: 'en81', groove: 'VH' }).includes('5.11.2.3.1.1'), 'gola V: non la clausola della gola U');
  assert.ok(checkRefs(VOCI, 'tr_load', { norma: 'en81', groove: 'UU' }).includes('5.11.2.3.1.1'));
});

test('relazione: la norma di collaudo dell’impianto nei riferimenti delle verifiche, nessuna dell’altra parte', () => {
  for (const norma of ['10411-1', '10411-11', 'en81'] as const) {
    const doc = buildReport({ ...input('B'), marks: { ...NO_MARKS, collaudo: { norma, parti: [...PARTI] } } }), refs = refColumn(doc);
    for (const [check, ref] of refs) {
      const docs = ref.split('; ').map((x) => x.split(', ')[0]);
      assert.equal(new Set(docs).size, docs.length, `${norma} ${check}: un documento una volta — ${ref}`);
      // the specific pressure is UNI 10411-1's formula wherever it is cited
      if (ref.endsWith('(formula)')) continue;
      if (norma !== '10411-1') assert.ok(!ref.includes('UNI 10411-1:'), `${norma} ${check}: ${ref}`);
      if (norma !== '10411-11') assert.ok(!ref.includes('UNI 10411-11:'), `${norma} ${check}: ${ref}`);
    }
    const press = [...refs].find(([k]) => k.includes('Pressione specifica'));
    assert.ok(press, `${norma}: riga della pressione nella gola`);
    assert.equal(press[1], norma === '10411-1' ? 'UNI 10411-1:2024, appendice D.2' : 'UNI 10411-1:2024, appendice D.2 (formula)');
  }
});

test('relazione: «argano a riduttore», la designazione delle funi, la massa dell’argano completo', () => {
  const doc = buildReport(input('A')), all = texts(doc);
  assert.ok(all.some((x) => x.startsWith('Verifica dell’argano a riduttore')));
  assert.ok(!all.some((x) => /\bgeared\b/.test(x)), 'nessun «geared»');
  // the ropes of the calculation's family: their construction and grade named, to be confirmed by the supplier
  assert.ok(all.some((x) => x.includes('8×19 Seale, anima tessile, 1570 N/mm², EN 12385-5')), 'designazione delle funi');
  // the output torque of the gearbox: the three cases and the largest
  for (const x of ['accelerazione', 'frenatura di emergenza', 'prova statica']) assert.ok(all.some((y) => y.toLowerCase().includes(x)), x);
  // a Montanari catalogue mass is the gearbox alone: the note with the whole machine
  const mont = buildReport({ ...input('A'), values: { ...PRESETS.A, n_mass: 250, n_model: 'Montanari M93' }, marks: { ...NO_MARKS, catalog: { brand: 'Montanari', model: 'M93', ratio: '1/62', staticKg: 4000, src: 'D: prova' } } });
  assert.ok(texts(mont).some((x) => x.startsWith('⚠ La massa del catalogo (250 kg) è') && x.includes('argano completo')), 'nota sulla massa');
});

test('relazione di un progetto: guide e carichi sulle strutture con i numeri, gli elaborati grafici emessi', () => {
  const I = { ...defaultInputs(1600, 1750), access: 'none' as const }, D = design(I);
  const none = buildReport({ ...input('A'), design: D });
  const h = heads(none);
  assert.ok(h.includes('Guide e carichi sulle strutture') && h.includes('Elaborati grafici'), h.join(' | '));
  const all = texts(none);
  for (const x of ['Spinte all’intervento del paracadute Fx · Fy', 'Frecce δx · δy']) assert.ok(all.includes(x), x);
  assert.ok(all.some((x) => x.startsWith('Nessuna serie di tavole è ancora emessa')));
  // the sets issued: the latest revision of each number
  const sets = [
    { number: '26-007', revision: 0, pages: 6, createdAt: new Date('2026-10-01T09:00:00Z'), sha256: 'a'.repeat(64) },
    { number: '26-007', revision: 1, pages: 7, createdAt: new Date('2026-10-03T09:00:00Z'), sha256: 'b'.repeat(64) },
  ];
  const issued = buildReport({ ...input('A'), design: D, drawings: sets, plant: { safetyGear: 'progressive', governorLoad: 300 } });
  const g = issued.blocks.find((b) => b.t === 'grid' && b.head[0] === 'Tavole');
  assert.ok(g && g.t === 'grid');
  assert.deepEqual(g.rows.map((r) => [r[0], r[1], r[2]]), [['DIS. N° 26-007', 'R1', '7']]);
  // without a design neither section
  const plain = heads(buildReport(input('A')));
  assert.ok(!plain.includes('Guide e carichi sulle strutture') && !plain.includes('Elaborati grafici'));
});
