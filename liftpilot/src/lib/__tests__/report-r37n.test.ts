// Round 37, package N: the relazione tecnica of a replacement against its sheets — sheet 1's tags as the sheet writes
// them (R1…Rn, profiles, makers' codes), one mass of the new machine on the slab and one change of P9, the revision in
// force of each drawing set attached, only the openings surveyed listed as such, the label of the drops' check by what
// the calculation's drops are, the existing support kept named as it (point 5 applicable while its position is not
// surveyed), and the anchors in tension of the bearings pulled up on sheet 1, in section B-B and in the relazioni.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import appBg from '../../../messages/bg.json';
import appEn from '../../../messages/en.json';
import appIt from '../../../messages/it.json';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valuesAdvice } from '@/lib/lift/advice';
import { collaudoOf } from '@/lib/lift/collaudo';
import { valueMarks } from '@/lib/lift/marks';
import { supportLoad } from '@/lib/lift/support';
import { roomGeo } from '@/shaft/machine-room';
import { supportReactions, upliftOf, upliftText } from '@/shaft/room-reactions';
import { elaboratiBlocks, latestRevisions } from '../report/elaborati';
import { labelCase, lowerKeeping } from '../report/label-case';
import type { ReportDoc } from '../report/model';
import { buildTecnica } from '../report/tecnica';
import { roomRows } from '../report/tecnica-room';
import { designRoomBlocks, slabChange } from '../report/tecnica-site';
import { calataBasis, deriveRoom, roomCheckKey } from '../room/derive';
import { startSurvey, type Survey } from '../room/survey';
import { surveyOpenings } from '../room/survey-site';
import { buildTavole } from '../tavole/build';
import { storedInput } from '../tavole/compose';
import { buildSurveyTavole } from '../tavole/survey-build';
import { surveySheetData } from '../tavole/survey-data';
import type { SurveyTavoleInput } from '../tavole/survey-input';

const DAY = new Date('2026-10-09T08:00:00Z'), fmt = (x: number, dp = 0): string => x.toFixed(dp);
const project = { name: 'R', address: null, city: null, province: null, plantNumber: null, client: null };
const input = (V: FormValues, s: Survey): SurveyTavoleInput => ({
  values: V, survey: s, collaudo: { norma: '10411-1', parti: ['machine'] }, plant: {}, project, company: { name: 'S', logo: null },
  set: { number: '26-001', issuedAt: DAY, author: 'M.R.', revisions: [] },
});
const tecnica = (V: FormValues, s: Survey, sets: { number: string; revision: number; sha256?: string }[] = []): ReportDoc => buildTecnica({
  room: { id: 'r', label: null, createdAt: DAY, sha256: 'd'.repeat(64), engineVersion: 'x', author: null },
  calc: { id: 'c', label: null, createdAt: DAY, sha256: 'c'.repeat(64), engineVersion: 'x', profileId: 'it' },
  project, company: 'S', values: V, survey: s, derived: deriveRoom(V, s), collaudo: collaudoOf(V), plant: {}, sets, generatedAt: DAY,
});
const texts = (doc: ReportDoc): string[] => doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows.flat() : b.t === 'grid' ? [...b.head, ...b.rows.flat()] : b.t === 'list' ? b.items : 'text' in b ? [b.text] : []));
const kv = (doc: ReportDoc): (readonly string[])[] => doc.blocks.flatMap((b) => (b.t === 'kv' ? b.rows : []));
const pageTexts = (pages: { shapes: readonly { t: string; text?: string }[] }[], i: number): string[] => pages[i]?.shapes.flatMap((s) => (s.t === 'text' && s.text ? [s.text] : [])) ?? [];
/** The survey of the round 37 review: a room 2800 × 3200, the governor with its ropes, two openings, an existing support. */
const reviewed = (V: FormValues, old: Survey['existingSupport'] = { kind: 'beams', keep: false }): Survey => {
  const b = startSurvey(Math.round(deriveRoom(V, startSurvey(600)).calata.calc) + 20);
  return { ...b, room: { ...b.room, W: 2800, D: 3200, H: 2300 }, governor: { x: 2300, y: 900, W: 400, D: 300, ropes: true },
    openings: [{ x: 1300, y: 1250, W: 300, D: 200 }, { x: 2300, y: 600, W: 120, D: 120 }], existingSupport: old };
};

test('etichette del foglio 1 nella relazione tecnica: R1…Rn, profili e codici come sul foglio (W2-L1b-04)', () => {
  const V = { ...PRESETS.C }, s = startSurvey(600), doc = tecnica(V, s), sheet = surveySheetData(input(V, s), deriveRoom(V, s), 3), rows = kv(doc);
  for (const [k, v, u] of sheet.loads) {
    const row = rows.find(([l]) => l === labelCase(k));
    assert.ok(row, k);
    assert.equal(row[1], `${v}${u ? ` ${u}` : ''}`, k);
    // the same label, only its case
    assert.equal(row[0]?.toUpperCase(), k.toUpperCase(), k);
  }
  assert.ok(rows.some(([l]) => l === 'Reazioni appoggi R1 / R2 / R3 sulla soletta'), 'R1…R3');
  assert.ok(rows.some(([l]) => l?.startsWith('Reazioni appoggi R4 / R5 / R6 sulla soletta')), 'R4…R6');
  assert.ok(!texts(doc).some((t) => /\br[1-9]\b/.test(t)), 'nessun tag in minuscolo');
  // the support's row: the profile as the sheet writes it
  for (const [sup, name] of [[{ kind: 'frame' }, 'telaio UPN 200'], [{ kind: 'beams', profile: 'IPE 200' }, 'putrelle IPE 200']] as const) {
    const s2: Survey = { ...s, room: { ...s.room, support: sup } }, row = roomRows(s2, deriveRoom(V, s2), fmt).find(([k]) => k === 'Basamento');
    assert.ok(row?.[1].startsWith(`${name};`), row?.[1]);
  }
  // the rule: designations kept, the makers' names as their catalogue writes them, a dimension's symbol before its value
  assert.equal(labelCase('PUTRELLE HEB 160 SUI MURI DEL VANO (DUE), L 2400 mm'), 'Putrelle HEB 160 sui muri del vano (due), L 2400 mm');
  assert.equal(lowerKeeping('TELAIO CON RINVIO SICOR XTE3022 SUL BASAMENTO ESISTENTE'), 'telaio con rinvio SICOR XTE3022 sul basamento esistente');
  assert.equal(labelCase('ARGANO MONTANARI M93 (STIMA)'), 'Argano Montanari M93 (stima)');
  assert.equal(labelCase('CARICO STATICO SUL BASAMENTO DELL’ARGANO'), 'Carico statico sul basamento dell’argano');
});

test('una massa del nuovo argano sulla soletta e una variazione di P9 nella stessa relazione (W2-L3a2-01)', () => {
  const V0 = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 } as FormValues, c = valuesAdvice(V0).candidates.find((m) => m.brand === 'SICOR');
  assert.ok(c, 'un SICOR dal consiglio');
  const s: Survey = { ...startSurvey(780), existingSupport: { kind: 'frame', keep: true } };
  for (const oMass of [350, 600]) {
    const V = { ...V0, ...c.values, compare: true, o_mass: oMass } as FormValues, d = deriveRoom(V, s), { machine, whole, grow } = slabChange(d, {});
    assert.ok(grow !== null && machine > whole.kg);
    const all = texts(tecnica(V, s)), line = all.find((t) => t.startsWith('Massa dell’argano con')), end = all.find((t) => t.includes('punto 5 —'));
    assert.ok(line && end);
    // the table's mass, never the catalogue's machine alone; the change of P9 with one sign in both
    assert.ok(line.includes(`nuovo ${fmt(machine)} kg`), line);
    const change = `${grow > 0.5 ? '+' : '−'}${Math.round(Math.abs(grow))} daN`;
    assert.ok(line.includes(`P9 ${change}`) && end.includes(`(${change} sulla soletta)`), `${line} | ${end}`);
    assert.ok(end.startsWith(grow > 0.5 ? 'Carichi aumentati' : 'Carichi non aumentati'), end);
  }
});

test('allegati: la revisione in vigore di ogni tavola, per anno e numero, come negli elaborati grafici (W2-L3a2-02)', () => {
  const sets = [{ number: '26-195', revision: 0, sha256: '2'.repeat(64) }, { number: '26-195', revision: 1, sha256: '4'.repeat(64) }, { number: '27-001', revision: 0, sha256: 'a'.repeat(64) }];
  assert.deepEqual(latestRevisions(sets).map((x) => `${x.number}/${x.revision}`), ['26-195/1', '27-001/0']);
  const line = texts(tecnica({ ...PRESETS.C }, startSurvey(600), sets)).find((t) => t.startsWith('Tavole di progetto'));
  assert.equal(line, `Tavole di progetto n. 26-195 (R1, SHA-256 ${'4'.repeat(16)}…), 27-001 (prima emissione, SHA-256 ${'a'.repeat(16)}…)`);
  // the relazione di calcolo by the same rule
  const grid = elaboratiBlocks(sets.map((x) => ({ ...x, pages: 3, createdAt: DAY })), () => '')[0];
  assert.ok(grid?.t === 'grid');
  assert.deepEqual(grid.rows.map((r) => `${r[0]} ${r[1]}`), ['DIS. N° 26-195 R1', 'DIS. N° 27-001 prima emissione']);
});

test('aperture esistenti: solo quelle rilevate; il foro delle funi del limitatore è un’ipotesi, a parte (W2-G4-04)', () => {
  const V = { ...PRESETS.C }, s = reviewed(V), note = texts(tecnica(V, s)).find((t) => t.startsWith('Aperture esistenti'));
  assert.ok(note);
  const [found = '', assumed = ''] = note.split(' Foro delle funi del limitatore');
  assert.equal(found.match(/ mm a x /g)?.length, 2, found);
  assert.ok(assumed.startsWith(' sotto di esso: ipotesi del software (120 × 260 mm a x 2300, y 900 mm') && assumed.includes('resta con il limitatore'), assumed);
  // the new support still keeps off it (m_holes)
  assert.equal(surveyOpenings(s).length, 3);
  // no governor's ropes through the slab: nothing assumed
  const plain = texts(tecnica(V, { ...s, governor: { x: 2300, y: 900, W: 400, D: 300, ropes: false } })).find((t) => t.startsWith('Aperture esistenti'));
  assert.ok(plain && !plain.includes('Foro delle funi'), plain);
});

test('verifica delle calate: l’etichetta dice da che cosa vengono le calate del calcolo (W2-G4-08)', () => {
  const cases: [string, FormValues, string][] = [['A', { ...PRESETS.A }, 'c_m_calata_defl'], ['C', { ...PRESETS.C }, 'c_m_calata'], ['C nuova', { ...PRESETS.C, compare: false }, 'c_m_calata_new']];
  for (const [name, V, key] of cases) {
    const s = reviewed(V), d = deriveRoom(V, s), label = appIt.shaft[key as keyof typeof appIt.shaft];
    assert.equal(roomCheckKey('m_calata', d), key, name);
    assert.equal(roomCheckKey('m_door', d), 'c_m_door');
    for (const M of [appIt.shaft, appEn.shaft, appBg.shaft]) assert.ok(typeof M[key as keyof typeof M] === 'string', `${name}: ${key}`);
    const t = pageTexts(buildSurveyTavole(input(V, s)).doc.pages, 0);
    assert.ok(t.includes(label), `${name}: ${label}`);
    if (key !== 'c_m_calata') assert.ok(!t.some((x) => x.includes('puleggia esistente col tiro diretto')), name);
  }
  assert.equal(calataBasis({ layout: 'topDefl', drops: 0 }), 'defl');
  assert.equal(calataBasis({ layout: 'top', drops: 560 }), 'old');
  assert.equal(calataBasis({ layout: 'top', drops: 0 }), 'new');
});

test('basamento esistente che resta: punto 5 applicabile, nessun basamento nuovo su spessori nei fogli (W2-G4-07)', () => {
  const V = { ...PRESETS.C };
  for (const keep of [true, false]) {
    const s = reviewed(V, { kind: 'frame', keep }), d = deriveRoom(V, s), all = texts(tecnica(V, s)), end = all.find((t) => t.includes('punto 5 —')) ?? '';
    const tav = buildSurveyTavole(input(V, s)), sheet = surveySheetData(input(V, s), d, 3), base = sheet.room.find(([l]) => l === 'BASAMENTO')?.[2] ?? '';
    const bb = tav.doc.pages.flatMap((_, i) => pageTexts(tav.doc.pages, i)).join(' ');
    assert.ok(end.includes('punto 5 — applicabile') && !end.includes('non applicabile'), end);
    // NOTA 2 and the label of m_holes on sheet 1 and in the relazione: the support kept, never a new one
    const nota2 = sheet.notes.find((n) => n.tag === 'NOTA 2')?.text ?? '', holes = sheet.checks.find(([l]) => l.includes('aperture esistenti della soletta'))?.[0] ?? '';
    const relHoles = texts(tecnica(V, s)).filter((x) => x.includes('dal bordo delle aperture esistenti della soletta'));
    assert.ok(holes && relHoles.length === 1, 'm_holes');
    assert.equal(roomCheckKey('m_holes', d), keep ? 'c_m_holes_kept' : 'c_m_holes');
    assert.equal(holes, appIt.shaft[keep ? 'c_m_holes_kept' : 'c_m_holes']);
    assert.equal(relHoles[0], holes);
    assert.equal([holes, ...relHoles].some((x) => x.includes('Appoggi del nuovo basamento')), !keep);
    assert.equal(nota2.includes('Il basamento disegnato è la proposta del software, da adattare a quello fornito dal costruttore.'), !keep, nota2);
    if (keep) {
      assert.ok(nota2.endsWith('Il basamento disegnato è quello esistente riusato (telaio di profilati): posizione, altezza e appoggi da rilevare in sito; '
        + 'il disegno ne usa la geometria proposta dal software.'), nota2);
      assert.equal(d.site.kept, 'telaio di profilati');
      assert.ok(end.includes('da verificare (basamento esistente riusato, posizione non rilevata'), end);
      // the drops unchanged only when m_calata passes (here 20 mm off)
      assert.equal(d.checks.find((c) => c.id === 'm_calata')?.status, 'fail');
      assert.ok(!end.includes('calate invariate') && end.includes('calate del calcolo a 20 mm da quelle rilevate'), end);
      // (its kind in the survey's row above it, «TELAIO (RESTA)»)
      assert.equal(base, 'ESISTENTE, DA RILEVARE');
      assert.ok(sheet.room.some(([l, , v]) => l.startsWith('RILIEVO') && v.endsWith('TELAIO (RESTA)')));
      const row = roomRows(s, d, fmt).find(([k]) => k === 'Basamento')?.[1] ?? '';
      assert.ok(row.startsWith('basamento esistente (telaio di profilati) riusato: posizione, altezza e appoggi da rilevare;'), row);
      assert.ok(bb.includes('Basamento esistente') && !bb.includes('Spessori') && !bb.includes('tasselli'), 'B-B');
      const mounts = kv(tecnica(V, s)).find(([k]) => k === 'Antivibranti e fissaggi')?.[1] ?? '';
      assert.ok(mounts.includes('sul basamento esistente (telaio di profilati) riusato') && !mounts.includes('alla soletta con tasselli'), mounts);
    } else {
      assert.equal(d.site.kept, null);
      assert.ok(end.includes('punti di applicazione spostati o non noti'), end);
      assert.equal(base, 'SPESSORI DI LIVELLAMENTO');
      assert.ok(bb.includes('spessori fissati alla soletta con tasselli'), 'B-B');
    }
  }
  // the drops on those surveyed: unchanged
  const b = startSurvey(Math.round(deriveRoom(V, startSurvey(600)).calata.calc)), on: Survey = { ...b, existingSupport: { kind: 'frame', keep: true } };
  assert.equal(deriveRoom(V, on).checks.find((c) => c.id === 'm_calata')?.status, 'ok');
  assert.ok(texts(tecnica(V, on)).some((t) => t.includes('posizione non rilevata; calate invariate)')));
  // no existing support surveyed: its points not known
  assert.ok(texts(tecnica(V, startSurvey(600))).some((t) => t.includes('punti di applicazione non noti (basamento esistente non rilevato): UNI 10411-1:2024, punto 5 — applicabile')));
  // our bedplate with the pulley on the support kept: the software's proposal, standing on the existing support to survey
  const A = { ...PRESETS.A, context: 'repl', alphaMode: 'geo', h: 0.95 } as FormValues, sA: Survey = { ...startSurvey(780), existingSupport: { kind: 'plinth', keep: true } };
  const dA = deriveRoom(A, sA), nA = surveySheetData(input(A, sA), dA, 3).notes.find((n) => n.tag === 'NOTA 2')?.text ?? '';
  assert.ok(dA.site.kept && dA.M.rinvio?.on === 'frame', 'telaio con rinvio');
  assert.ok(nA.endsWith('Il telaio con rinvio disegnato è la proposta del software, da adattare a quello fornito dal costruttore; poggia sul basamento esistente riusato, da rilevare.'), nA);
  for (const M of [appIt.shaft, appEn.shaft, appBg.shaft]) assert.equal(typeof M.c_m_holes_kept, 'string');
});

test('appoggio in trazione: ancoraggio a trazione con il suo valore sul foglio 1, nella sezione B-B e nella relazione (W2-G4-09)', () => {
  const V = { ...PRESETS.C }, s = reviewed(V), d = deriveRoom(V, s), sheet = surveySheetData(input(V, s), d, 3);
  // the reactions as sheet 1 writes them: R4 pulled up
  assert.deepEqual(d.site.uplift?.map((u) => u.i), [4]);
  const pull = d.site.uplift?.[0]?.pull ?? 0, r4 = sheet.loads.find(([l]) => l.startsWith('REAZIONI APPOGGI R4'))?.[1].split(' / ')[0];
  assert.equal(r4, `-${pull}`);
  assert.deepEqual(sheet.loads.find(([l]) => l.startsWith('ANCORAGGIO')), ['ANCORAGGIO A TRAZIONE (SOLLEVAMENTO) R4 ≥', String(pull), 'daN']);
  const tav = buildSurveyTavole(input(V, s)), bb = tav.doc.pages.flatMap((_, i) => pageTexts(tav.doc.pages, i)).join(' ');
  assert.ok(bb.replace(/\s+/g, ' ').includes(`a trazione R4 ≥ ${pull} daN`), 'B-B');
  const mounts = kv(tecnica(V, s)).find(([k]) => k === 'Antivibranti e fissaggi')?.[1] ?? '';
  assert.ok(mounts.includes('fermi contro lo scorrimento') && mounts.includes(`ancoraggi a trazione contro il sollevamento: R4 ≥ ${pull} daN`), mounts);
  // none pulled up: no anchor in tension anywhere
  const f: Survey = { ...s, room: { ...s.room, support: { kind: 'frame' } } }, df = deriveRoom(V, f);
  assert.deepEqual(df.site.uplift, []);
  assert.ok(!surveySheetData(input(V, f), df, 3).loads.some(([l]) => l.startsWith('ANCORAGGIO')));
  assert.ok(!(kv(tecnica(V, f)).find(([k]) => k === 'Antivibranti e fissaggi')?.[1] ?? '').includes('trazione'));
  assert.equal(upliftText([{ i: 4, pull: 109 }, { i: 6, pull: 12345 }]), 'R4 ≥ 109 daN, R6 ≥ 12.345 daN');
});

test('progetto intero con un appoggio in trazione: foglio 1, sezione B-B e relazione di calcolo (W2-G4-09)', () => {
  // the example on shims with a direct drive: the load's centre off the mounts' (round 37 review: 6 designs of 59)
  const base = newLift(), room = base.shaft.room as NonNullable<LiftInputs['shaft']['room']>;
  const inp: LiftInputs = { ...base, calc: { ...base.calc, layout: 'top' }, shaft: { ...base.shaft, room: { ...room, support: { kind: 'shims' } } } };
  const d = deriveLift(inp), G = roomGeo(d.layout, d.machine);
  assert.ok(G);
  const marks = valueMarks(inp.auto, d, d.bottom, d.collaudo);
  const x = storedInput(d.values, d.layout, { number: '26-001', createdAt: DAY, authorInitials: 'M.R.', companyName: 'S', projectData: { ...project, address: 'Via Roma 1' }, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  const r = buildTavole(x), loads = r.doc.pages[0] ? pageTexts(r.doc.pages, 0) : [];
  const row = loads.findIndex((t) => t.startsWith('ANCORAGGIO'));
  assert.ok(row >= 0, 'foglio 1');
  const pull = Number(loads[row + 1]);
  assert.ok(pull > 0);
  const all = r.doc.pages.flatMap((_, i) => pageTexts(r.doc.pages, i)).join(' ').replace(/\s+/g, ' ');
  assert.ok(all.includes(`a trazione ${loads[row]?.split(') ')[1]?.replace(' ≥', '')} ≥ ${pull} daN`), 'B-B');
  const { ctx, res } = d.analysis, rx = supportReactions(G, d.machine, supportLoad(ctx, res.Mcw));
  assert.ok(upliftOf(rx).length > 0);
  assert.ok(JSON.stringify(designRoomBlocks(d.layout, d.machine, supportLoad(ctx, res.Mcw), fmt)).includes('ancoraggi a trazione contro il sollevamento: R'), 'relazione di calcolo');
});
