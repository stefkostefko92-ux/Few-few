// Round 37 (J): the relazione di calcolo as sheet 1 and the issued sets have it — the ropes the intervention keeps are
// the existing ones, ropes of the calculation's own number and diameter new everywhere whatever the test's parts
// (collaudo.ts ropesKept; W2-L1a-02); with the machine under the pit the counterweight's safety gear is a check of the
// relazione too, counted in its result (W2-L1b-03); P4 «DA FORNITORE» and where P4 and P9 act by the scheme
// (W2-L3a2-03); an issued set drawn with other data of the installation than the ones the relazione reads is named,
// in the relazione (only the fields its rails and loads read) and in the relazione tecnica, with the fingerprint of the
// data (W2-G1-01).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import calcIt from '../../../messages/calc/it.json';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { SHAFT_ENGINE_VERSION } from '@/shaft';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { liftAdvice } from '@/lib/lift/advice';
import { collaudoOf, partKept, ropesKept, ropesOutsideTest, type Collaudo } from '../lift/collaudo';
import { NO_MARKS, valueMarks } from '../lift/marks';
import { rigLength } from '../lift/rope';
import { ropeCut } from '../lift/support';
import { buildOrder } from '../order/build';
import { designOrder } from '../order/machine';
import { designSite } from '../order/site';
import { plantDiff, plantSchema, type Plant } from '../plant';
import { calcBom, designBom } from '../prices/bom';
import { analyse } from '../present/analysis';
import { textsFor } from '../present/texts';
import { makePres } from '../present/tr';
import { buildReport } from '../report/build';
import { plantChanged, type IssuedSet } from '../report/elaborati';
import type { ReportBlock, ReportDoc } from '../report/model';
import { buildTecnica } from '../report/tecnica';
import { deriveRoom } from '../room/derive';
import { startSurvey } from '../room/survey';
import { storedInput } from '../tavole/compose';
import { dataSheet } from '../tavole/data';
import { GOVERNOR_LOAD_UNSET, loadPlaces } from '../tavole/loads';
import { GUIDE_PLANT_FIELDS } from '../tavole/sheet-loads';

const DAY = new Date('2026-10-09T08:00:00Z');
const project = { name: 'Impianto di prova', address: null, city: 'Monza', province: 'MB', plantNumber: null, client: null };
const below = (scheme: 'head' | 'room' | 'under'): LiftInputs => {
  const L = newLift();
  return { ...L, calc: { ...L.calc, layout: 'bottom' }, shaft: { ...L.shaft, room: null }, bottom: scheme };
};
const replacement = (parti: readonly string[] | null): LiftInputs => {
  const L = newLift();
  return { ...L, calc: { ...L.calc, context: 'repl' }, ...(parti ? { collaudo: { norma: '10411-1', parti } } : {}) } as LiftInputs;
};

/** The relazione of a lift design as the server makes it, with the data of the installation and the sets issued. */
function relazione(inp: LiftInputs, plant: Plant = {}, drawings: readonly IssuedSet[] = [], plantSha256: string | null = null): ReportDoc {
  const d = deriveLift(inp);
  return buildReport({
    calc: { id: 'cmtest037j', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
    project, company: 'Ditta di prova', values: d.values, reviews: [],
    design: { id: 'cmdesign7j', label: null, createdAt: DAY, sha256: 'e'.repeat(64), engineVersion: SHAFT_ENGINE_VERSION, profileId: 'IT-2026.1', author: null, layout: d.layout, source: null },
    marks: valueMarks(inp.auto, d, d.bottom, d.collaudo), plant, drawings, plantSha256,
  });
}
/** Sheet 1 of the set of the same design, with the same data. */
function sheet1(inp: LiftInputs, plant: Plant = {}) {
  const d = deriveLift(inp), x = storedInput(d.values, d.layout, { number: '26-001', createdAt: DAY, authorInitials: 'T', companyName: 'S', plant, revisions: [],
    projectData: project }, null, valueMarks(inp.auto, d, d.bottom, d.collaudo));
  assert.ok(x);
  return dataSheet(x, analyse(d.values), 9).sheet;
}
const lines = (b: ReportBlock): string[] => (b.t === 'kv' ? b.rows.map((r) => r.join(': ')) : b.t === 'grid' ? b.rows.map((r) => r.join(' | ')) : 'text' in b ? [b.text] : []);
const all = (doc: ReportDoc): string[] => doc.blocks.flatMap(lines);
const row = (doc: ReportDoc, first: string): readonly string[] | undefined =>
  doc.blocks.flatMap((b) => (b.t === 'grid' ? b.rows : [])).find((r) => r[0] === first);
const failing = (doc: ReportDoc): number => Number(all(doc).find((x) => x.startsWith('Esito delle verifiche di calcolo: '))?.match(/(\d+) verific/)?.[1] ?? 0);

test('relazione: le funi che l’intervento lascia sono quelle esistenti, come sul foglio 1; nuove solo se sostituite', () => {
  for (const [parti, kept] of [[null, true], [['machine', 'ropes'], false]] as const) {
    const inp = replacement(parti), d = deriveLift(inp);
    assert.equal(partKept(d.collaudo, 'ropes'), kept);
    const text = all(relazione(inp)), ropes = text.filter((x) => /^Funi (nuove|esistenti): /.test(x));
    assert.equal(ropes.length, 1, `${parti}: ${ropes.join(' / ')}`);
    assert.ok(ropes[0]?.startsWith(kept ? 'Funi esistenti: ' : 'Funi nuove: '), ropes[0]);
    // sheet 1 says the same
    const spec = sheet1(inp).specs.find((r) => r[0] === 'FUNI DI SOSPENSIONE')?.[2] ?? '';
    assert.equal(spec.endsWith(' ESISTENTI'), kept, spec);
  }
  // a new lift: new ropes; the relazione tecnica names the row «Funi» for both machines
  assert.equal(partKept({ norma: 'en81', parti: [] }, 'ropes'), false);
  const X = textsFor(makePres(calcIt, 'it-IT')), a = analyse(PRESETS.C), rows = X.machineRows(a.ctx.N, a.res, false, true);
  assert.ok(rows.some((r) => r[0] === 'Funi esistenti'));
});

/** The relazione of a calculation of the replacement alone (no design), with the test chosen or the default. */
const calcRelazione = (V: FormValues, collaudo?: Collaudo): ReportDoc => buildReport({
  calc: { id: 'cmtest037k', label: null, createdAt: DAY, sha256: 'f'.repeat(64), engineVersion: '1.0.0', profileId: 'IT-2026.1', author: null },
  project, company: 'Ditta di prova', values: V, reviews: [], marks: collaudo ? { ...NO_MARKS, collaudo } : NO_MARKS,
});
const OWN_ROPES: FormValues = { ...PRESETS.C, keepRopes: false, n_n: 5, n_d: 8, n_Fmin: 40, n_qf: 0.22 };
const ropesNote = (doc: ReportDoc): boolean => all(doc).some((x) => x.startsWith('⚠ Il calcolo non tiene numero e diametro delle funi esistenti'));

test('funi di numero e diametro propri: nuove in relazione anche con il collaudo di default, con la nota del collaudo', () => {
  const C0 = collaudoOf(OWN_ROPES);
  assert.deepEqual(C0, { norma: '10411-1', parti: ['machine'] });
  assert.ok(partKept(C0, 'ropes') && !ropesKept(C0, OWN_ROPES) && ropesOutsideTest(C0, OWN_ROPES));
  // the default replacement: the new machine's ropes are new, the existing machine's the existing ones (one such row)
  const own = all(calcRelazione(OWN_ROPES));
  assert.ok(own.some((x) => x.startsWith('Funi nuove: 5 × Ø8,0 mm')), own.filter((x) => x.startsWith('Funi')).join(' / '));
  assert.deepEqual(own.filter((x) => x.startsWith('Funi esistenti: ')).map((x) => x.split(' · ')[0]), ['Funi esistenti: 4 × Ø11,0 mm']);
  assert.ok(ropesNote(calcRelazione(OWN_ROPES)));
  // the ropes among the parts replaced: new, nothing to add
  const withRopes = calcRelazione(OWN_ROPES, { norma: '10411-1', parti: ['machine', 'ropes'] });
  assert.ok(all(withRopes).some((x) => x.startsWith('Funi nuove: 5 × Ø8,0 mm')) && !ropesNote(withRopes));
  // the same number and diameter as the ropes in place: the existing ones, on both machines
  const same = calcRelazione(PRESETS.C), funi = all(same).filter((x) => /^Funi (nuove|esistenti): /.test(x));
  assert.ok(funi.length === 2 && funi.every((x) => x.startsWith('Funi esistenti: ')), funi.join(' / '));
  assert.ok(!ropesNote(same));
  // a new lift: new ropes whatever the values say, no note
  assert.ok(!ropesKept({ norma: 'en81', parti: [] }, OWN_ROPES) && !ropesOutsideTest({ norma: 'en81', parti: [] }, { ...OWN_ROPES, context: 'new' }));
  // the bill of the calculation: the ropes cut and their wedge sockets
  const bill = (V: FormValues): string[] => calcBom(V, collaudoOf(V)).flatMap((l) => (l.key ? [l.key] : []));
  assert.ok(bill(OWN_ROPES).includes('rope:8') && bill(OWN_ROPES).includes('rope-end:8'));
  assert.ok(!bill(PRESETS.C).some((k) => k.startsWith('rope')));
});

test('progetto di una modifica con funi proprie: foglio 1, distinta e bozza d’ordine le tagliano come nuove', () => {
  for (const keep of [true, false]) {
    const L = replacement(null), inp: LiftInputs = { ...L, calc: { ...L.calc, keepRopes: keep } }, d = deriveLift(inp), { I, N } = d.analysis.ctx;
    assert.equal(ropesKept(d.collaudo, d.values), keep);
    const sh = sheet1(inp), spec = (k: string): string => sh.specs.find((r) => r[0] === k)?.[2] ?? '', cut = ropeCut(I, rigLength(d));
    assert.equal(spec('FUNI DI SOSPENSIONE').endsWith(' ESISTENTI'), keep, spec('FUNI DI SOSPENSIONE'));
    assert.equal(spec('LUNGHEZZA DI TAGLIO FUNI (CIASCUNA)'), keep ? 'ESISTENTI' : String(cut));
    const bom = designBom(d), qty = (key: string): number => bom.find((l) => l.key === key)?.qty ?? 0;
    assert.deepEqual([qty(`rope:${N.d}`), qty(`rope-end:${N.d}`)], keep ? [0, 0] : [N.n * cut, 2 * N.n]);
    const order = designOrder(inp, liftAdvice(inp), d);
    assert.ok(order);
    const { room, site } = designSite(inp, d, order.machine, order.recorded);
    const text = buildOrder({ company: 'P', companyCity: null, logo: null, author: null, project: { name: 'P', address: null, city: null, province: null, plantNumber: null },
      record: { kind: 'design', id: 'x', sha256: 'a'.repeat(64), createdAt: DAY, label: null }, order, room, site, collaudo: d.collaudo, values: d.values })
      .blocks.flatMap(lines).join('\n');
    assert.equal(/lunghezza di taglio \d+ m ciascuna/.test(text), !keep);
    // the relazione names them as sheet 1 does, and asks for the ropes among the test's parts
    const rel = relazione(inp);
    assert.ok(all(rel).some((x) => x.startsWith(keep ? 'Funi esistenti: ' : 'Funi nuove: ')));
    assert.equal(ropesNote(rel), !keep);
  }
});

test('macchina sotto la fossa: il paracadute del contrappeso è una verifica della relazione, contata nell’esito come sul foglio 1', () => {
  const inp = below('under'), given: Plant = { cwSafetyGear: 'progressive', cwGearTrip: 'governor' };
  const sgRow = (doc: ReportDoc) => doc.blocks.flatMap((b) => (b.t === 'grid' ? b.rows.map((r, i) => ({ r, s: b.status?.[i] })) : []))
    .find(({ r }) => r[0]?.startsWith('Paracadute del contrappeso: spazio accessibile sotto il vano'));
  const none = relazione(inp), ok = relazione(inp, given);
  assert.equal(sgRow(none)?.s, 'fail', 'senza dati: non passa');
  assert.equal(sgRow(ok)?.s, 'ok', 'con il paracadute e il suo azionamento');
  assert.equal(failing(none), failing(ok) + 1);
  // sheet 1 has as many failing checks as the relazione's result counts
  const fails = (P: Plant): number => sheet1(inp, P).checks.filter((c) => c[3] === 'NON PASSA').length;
  assert.equal(fails({}), failing(none));
  assert.equal(fails(given), failing(ok));
  // a new lift: a pillar does not stand in place of the gear
  assert.equal(sgRow(relazione(inp, { cwSafetyGear: 'pillar' }))?.s, 'fail');
  // above the shaft: no such check
  assert.equal(sgRow(relazione(newLift())), undefined);
});

test('carichi P1…P9: P4 «DA FORNITORE» come sul foglio 1, e dove agiscono P4 e P9 secondo lo schema', () => {
  const p = (inp: LiftInputs, n: string, plant: Plant = {}) => row(relazione(inp, plant), n);
  assert.deepEqual([p(newLift(), 'P4')?.[1], p(newLift(), 'P4', { governorLoad: 350 })?.[1]], [GOVERNOR_LOAD_UNSET, '350']);
  assert.equal(sheet1(newLift()).P[3], GOVERNOR_LOAD_UNSET);
  const where = (inp: LiftInputs) => [p(inp, 'P4')?.[3], p(inp, 'P9')?.[3]];
  assert.deepEqual(where(newLift()), ['limitatore nel locale macchina', 'totale sulla soletta del locale macchina']);
  for (const s of ['head', 'under'] as const) {
    assert.deepEqual(where(below(s)), ['limitatore su mensola sotto il soffitto del vano', 'totale sulla soletta in testata del vano'], s);
    assert.equal(p(below(s), 'P4')?.[1], GOVERNOR_LOAD_UNSET);
  }
  assert.deepEqual(where(below('room')), ['limitatore nel locale delle pulegge', 'totale sulla soletta del locale delle pulegge']);
  // no machine room over the shaft: nothing "nel locale"
  assert.ok(loadPlaces(null, false).every((x) => !x.includes('locale')));
  assert.equal(loadPlaces(null, true).length, 9);
});

const SET = (revision: number, plant: Plant): IssuedSet => ({ number: '26-196', revision, pages: 12, createdAt: DAY, sha256: `${revision}`.repeat(64), plant });

test('dati dell’impianto cambiati dopo l’emissione: la relazione nomina le tavole e i campi, il foglio 1 resta com’è', () => {
  const inp = newLift(), issued: Plant = { safetyGear: 'progressive' }, edited: Plant = { safetyGear: 'instantaneous', carBracketPitch: 4500 };
  assert.deepEqual(plantDiff(issued, edited).sort(), ['carBracketPitch', 'safetyGear']);
  assert.deepEqual(plantDiff({ control: 'x' }, { control: 'x' }), []);
  const box = (doc: ReportDoc) => doc.blocks.find((b) => b.t === 'box' && b.text.startsWith('⚠ DATI DELL’IMPIANTO MODIFICATI'));
  // the same data: the relazione and sheet 1 agree, nothing said
  const same = relazione(inp, issued, [SET(0, issued)], 'a'.repeat(64));
  assert.equal(box(same), undefined);
  assert.ok(all(same).some((x) => x.includes('Le stesse forze e gli stessi limiti del foglio 1 delle tavole')));
  assert.ok(all(same).includes(`Impronta SHA-256 dei dati dell’impianto (guide e carichi): ${'a'.repeat(64)}`));
  // edited after the issue: the box in «Elaborati grafici» with the set and the fields, the rails' paragraph says it
  const moved = relazione(inp, edited, [SET(0, issued)], 'b'.repeat(64)), b = box(moved);
  assert.ok(b && b.t === 'box' && b.text.includes('DIS. N° 26-196 (passo staffe cabina, paracadute)'), b && 'text' in b ? b.text : 'nessuna nota');
  assert.ok(all(moved).some((x) => x.includes('Forze e limiti calcolati con i dati dell’impianto attuali') && x.includes('DIS. N° 26-196')));
  assert.ok(!all(moved).some((x) => x.includes('Le stesse forze e gli stessi limiti del foglio 1')));
  // the latest revision is the one compared: R1 issued with the edited data agrees
  assert.deepEqual(plantChanged([SET(0, issued), SET(1, edited)], edited), []);
  assert.deepEqual(plantChanged([SET(0, issued), SET(1, issued)], edited), ['DIS. N° 26-196 R1 (passo staffe cabina, paracadute)']);
  // a set without its data read: not compared; a calculation without a design: no fingerprint
  assert.deepEqual(plantChanged([{ number: '26-196', revision: 0 }], edited), []);
});

test('dati dell’impianto: la relazione di calcolo confronta solo i campi che le guide e i carichi leggono', () => {
  const inp = newLift(), box = (doc: ReportDoc) => doc.blocks.find((b) => b.t === 'box' && b.text.startsWith('⚠ DATI DELL’IMPIANTO MODIFICATI'));
  // another supply and control: the same forces and limits as the set's sheet 1, nothing said
  const supply = relazione(inp, { voltage: 400, control: 'APM' }, [SET(1, {})]);
  assert.equal(box(supply), undefined);
  assert.ok(all(supply).some((x) => x.includes('Le stesse forze e gli stessi limiti del foglio 1 delle tavole')));
  // the full comparison (the relazione tecnica, the set's page) still sees them
  assert.deepEqual(plantChanged([SET(1, {})], { voltage: 400 }), ['DIS. N° 26-196 R1 (tensione forza motrice)']);
  assert.deepEqual(plantChanged([SET(1, {})], { voltage: 400 }, GUIDE_PLANT_FIELDS), []);
  // the brackets' pitch: the rails' check changes, the box and the sentence say so
  const pitch = relazione(inp, { carBracketPitch: 4500 }, [SET(1, {})]), b = box(pitch);
  assert.ok(b && b.t === 'box' && b.text.includes('DIS. N° 26-196 R1 (passo staffe cabina)'), b && 'text' in b ? b.text : 'nessuna nota');
  assert.ok(!all(pitch).some((x) => x.includes('Le stesse forze e gli stessi limiti del foglio 1')));
});

test('dati dell’impianto: GUIDE_PLANT_FIELDS sono tutti e soli i campi che la relazione di calcolo legge', () => {
  // every other field, given: the relazione is the same as without them (a new field is put in one list or the other)
  const OTHER: Plant = { machine: 'MONTANARI M 73 (Sx)', control: 'APM', shaft: 'MURATURA', carFinish: 'INOX', currentIn: 20, currentStart: 60,
    voltage: 400, lightVoltage: 230, frequency: 50, duty: 40, massShell: 300, massFloor: 50, massDoors: 100, massFrame: 250 };
  assert.deepEqual([...GUIDE_PLANT_FIELDS, ...Object.keys(OTHER)].sort(), Object.keys(plantSchema.shape).sort());
  assert.ok(plantSchema.safeParse(OTHER).success);
  const GUIDE: Plant = { safetyGear: 'instantaneous', carBracketPitch: 4500, cwBracketPitch: 2500, liftUse: 'goodsHeavy', governorLoad: 350, cwSafetyGear: 'roller', cwGearTrip: 'rupture' };
  for (const inp of [newLift(), below('under')]) {
    const base = all(relazione(inp));
    assert.deepEqual(all(relazione(inp, OTHER)), base, String(inp.bottom));
    // and each of the list read: under the pit every one changes it (the counterweight's gear with what trips it)
    if (inp.bottom === 'under') {
      for (const k of GUIDE_PLANT_FIELDS) {
        const one: Plant = k === 'cwGearTrip' ? { cwSafetyGear: 'progressive', cwGearTrip: 'rupture' } : { [k]: GUIDE[k] };
        const ref = k === 'cwGearTrip' ? all(relazione(inp, { cwSafetyGear: 'progressive' })) : base;
        assert.notDeepEqual(all(relazione(inp, one)), ref, k);
      }
    }
  }
});

test('relazione tecnica: le tavole emesse con altri dati dell’impianto nominate negli allegati, con l’impronta dei dati', () => {
  const DIRECT: FormValues = { ...PRESETS.C }, s = startSurvey(600), d = deriveRoom(DIRECT, s);
  const tecnica = (plant: Plant, sets: { number: string; revision: number; plant?: Plant }[]) => buildTecnica({
    room: { id: 'r', label: null, createdAt: DAY, sha256: '0'.repeat(64), engineVersion: 'x', author: null },
    calc: { id: 'c', label: null, createdAt: DAY, sha256: '1'.repeat(64), engineVersion: 'x', profileId: 'it' },
    project, company: 'S', values: DIRECT, survey: s, derived: d, collaudo: { norma: '10411-1', parti: ['machine'] }, plant, sets, plantSha256: 'c'.repeat(64),
  });
  const box = (doc: ReportDoc) => doc.blocks.find((b) => b.t === 'box' && b.text.startsWith('⚠ DATI DELL’IMPIANTO MODIFICATI'));
  assert.equal(box(tecnica({ governorLoad: 300 }, [{ number: '26-195', revision: 0, plant: { governorLoad: 300 } }])), undefined);
  const b = box(tecnica({ governorLoad: 400 }, [{ number: '26-195', revision: 0, plant: {} }]));
  assert.ok(b && b.t === 'box' && b.text.includes('DIS. N° 26-195 (carico del limitatore sulla soletta P4)'), b && 'text' in b ? b.text : 'nessuna nota');
  assert.ok(all(tecnica({}, [])).some((x) => x.includes(`dati dell’impianto ${'c'.repeat(64)}`)));
});
