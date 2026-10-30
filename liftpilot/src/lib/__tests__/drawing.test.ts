// The drawing kernel: the scale a view gets, dimension texts that fit or step aside, lettering widths and wrapping by
// the DejaVu metrics, shapes moved on paper, entities clipped to a band; lettering askew round what is on the sheet,
// off boxes to avoid and kept in a box past a chain's end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIM, TEXT, chain, chainShapes, clipBand, fitView, line, moveShapes, rect, renderView, shapeBox, textWidth, wrap, type Box, type Shape } from '@/drawing';
import { textQuad } from '@/drawing/metrics';

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
  // a name with numbers of its own (a beam's profile): the figure alone is the segment's value, not the name's
  const [h] = text(chainShapes({ dir: 'y', pts: [0, 300, 5000], side: 'left', row: 0, text: ['HEA 140 {v}', '{v}'] }, place, edges));
  assert.equal(h?.text, '300');
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

test('quota di sbieco: lungo la sua linea, il valore vero, letto da sinistra o dal basso', () => {
  for (const u of [[0.6, 0.8], [-0.6, -0.8]] as const) {
    const r = renderView([chain({ dir: 'x', on: { o: [0, 0], u }, pts: [0, 1000], at: -200, from: [0, 0], text: ['Calata {v}'] })], { scale: 20, ox: 0, oy: 0 });
    const t = r.shapes.find((s): s is Extract<Shape, { t: 'text' }> => s.t === 'text');
    assert.equal(t?.text, 'Calata 1000');
    assert.ok(t && Math.abs((t.angle ?? 0) - (Math.atan2(0.8, 0.6) * 180) / Math.PI) < 1e-9, `${t?.angle}`);
    // on the side of its dimension line away from the line measured
    assert.ok(t.at[0] * -u[1] + t.at[1] * u[0] < -200 / 20, `${t.at}`);
    // its extension lines square to the line, from a gap off the drops to a little past the dimension line
    const ext = r.shapes.filter((s): s is Extract<Shape, { t: 'line' }> => s.t === 'line').slice(0, 2);
    for (const l of ext) {
      const d = [l.b[0] - l.a[0], l.b[1] - l.a[1]], len = Math.hypot(d[0], d[1]);
      assert.ok(Math.abs(d[0] * u[0] + d[1] * u[1]) < 1e-9 && Math.abs(len - (200 / 20 - DIM.gap + DIM.over)) < 1e-9, `${len}`);
    }
  }
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
  const lines = wrap('il vano serve solo all’ascensore: nessun cavo, tubazione o impianto estraneo al suo servizio', 40, { size: 2, cond: true });
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

test('quota di sbieco: il valore gira attorno alle scritte già sul foglio, col suo profilo girato; libero, resta in mezzo', () => {
  const u = [Math.cos(1.3), Math.sin(1.3)] as const, place = { scale: 20, ox: 0, oy: 0 };
  const oblique = (r: ReturnType<typeof renderView>) => r.shapes.find((s): s is Extract<Shape, { t: 'text' }> => s.t === 'text' && s.text.startsWith('Calata'));
  const c = chain({ dir: 'x', on: { o: [0, 0], u }, pts: [0, 1600], at: -200, from: [0, 0], text: ['Calata {v}'] });
  const free = oblique(renderView([c], place));
  assert.ok(free);
  // a label right where it stood: it goes elsewhere, its turned outline clear of the label's box
  const label = { e: 'text' as const, at: [free.at[0] * 20, free.at[1] * 20 - 40] as const, text: 'P1 P1 P1', size: 2.5, align: 'c' as const };
  const r = renderView([label, c], place), moved = oblique(r), box = r.shapes.find((s) => s.t === 'text' && s.text === 'P1 P1 P1');
  assert.ok(moved && box && (moved.at[0] !== free.at[0] || moved.at[1] !== free.at[1]), 'spostato');
  const b = shapeBox(box), q = textQuad(moved), axes: [number, number][] = [[1, 0], [0, 1], [q[1][0] - q[0][0], q[1][1] - q[0][1]], [q[3][0] - q[0][0], q[3][1] - q[0][1]]];
  const corners: [number, number][] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  assert.ok(axes.some(([x, y]) => {
    const on = (p: readonly [number, number]): number => p[0] * x + p[1] * y, a = q.map(on), k = corners.map(on);
    return Math.max(...a) < Math.min(...k) || Math.max(...k) < Math.min(...a);
  }), 'separati');
});

test('quote: lontano dalle scatole da evitare; oltre la fine, dentro la scatola data', () => {
  const place = { scale: 10, ox: 0, oy: 0 }, text = (r: ReturnType<typeof renderView>) => r.shapes.find((s): s is Extract<Shape, { t: 'text' }> => s.t === 'text');
  // the figure over the middle of its line, unless a box to avoid is there: under it
  const free = text(renderView([line([0, 0], [1000, 0]), chain({ dir: 'x', pts: [0, 1000], at: 80 })], place));
  const off = text(renderView([line([0, 0], [1000, 0]), chain({ dir: 'x', pts: [0, 1000], at: 80, avoid: [{ x0: 400, y0: 90, x1: 600, y1: 130 }] })], place));
  assert.ok(free && off && free.at[1] > 8 && off.at[1] < 8, `${free?.at} ${off?.at}`);
  // a short segment's lettering past its end stays in the box: else its figure alone
  const ents = (within?: Box) => [rect(-200, -200, 1200, 200), chain({ dir: 'x', pts: [940, 1000], at: 0, text: ['{v} Telaio argano'], ...(within ? { within } : {}) })];
  const out = text(renderView(ents(), place)), kept = text(renderView(ents({ x0: 0, y0: -200, x1: 1000, y1: 200 }), place));
  assert.ok(out && shapeBox(out).x1 > 100, `${JSON.stringify(out && shapeBox(out))}`);
  assert.ok(kept && shapeBox(kept).x1 <= 100 + 1e-9 && shapeBox(kept).x0 >= 0, `${kept?.text} ${JSON.stringify(kept && shapeBox(kept))}`);
});
