// «Locale del macchinario» and the slab's loads of the relazione tecnica di modifica on the room path (RT plan §5.1;
// owner's decision 1: the former relazione tecnica of the replacement retires, its room blocks move here). The
// assertions that held for it (report-r37n, r47-d1, room-locale-docs, masse-percorsi, report-r37j) ported to the RT:
// sheet 1's tags and labels as the sheet writes them, one mass of the new machine and one change of P9, the revision in
// force of each drawing set and the sets issued with other plant data, the openings surveyed and the governor's ropes
// assumed apart, the existing support kept and the points of application, the anchors in tension, the hook, P4, the
// slanting falls, D.1 at the brake test, a catalogue machine's estimated mass. Pure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { collaudoOf, type Collaudo } from '../lift/collaudo';
import { valuesAdvice } from '../lift/advice';
import { carichiOf, type Carichi } from '../lift/modifica';
import { d1Di } from '../lift/rapporto';
import type { Plant } from '../plant';
import { analyse } from '../present/analysis';
import { makeFmt } from '../present/tr';
import { elaboratiBlocks, latestRevisions } from '../report/elaborati';
import { labelCase } from '../report/label-case';
import type { PdfBlock, ReportDoc } from '../report/model';
import { buildRelazioneModifica, type RtDocInput } from '../report/rt/build';
import { DOC } from '../report/rt/testi';
import { slabChange } from '../report/tecnica-site';
import { roomCheckKey, deriveRoom } from '../room/derive';
import { startSurvey, type Survey } from '../room/survey';
import { deriveRt } from '../rt/derive';
import { titoloSezione } from '../rt/sezioni';
import type { RtBase } from '../rt/types';
import { surveyLoad, surveySheetData } from '../tavole/survey-data';
import { AZIENDA, PROGETTO, sezione, testi, testiBlocco } from './report-rt-fixtures';
import appIt from '../../../messages/it.json';

const DAY = '2026-10-09T08:00:00.000Z', fmt = makeFmt('it-IT');
const ref = (id: string) => ({ id, sha256: id.padEnd(64, '0').replace(/[^0-9a-f]/g, 'a').slice(0, 64), engineVersion: 'x', createdAt: DAY });
const SOLO: Collaudo = { norma: '10411-1', parti: ['machine'] };

/** The RT of a replacement on the room path: the calculation `V` with its test, the survey `s`, the sets cited. */
function rt(V: FormValues, s: Survey, C: Collaudo = collaudoOf(V, SOLO), extra: { plant?: Plant; sets?: RtDocInput['sets'] } = {}): ReportDoc<PdfBlock> {
  const analysis = analyse(V), derived = deriveRoom(V, s, analysis), plant = extra.plant ?? {};
  if (C.norma === 'en81') throw new Error('a modification');
  const base: RtBase = { path: 'locale', tipo: 'SOLO_ARGANO', norma: C.norma, collaudo: C, values: V, analysis, room: { survey: s, derived, checks: derived.checks },
    records: { calc: ref('calc'), room: ref('room') } };
  const inputs = { doc: { data: '2026-10-09', descrizione: 'Sostituzione dell’argano esistente con un argano a riduttore.' } };
  return buildRelazioneModifica({ number: '26-001', revision: 0, revisions: [], project: PROGETTO, company: AZIENDA, anagrafica: {}, plant, inputs, allegati: [],
    derived: deriveRt(base, inputs, {}, plant, []), sets: extra.sets ?? [] });
}
const locale = (doc: ReportDoc<PdfBlock>): PdfBlock[] => sezione(doc, titoloSezione('locale'));
const strutture = (doc: ReportDoc<PdfBlock>): PdfBlock[] => sezione(doc, DOC.sezioni.strutture);
const kv = (bs: readonly PdfBlock[]): (readonly string[])[] => bs.flatMap((b) => (b.t === 'kv' ? b.rows : []));
/** The survey of the round 37 review: a room 2800 × 3200, the governor with its ropes, two openings, an existing support. */
const reviewed = (V: FormValues, old: Survey['existingSupport'] = { kind: 'beams', keep: false }): Survey => {
  const b = startSurvey(Math.round(deriveRoom(V, startSurvey(600)).calata.calc) + 20);
  return { ...b, room: { ...b.room, W: 2800, D: 3200, H: 2300 }, governor: { x: 2300, y: 900, W: 400, D: 300, ropes: true },
    openings: [{ x: 1300, y: 1250, W: 300, D: 200 }, { x: 2300, y: 600, W: 120, D: 120 }], existingSupport: old };
};
const lettura = (doc: ReportDoc<PdfBlock>): string => strutture(doc).flatMap(testiBlocco).find((t) => t.startsWith('Lettura del software:')) ?? '';

test('locale del macchinario: rilievo, aperture con il centro, gancio e masse, pianta e sezione B-B, verifiche del locale', () => {
  const V = { ...PRESETS.C }, s = startSurvey(600), d = deriveRoom(V, s), doc = rt(V, s), B = locale(doc), all = B.flatMap(testiBlocco);
  for (const k of ['Locale macchina', 'Porta e quadro di manovra', 'Calate esistenti', 'Inclinazione delle funi della nuova puleggia', 'Basamento', 'Antivibranti e fissaggi']) {
    assert.ok(kv(B).some(([l]) => l === k), k);
  }
  assert.ok(all.includes('Centro x') && all.includes('Centro y'), 'aperture con il centro');
  assert.ok(all.some((t) => t.startsWith('Gancio di sollevamento sopra il baricentro')), 'gancio');
  assert.deepEqual(B.filter((b) => b.t === 'plan').length, 2, 'pianta e sezione B-B');
  // the room's checks with sheet 1's labels, the clause in its column
  const grid = B.find((b) => b.t === 'grid' && b.head.join('|') === DOC.verifiche.head.join('|'));
  assert.ok(grid && grid.t === 'grid');
  const labels: Readonly<Record<string, string>> = appIt.shaft;
  for (const c of d.checks.filter((k) => k.id !== 'm_door' && !['m_panel', 'm_quadro', 'm_route'].includes(k.id))) {
    const label = (labels[roomCheckKey(c.id, d)] ?? '').replace(/ \((UNI|DM|EN) .*\)$/, '');
    assert.ok(grid.rows.some((r) => r[0] === label), `${c.id}: ${label}`);
  }
  assert.ok(grid.rows.some((r) => r[1] === `${s.room.doorW} × ${s.room.doorH} mm`), 'la porta del locale nelle sue misure, come il foglio 1');
  assert.ok(B.flatMap(testiBlocco).includes(DOC.locale.rilievi));
});

test('strutture sul percorso del locale: righe del foglio 1 con le sue etichette, P4 da fornitore, R1…Rn, nessun tag in minuscolo', () => {
  const V = { ...PRESETS.C }, s = startSurvey(600), doc = rt(V, s), rows = kv(strutture(doc));
  const sheet = surveySheetData({ values: V, survey: s, collaudo: collaudoOf(V, SOLO), plant: {}, project: PROGETTO, company: { name: 'S', logo: null },
    set: { number: '', issuedAt: new Date(DAY), author: '', revisions: [] } }, deriveRoom(V, s), 3);
  for (const [k, v, u] of sheet.loads) {
    const row = rows.find(([l]) => l === labelCase(k));
    assert.ok(row, k);
    assert.equal(row[1], `${v}${u ? ` ${u}` : ''}`, k);
  }
  assert.ok(rows.some(([l]) => l === 'Reazioni appoggi R1 / R2 / R3 sulla soletta'), 'R1…R3');
  assert.ok(!testi(doc).some((t) => /\br[1-9]\b/.test(t)), 'nessun tag in minuscolo');
  assert.ok(strutture(doc).flatMap(testiBlocco).some((t) => t.startsWith('Carico P4 non indicato')), 'P4');
  assert.ok(!rows.some(([, v]) => v?.endsWith('FORNITORE daN')), 'nessuna unità dopo un testo');
});

test('una massa del nuovo argano sulla soletta e una variazione di P9 nella stessa relazione (W2-L3a2-01)', () => {
  const V0 = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 } as FormValues, c = valuesAdvice(V0).candidates.find((m) => m.brand === 'SICOR');
  assert.ok(c, 'un SICOR dal consiglio');
  const s: Survey = { ...startSurvey(780), existingSupport: { kind: 'frame', keep: true } };
  for (const oMass of [350, 600]) {
    const V = { ...V0, ...c.values, compare: true, o_mass: oMass } as FormValues, d = deriveRoom(V, s), { machine, whole, grow } = slabChange(d, {});
    assert.ok(grow !== null && machine > whole.kg);
    const doc = rt(V, s), all = strutture(doc).flatMap(testiBlocco), line = all.find((t) => t.startsWith('Massa dell’argano con')), end = lettura(doc);
    assert.ok(line && end);
    const change = `${grow > 0.5 ? '+' : '−'}${fmt(Math.round(Math.abs(grow)), 0)}`;
    assert.ok(line.includes(`nuovo ${fmt(machine, 0)} kg`) && line.includes(`P9 ${change} daN`), line);
    assert.ok(end.includes(`(${change} daN)`) && end.includes(grow > 0.5 ? 'aumentati' : 'non aumentati'), end);
    const grid = strutture(doc).find((b) => b.t === 'grid');
    assert.ok(grid && grid.t === 'grid' && grid.rows[0]?.[2] === `${fmt(machine, 0)} kg`, 'la tabella e la riga dicono la stessa massa');
  }
});

test('allegati: la revisione in vigore di ogni tavola; le tavole emesse con altri dati dell’impianto nominate (W2-L3a2-02, W2-G1-01)', () => {
  const sets = [{ number: '26-195', revision: 0, sha256: '2'.repeat(64) }, { number: '26-195', revision: 1, sha256: '4'.repeat(64) }, { number: '27-001', revision: 0, sha256: 'a'.repeat(64) }];
  assert.deepEqual(latestRevisions(sets).map((x) => `${x.number}/${x.revision}`), ['26-195/1', '27-001/0']);
  const line = testi(rt({ ...PRESETS.C }, startSurvey(600), undefined, { sets })).find((t) => t.startsWith('Tavole n.'));
  assert.equal(line, `Tavole n. 26-195 (R1, SHA-256 ${'4'.repeat(16)}…), 27-001 (prima emissione, SHA-256 ${'a'.repeat(16)}…)`);
  // the relazione di calcolo by the same rule
  const grid = elaboratiBlocks(sets.map((x) => ({ ...x, pages: 3, createdAt: new Date(DAY) })), () => '')[0];
  assert.ok(grid?.t === 'grid');
  assert.deepEqual(grid.rows.map((r) => `${r[0]} ${r[1]}`), ['DIS. N° 26-195 R1', 'DIS. N° 27-001 prima emissione']);
  const box = (plant: Plant, setPlant: Plant) => rt({ ...PRESETS.C }, startSurvey(600), undefined, { plant, sets: [{ number: '26-195', revision: 0, plant: setPlant }] })
    .blocks.find((b) => b.t === 'box' && b.text.startsWith('⚠ DATI DELL’IMPIANTO MODIFICATI'));
  assert.equal(box({ governorLoad: 300 }, { governorLoad: 300 }), undefined);
  const b = box({ governorLoad: 400 }, {});
  assert.ok(b && b.t === 'box' && b.text.includes('DIS. N° 26-195 (carico del limitatore sulla soletta P4)'), b && 'text' in b ? b.text : 'nessuna nota');
});

test('aperture esistenti: solo quelle rilevate; il foro delle funi del limitatore è un’ipotesi, a parte (W2-G4-04)', () => {
  const V = { ...PRESETS.C }, s = reviewed(V), note = locale(rt(V, s)).flatMap(testiBlocco).find((t) => t.startsWith('Aperture esistenti'));
  assert.ok(note);
  const [found = '', assumed = ''] = note.split(' Foro delle funi del limitatore');
  assert.equal(found.match(/ mm a x /g)?.length, 2, found);
  assert.ok(assumed.startsWith(' sotto di esso: ipotesi del software (120 × 260 mm a x 2300, y 900 mm') && assumed.includes('resta con il limitatore'), assumed);
  const plain = locale(rt(V, { ...s, governor: { x: 2300, y: 900, W: 400, D: 300, ropes: false } })).flatMap(testiBlocco).find((t) => t.startsWith('Aperture esistenti'));
  assert.ok(plain && !plain.includes('Foro delle funi'), plain);
});

test('basamento esistente che resta: punti di applicazione da verificare, calate, antivibranti (W2-G4-07)', () => {
  const V = { ...PRESETS.C };
  for (const keep of [true, false]) {
    const s = reviewed(V, { kind: 'frame', keep }), d = deriveRoom(V, s), doc = rt(V, s), end = lettura(doc);
    const holes = locale(doc).flatMap((b) => (b.t === 'grid' ? b.rows.map((r) => r[0] ?? '') : [])).filter((x) => x.includes('aperture esistenti della soletta'));
    assert.equal(holes.length, 1, 'm_holes');
    assert.equal(holes[0], (appIt.shaft[keep ? 'c_m_holes_kept' : 'c_m_holes']).replace(/ \((UNI|DM|EN) .*\)$/, ''));
    if (keep) {
      assert.equal(d.checks.find((c) => c.id === 'm_calata')?.status, 'fail');
      assert.ok(end.includes('punti di applicazione da verificare (basamento esistente riusato, posizione non rilevata; calate del calcolo a 20 mm da quelle rilevate)'), end);
      const mounts = kv(locale(doc)).find(([k]) => k === 'Antivibranti e fissaggi')?.[1] ?? '';
      assert.ok(mounts.includes('sul basamento esistente (telaio di profilati) riusato') && !mounts.includes('alla soletta con tasselli'), mounts);
      const row = kv(locale(doc)).find(([k]) => k === 'Basamento')?.[1] ?? '';
      assert.ok(row.startsWith('basamento esistente (telaio di profilati) riusato: posizione, altezza e appoggi da rilevare;'), row);
    } else assert.ok(end.includes('punti di applicazione spostati o non noti'), end);
  }
  const b = startSurvey(Math.round(deriveRoom(V, startSurvey(600)).calata.calc)), on: Survey = { ...b, existingSupport: { kind: 'frame', keep: true } };
  assert.ok(lettura(rt(V, on)).includes('posizione non rilevata; calate invariate)'));
  assert.ok(lettura(rt(V, startSurvey(600))).includes('punti di applicazione non noti (basamento esistente non rilevato)'));
});

test('appoggio in trazione: l’ancoraggio a trazione con il suo valore negli antivibranti (W2-G4-09)', () => {
  const V = { ...PRESETS.C }, s = reviewed(V), d = deriveRoom(V, s), pull = d.site.uplift?.[0]?.pull ?? 0;
  assert.deepEqual(d.site.uplift?.map((u) => u.i), [4]);
  const mounts = kv(locale(rt(V, s))).find(([k]) => k === 'Antivibranti e fissaggi')?.[1] ?? '';
  assert.ok(mounts.includes('fermi contro lo scorrimento') && mounts.includes(`ancoraggi a trazione contro il sollevamento: R4 ≥ ${pull} daN`), mounts);
  const f: Survey = { ...s, room: { ...s.room, support: { kind: 'frame' } } };
  assert.ok(!(kv(locale(rt(V, f))).find(([k]) => k === 'Antivibranti e fissaggi')?.[1] ?? '').includes('trazione'));
});

test('D.1 alla prova del freno: il punto con a_lim tra gli adempimenti della UNI 10411-1', () => {
  const V = { ...PRESETS.C, context: 'repl', compare: false } as FormValues, o = carichiOf(V) as Carichi;
  const C = collaudoOf(V, { norma: '10411-1', parti: ['machine'], documentato: { Q: o.Q, P: o.P - 100, Mcw: o.Mcw } }), d = d1Di(C, V);
  assert.ok(d && d.aLim !== null);
  const doc = rt(V, startSurvey(600), C), it2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(d.aLim);
  const items = sezione(doc, DOC.sezioni.adempimenti).flatMap((b) => (b.t === 'list' ? b.items : []));
  assert.ok(items.some((x) => x.startsWith('UNI 10411-1:2024, 6.1 e D.1: alla prova del freno') && x.includes(it2)));
  assert.ok(testi(doc).some((t) => t.includes('stabilità allo scorrimento')), 'D.1 tra le verifiche delle funi');
});

test('argano di catalogo con la massa stimata: la tabella e la riga della massa dicono la stessa massa intera', () => {
  const V0 = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 };
  const c = valuesAdvice(V0).candidates.find((m) => m.brand === 'Montanari' && m.massEstimated);
  assert.ok(c, 'un Montanari con la massa del solo riduttore');
  const V = { ...V0, ...c.values, compare: true } as FormValues, survey = startSurvey(780), d = deriveRoom(V, survey), { N, O } = d.analysis.ctx;
  const whole = surveyLoad(d, {}).whole, doc = rt(V, survey), B = strutture(doc);
  assert.ok(whole.estimate && whole.kg > N.mass);
  assert.deepEqual(kv(B).find(([k]) => k?.startsWith('Argano (stima)')), ['Argano (stima)', `${fmt(whole.kg, 0)} kg`]);
  const { machine, grow } = slabChange(d, {}), line = B.flatMap(testiBlocco).find((t) => t.startsWith('Massa dell’argano con'));
  assert.ok(grow !== null && line);
  assert.ok(line.includes(`esistente ${fmt(O.mass, 0)} kg, nuovo ${fmt(machine, 0)} kg (argano completo ${fmt(whole.kg, 0)} kg`), line);
  assert.ok(line.includes(`stima ⚠: ${fmt(N.mass, 0)} kg dal catalogo`), line);
});
