// Sheet 1 of a machine replacement legible on A4 (round 37, W2-G4-01: the checks' labels shrank to 0,95–1,48 mm to
// fit their column): every lettering at least 1,8 mm, the checks at least 2 mm — a label too long for its column wrapped
// at that size, never shrunk —, the notes over them giving up the room, the table over the electrical supply, no
// lettering over another; with a governor and openings surveyed, on HEB beams too (the most checks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { textBox, type TextShape } from '@/drawing';
import appIt from '../../../messages/it.json';
import { deriveRoom } from '../room/derive';
import { startSurvey, type Survey } from '../room/survey';
import { buildSurveyTavole } from '../tavole/survey-build';
import { overlaps } from './room-lettering-helpers';

type Change = (s: Survey) => Survey;
const audit: Change = (s) => ({ ...s, room: { ...s.room, W: 2800, D: 3200, H: 2300 }, governor: { x: 1900, y: 900, W: 400, D: 300, ropes: true },
  openings: [{ x: 1300, y: 1250, W: 300, D: 200 }, { x: 2300, y: 600, W: 120, D: 120 }], existingSupport: { kind: 'beams', keep: false } });
const heb: Change = (s) => ({ ...audit(s), room: { ...audit(s).room, heb: {} } });
const CASES: [string, FormValues, Change, '10411-1' | '10411-11'][] = [
  ['A', { ...PRESETS.A }, audit, '10411-1'], ['C', { ...PRESETS.C }, audit, '10411-1'], ['B in alto', { ...PRESETS.B, layout: 'top' }, audit, '10411-11'],
  ['A su HEB', { ...PRESETS.A }, heb, '10411-1'], ['C su HEB', { ...PRESETS.C }, heb, '10411-1'], ['C senza rilievo', { ...PRESETS.C }, (s) => s, '10411-1'],
];

function sheet1(V: FormValues, f: Change, norma: '10411-1' | '10411-11') {
  const s = f(startSurvey(Math.round(deriveRoom(V, startSurvey(600)).calata.calc) + 20));
  const r = buildSurveyTavole({
    values: V, survey: s, collaudo: { norma, parti: ['machine'] }, plant: {},
    project: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: 'MB-0001', client: 'Condominio' },
    company: { name: 'S', logo: null }, set: { number: '26-037', issuedAt: new Date('2026-10-08T10:00:00Z'), author: 'M.R.', revisions: [] },
  });
  const page = r.doc.pages[0];
  assert.ok(page);
  return { page, texts: page.shapes.filter((x): x is TextShape => x.t === 'text'), checks: r.derived.checks };
}

test('foglio 1 della sostituzione: ogni scritta almeno 1,8 mm, nessuna sopra un’altra', () => {
  for (const [name, V, f, norma] of CASES) {
    const { page, texts } = sheet1(V, f, norma);
    const small = texts.filter((t) => t.size < 1.8 - 1e-9).map((t) => `${t.size.toFixed(2)} «${t.text}»`);
    assert.deepEqual(small, [], name);
    assert.deepEqual(overlaps(page.shapes), [], name);
  }
});

test('foglio 1: le verifiche almeno 2 mm, le etichette lunghe a capo e intere, la tabella sopra le caratteristiche elettriche', () => {
  const labels: Readonly<Record<string, string>> = appIt.shaft;
  for (const [name, V, f, norma] of CASES) {
    const { texts, checks } = sheet1(V, f, norma);
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
  }
});
