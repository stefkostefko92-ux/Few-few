// Sheet 1 of a machine replacement legible on A4 (round 37, W2-G4-01: the checks' labels shrank to 0,95–1,48 mm to
// fit their column): every lettering at least 1,8 mm, the checks at least 2 mm — a label too long for its column wrapped
// at that size, never shrunk — on rows at least 2,6 mm high, the notes over them giving up the room, the table over the
// electrical supply, no lettering over another; with a governor and openings surveyed, on HEB beams too (the most
// checks); the checks that do not fit so on their own sheet at the end of the set (round 37 review).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { textBox, type Shape, type TextShape } from '@/drawing';
import appIt from '../../../messages/it.json';
import { PARTI } from '../lift/collaudo';
import { deriveRoom } from '../room/derive';
import { startSurvey, type Survey } from '../room/survey';
import { buildSurveyTavole } from '../tavole/survey-build';
import { overlaps } from './room-lettering-helpers';

type Change = (s: Survey) => Survey;
type Parti = readonly (typeof PARTI)[number][];
const audit: Change = (s) => ({ ...s, room: { ...s.room, W: 2800, D: 3200, H: 2300 }, governor: { x: 1900, y: 900, W: 400, D: 300, ropes: true },
  openings: [{ x: 1300, y: 1250, W: 300, D: 200 }, { x: 2300, y: 600, W: 120, D: 120 }], existingSupport: { kind: 'beams', keep: false } });
const heb: Change = (s) => ({ ...audit(s), room: { ...audit(s).room, heb: {} } });
/** The round 37 review's: on HEB beams in a room 1850 high (m_hexist's longer note), every part replaced — its checks do
 *  not fit sheet 1 legibly. */
const low: Change = (s) => ({ ...heb(s), room: { ...heb(s).room, H: 1850 } });
const CASES: [string, FormValues, Change, '10411-1' | '10411-11', Parti?][] = [
  ['A', { ...PRESETS.A }, audit, '10411-1'], ['C', { ...PRESETS.C }, audit, '10411-1'], ['B in alto', { ...PRESETS.B, layout: 'top' }, audit, '10411-11'],
  ['A su HEB', { ...PRESETS.A }, heb, '10411-1'], ['C su HEB', { ...PRESETS.C }, heb, '10411-1'], ['C senza rilievo', { ...PRESETS.C }, (s) => s, '10411-1'],
  ['A su HEB, tutte le parti', { ...PRESETS.A }, heb, '10411-1', PARTI], ['C su HEB, H 1850, tutte le parti', { ...PRESETS.C }, low, '10411-1', PARTI],
];

function set(V: FormValues, f: Change, norma: '10411-1' | '10411-11', parti: Parti = ['machine']) {
  const s = f(startSurvey(Math.round(deriveRoom(V, startSurvey(600)).calata.calc) + 20));
  return buildSurveyTavole({
    values: V, survey: s, collaudo: { norma, parti: [...parti] }, plant: {},
    project: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB-0001', client: 'Condominio' },
    company: { name: 'S', logo: null }, set: { number: '26-037', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
  });
}
const textsOf = (shapes: readonly Shape[]): TextShape[] => shapes.filter((x): x is TextShape => x.t === 'text');

function sheet1(V: FormValues, f: Change, norma: '10411-1' | '10411-11', parti?: Parti) {
  const r = set(V, f, norma, parti), page = r.doc.pages[0];
  assert.ok(page);
  return { page, texts: textsOf(page.shapes), checks: r.derived.checks, r };
}

test('foglio 1 della sostituzione: ogni scritta almeno 1,8 mm, nessuna sopra un’altra', () => {
  for (const [name, V, f, norma, parti] of CASES) {
    const { page, texts } = sheet1(V, f, norma, parti);
    const small = texts.filter((t) => t.size < 1.8 - 1e-9).map((t) => `${t.size.toFixed(2)} «${t.text}»`);
    assert.deepEqual(small, [], name);
    assert.deepEqual(overlaps(page.shapes), [], name);
  }
});

test('foglio 1: le verifiche almeno 2 mm su righe di almeno 2,6 mm, le etichette lunghe a capo e intere, la tabella sopra le caratteristiche elettriche', () => {
  const labels: Readonly<Record<string, string>> = appIt.shaft;
  for (const [name, V, f, norma, parti] of CASES) {
    const { page, texts, checks, r } = sheet1(V, f, norma, parti);
    if (r.doc.pages.length > 3) continue;
    const head = texts.find((t) => t.text.startsWith('VERIFICHE DEL LOCALE')), elec = texts.find((t) => t.text === 'CARATTERISTICHE ELETTRICHE');
    assert.ok(head && elec, name);
    const table = texts.filter((t) => t.at[0] >= 98 && t.at[1] < head.at[1] && t.at[1] > elec.at[1]);
    assert.ok(table.length >= checks.length * 4, `${name}: ${table.length} scritte per ${checks.length} verifiche`);
    for (const t of table) assert.ok(t.size >= 2 - 1e-9, `${name}: ${t.size.toFixed(2)} «${t.text}»`);
    // every label whole, its lines read in order (the longest of the survey's, the governor's)
    const read = table.map((t) => t.text).join(' ');
    for (const id of ['m_gov', 'm_govfree', 'm_holes'] as const) {
      if (!checks.some((c) => c.id === id)) continue;
      const label = (labels[`c_${id}`] ?? id).replace(' (UNI EN 81-20, ', ' (');
      assert.ok(read.includes(label), `${name}: «${label}»`);
    }
    // the table's lettering over the electrical supply's heading box
    const top = textBox(elec).y1;
    for (const t of table) assert.ok(textBox(t).y0 > top, `${name}: «${t.text}» sotto la tabella`);
    // its rows (the rules across the column between its heading and the supply's) never under 2,6 mm (round 37 review:
    // 2,3 mm under 2 mm lettering)
    const rules = [...new Set(page.shapes.flatMap((l) => (l.t === 'line' && Math.abs(l.a[1] - l.b[1]) < 1e-6 && Math.min(l.a[0], l.b[0]) <= 98.5 && Math.max(l.a[0], l.b[0]) >= 201
      && l.a[1] < head.at[1] + 3 && l.a[1] > top ? [Math.round(l.a[1] * 1000) / 1000] : [])))].sort((a, b) => b - a);
    assert.ok(rules.length >= checks.length, `${name}: ${rules.length} righe`);
    const least = Math.min(...rules.slice(1).map((y, i) => rules[i] - y));
    assert.ok(least >= 2.6 - 1e-6, `${name}: riga di ${least.toFixed(2)} mm`);
  }
});

test('le verifiche che non stanno leggibili sul foglio 1 vanno su un foglio loro alla fine, come nel progetto intero', () => {
  const name = 'C su HEB, H 1850, tutte le parti', { texts, checks, r } = sheet1({ ...PRESETS.C }, low, '10411-1', PARTI);
  assert.equal(r.doc.pages.length, 4, name);
  assert.deepEqual(r.sheets.map((x) => x.scale === null), [true, false, false, true]);
  assert.equal(r.sheets[3]?.title, 'VERIFICHE DEL LOCALE, DEL BASAMENTO E DELLE CALATE');
  // sheet 1 sends to it; no table of them there
  assert.ok(!texts.some((t) => t.text.startsWith('VERIFICHE DEL LOCALE')), name);
  assert.ok(texts.some((t) => /FOGLIO 4$/.test(t.text)), 'il rimando al foglio 4');
  // the sheet of the checks: every check's label, lettering at least 2 mm, none over another, its strip «4/4»
  const page = r.doc.pages[3];
  assert.ok(page);
  const own = textsOf(page.shapes), read = own.map((t) => t.text).join(' ');
  assert.ok(own.filter((t) => t.text === 'OK' || t.text === 'NON PASSA' || t.text === 'ATTENZIONE' || t.text === 'ESISTENTE').length >= checks.length, name);
  for (const t of own) assert.ok(t.size >= 1.8 - 1e-9, `«${t.text}» ${t.size.toFixed(2)}`);
  assert.ok(read.includes('VALORE') && read.includes('LIMITE') && read.includes('ESITO'));
  assert.deepEqual(overlaps(page.shapes), []);
  assert.ok(own.some((t) => t.text.includes('4/4')), 'pagina 4/4');
});
