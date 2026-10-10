// The checks of the design on the last sheet (round 37): never lettered under 2 mm — a label too long for its column at
// that size wraps at the row's size, its row as much taller, and the table still fits its area; the ruled table of the
// kernel shrinks a text to fit as before when no minimum is asked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawingArea, table, textBox, type Shape, type TextShape } from '@/drawing';
import { deriveLift, newLift, type LiftInputs } from '@/lib/lift';
import { valueMarks } from '@/lib/lift/marks';
import { buildTavole } from '@/lib/tavole/build';
import { checksSheet } from '@/lib/tavole/checks-sheet';
import { storedInput } from '@/lib/tavole/compose';
import type { DataSheet } from '@/lib/tavole/datasheet';

const texts = (shapes: readonly Shape[]): TextShape[] => shapes.flatMap((s) => (s.t === 'text' ? [s] : []));
const LONG = 'Spazio di rifugio sul tetto di cabina: la pianta sta fuori dalla traversa, dagli operatori e da ciò che pende sotto la soletta (margine) (5.2.5.7.1)';

test('foglio delle verifiche: un’etichetta troppo lunga va a capo, mai sotto 2 mm, la tabella resta nella sua area', () => {
  const area = drawingArea(true);
  for (const n of [20, 55, 63]) {
    const checks: DataSheet['checks'] = Array.from({ length: n }, (_, i) => (i === 7 ? [LONG, '35 mm', '≥ 0 mm', 'OK'] : [`Verifica ${i + 1} (5.2.5.${i})`, `${100 + i} mm`, '≥ 50 mm', i === 3 ? 'NON OK' : 'OK']));
    const shapes = checksSheet(checks, area), ts = texts(shapes);
    for (const t of ts) assert.ok(t.size >= 2 - 1e-9, `${n}: «${t.text}» a ${t.size.toFixed(2)}`);
    // the label whole, in its lines one under another
    const first = ts.findIndex((t) => LONG.startsWith(t.text) && t.text.length > 10), lines: string[] = [];
    assert.ok(first >= 0, `${n}: etichetta`);
    for (const t of ts.slice(first)) if (lines.join(' ').length < LONG.length && LONG.includes(t.text)) lines.push(t.text);
    assert.equal(lines.join(' '), LONG, `${n}`);
    // in the area: every line and every text
    for (const s of shapes) {
      const ys = s.t === 'line' ? [s.a[1], s.b[1]] : s.t === 'text' ? [textBox(s).y0, textBox(s).y1] : [];
      for (const y of ys) assert.ok(y >= area.y0 - 1e-6 && y <= area.y1 + 1e-6, `${n}: ${s.t} a y ${y.toFixed(2)}`);
    }
  }
});

test('tabella del nucleo: senza minimo il testo si riduce come prima, con il minimo va a capo e la riga cresce', () => {
  const rows = [[{ text: 'VERIFICA' }, { text: 'VALORE' }], [{ text: LONG }, { text: '35 mm' }]];
  const plain = table(0, 100, [60, 20], 5, rows, 2.6), wrapped = table(0, 100, [60, 20], 5, rows, 2.6, 2);
  const one = texts(plain.shapes).find((t) => t.text === LONG);
  assert.ok(one && one.size < 2, 'una riga, ridotta');
  assert.equal(plain.bottom, 90);
  const parts = texts(wrapped.shapes).filter((t) => LONG.includes(t.text) && t.text !== 'VERIFICA');
  assert.ok(parts.length > 1 && parts.every((t) => t.size === 2.6), parts.map((t) => `${t.text}@${t.size}`).join(' | '));
  assert.ok(wrapped.bottom < plain.bottom, `${wrapped.bottom}`);
});

test('fascicolo 2:1: l’ultimo foglio con le verifiche, tutte le scritte almeno a 2 mm', () => {
  const inp: LiftInputs = { ...newLift(), calc: { ...newLift().calc, r: '2' } }, d = deriveLift(inp), marks = valueMarks(inp.auto, d, d.bottom, d.collaudo);
  const x = storedInput(d.values, d.layout, { number: '26-001', createdAt: new Date('2026-10-08T10:00:00Z'), authorInitials: 'M.R.', companyName: 'S', projectData: { name: 'R', address: 'Via Roma 1', city: 'Monza', province: 'MB', plantNumber: '', client: '' }, plant: {}, revisions: [] }, null, marks);
  assert.ok(x);
  const r = buildTavole(x), last = r.doc.pages[r.doc.pages.length - 1]?.shapes ?? [];
  assert.ok(texts(last).some((t) => t.text === 'VERIFICA'));
  for (const t of texts(last)) assert.ok(t.size >= 2 - 1e-9, `«${t.text}» a ${t.size.toFixed(2)}`);
});
