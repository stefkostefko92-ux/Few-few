// The drawing kernel: the scale a view gets, dimension texts that fit or step aside, lettering widths and wrapping by
// the DejaVu metrics, shapes moved on paper, entities clipped to a band.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIM, TEXT, chain, chainShapes, clipBand, fitView, line, moveShapes, rect, renderView, shapeBox, textWidth, wrap, type Box, type Shape } from '@/drawing';

test('fitView: la scala normalizzata più grande che entra, con le file delle quote', () => {
  const model = { x0: 0, y0: 0, x1: 2000, y1: 1500 };
  const ents = [rect(0, 0, 2000, 1500, 'wall'), chain({ dir: 'x', pts: [0, 2000], side: 'bottom', row: 0 })];
  // 2000 mm in 190 mm of paper: 1:20 would need 100 mm plus the row, 1:10 200 mm
  assert.equal(fitView(model, ents, { x0: 0, y0: 0, x1: 190, y1: 190 })?.scale, 20);
  assert.equal(fitView(model, ents, { x0: 0, y0: 0, x1: 250, y1: 250 })?.scale, 10);
  assert.equal(fitView(model, ents, { x0: 0, y0: 0, x1: 3, y1: 3 }), null);
  // centred in the area, rows included
  const p = fitView(model, ents, { x0: 0, y0: 0, x1: 190, y1: 190 });
  assert.ok(p && Math.abs(p.ox + 2000 / 20 / 2 - 95) < 1e-9);
});

test('quote: il valore tiene le sue parole e la sua misura, fuori dal tratto sulla linea prolungata o accanto, mai più piccolo del minimo', () => {
  const place = { scale: 50, ox: 0, oy: 0 }, edges = { x0: 0, y0: 0, x1: 100, y1: 100 };
  const text = (s: Shape[]) => s.filter((x): x is Extract<Shape, { t: 'text' }> => x.t === 'text');
  const lines = (s: Shape[]) => s.filter((x): x is Extract<Shape, { t: 'line' }> => x.t === 'line');
  // 330 mm at 1:50 = 6,6 mm: "330 Ammortizzatore" keeps its words at full size past the upper end, the dimension line
  // run on under it
  const c330 = chainShapes({ dir: 'y', pts: [0, 330], side: 'left', row: 0, text: ['{v} Ammortizzatore'] }, place, edges);
  const [t] = text(c330);
  assert.deepEqual([t?.text, t?.size, t?.align], ['330 Ammortizzatore', TEXT.dim, 'l']);
  assert.ok(t && t.at[1] > 330 / 50, 'oltre la fine');
  assert.ok(lines(c330).some((l) => l.a[0] === l.b[0] && Math.max(l.a[1], l.b[1]) > 330 / 50 + 5), 'linea di misura prolungata sotto il testo');
  // a lowest segment near the bottom edge does not go below the drawing: its figure alone, in its middle
  const [v] = text(chainShapes({ dir: 'y', pts: [0, 300, 5000], side: 'left', row: 0, text: ['{v} Base Ammortizzatore', '{v}'] }, place, edges));
  assert.ok(v && v.at[1] >= -1 && v.text === '300', `${v?.text} ${v?.at[1]}`);
  // a segment wide enough keeps its text centred at full size
  const [w] = text(chainShapes({ dir: 'x', pts: [0, 3000], side: 'bottom', row: 0 }, place, edges));
  assert.deepEqual([w?.size, w?.align, w?.text], [TEXT.dim, 'c', '3000']);
  // short segments in a row: each value at full size, none over another, none smaller than the minimum; the points they
  // share marked by dots
  const taken: Box[] = [], tight = chainShapes({ dir: 'x', pts: [0, 1000, 1080, 1110, 1190, 3000], side: 'bottom', row: 0 }, place, edges, undefined, taken);
  const vals = text(tight);
  assert.deepEqual(vals.map((x) => x.text), ['1000', '80', '30', '80', '1810']);
  for (const x of vals) assert.ok(x.size >= DIM.minText, `${x.text} ${x.size}`);
  vals.forEach((a, i) => vals.forEach((b, j) => {
    if (j <= i) return;
    const p = shapeBox(a), q = shapeBox(b);
    assert.ok(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, `${a.text} su ${b.text}`);
  }));
  assert.ok(tight.filter((x) => x.t === 'circle').length >= 3, 'punti dei tratti corti');
  // the extension line starts a gap off the element measured; a point on the wall starts from the drawing's edge
  const ext = lines(chainShapes({ dir: 'x', pts: [0, 1000], side: 'top', row: 1, from: [200, undefined] }, place, edges)).filter((l) => l.a[0] === l.b[0]);
  assert.deepEqual(ext.map((l) => [l.a[0], +Math.min(l.a[1], l.b[1]).toFixed(3)]), [[0, 200 / 50 + DIM.gap], [20, 100 + DIM.gap]]);
});

test('quote: la cifra gira attorno alle scritte già sul foglio', () => {
  // a label right where the figure of a level chain would go: the figure goes under its line
  const r = renderView([line([0, 0], [1000, 0]), { e: 'text', at: [500, 100], text: 'QUADRO', size: 2.5, align: 'c' }, chain({ dir: 'x', pts: [0, 1000], at: 80 })], { scale: 10, ox: 0, oy: 0 });
  const texts = r.shapes.filter((s): s is Extract<Shape, { t: 'text' }> => s.t === 'text');
  const label = texts.find((s) => s.text === 'QUADRO'), fig = texts.find((s) => s.text === '1000');
  assert.ok(label && fig);
  const a = shapeBox(label), b = shapeBox(fig);
  assert.ok(b.y1 < a.y0 && b.y1 < 8, `${JSON.stringify(b)}`);
});

test('lettere: larghezze DejaVu, condensato, a capo', () => {
  const a = textWidth('PIANTA', { size: 2.5 }), c = textWidth('PIANTA', { size: 2.5, cond: true }), b = textWidth('PIANTA', { size: 2.5, bold: true });
  assert.ok(c < a && a < b);
  assert.ok(Math.abs(textWidth('PIANTA', { size: 5 }) - 2 * a) < 1e-9);
  const lines = wrap('il vano serve solo all\'ascensore: nessun cavo, tubazione o impianto estraneo al suo servizio', 40, { size: 2, cond: true });
  assert.ok(lines.length > 1 && lines.every((l) => textWidth(l, { size: 2, cond: true }) <= 40 + 1e-9));
});

test('forme spostate sulla carta e entità tagliate a una fascia', () => {
  const r = renderView([line([0, 0], [1000, 1000]), rect(0, 0, 500, 500)], { scale: 10, ox: 5, oy: 5 });
  const moved = moveShapes(r.shapes, 10, -2);
  assert.deepEqual(moved[0]?.t === 'line' ? [moved[0].a, moved[0].b] : null, [[15, 3], [115, 103]]);
  const clipped = clipBand([line([0, -100], [0, 900]), line([10, 2000], [10, 3000])], 0, 1000);
  assert.equal(clipped.length, 1);
  assert.deepEqual(clipped[0]?.e === 'line' ? [clipped[0].a[1], clipped[0].b[1]] : null, [0, 900]);
});
