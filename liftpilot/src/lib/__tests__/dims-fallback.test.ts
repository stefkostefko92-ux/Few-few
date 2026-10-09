// A dimension's value with no free place left (round 37, W2-L5o-02): it takes the place the lettering already on the
// sheet covers least, never the first place by default on top of another value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainShapes, textBox, type Box, type TextShape } from '@/drawing';

const area = (a: Box, b: Box): number => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

test('valore senza posto libero: dove la scritta già sul foglio lo copre meno', () => {
  // a 12 mm segment on a line at y = 0; lettering over the line from 0.2 to 4 mm and under it everywhere: no place is
  // free, the one set off over the line on a leader (its letters from about 2.9 mm up) is the least covered
  const taken: Box[] = [{ x0: -60, y0: 0.2, x1: 80, y1: 4 }, { x0: -60, y0: -20, x1: 80, y1: -0.2 }], before = taken.map((b) => ({ ...b }));
  const shapes = chainShapes({ dir: 'x', pts: [0, 12], at: 0, from: 0 }, { scale: 1, ox: 0, oy: 0 }, { x0: -60, y0: -20, x1: 80, y1: 20 }, undefined, taken);
  const value = shapes.find((s): s is TextShape => s.t === 'text');
  assert.ok(value, 'il valore');
  const b = textBox(value), first: Box = { x0: 6 - 3, y0: 0.8, x1: 6 + 3, y1: 3.6 };
  const covered = before.reduce((n, t) => n + area(b, t), 0);
  assert.ok(covered < before.reduce((n, t) => n + area(first, t), 0), `coperto ${covered.toFixed(2)} mm²`);
  assert.ok(b.y0 > 2.5, `sopra, con la linea di richiamo: ${b.y0.toFixed(2)}`);
  assert.ok(shapes.some((s) => s.t === 'line' && Math.abs(s.a[0] - 6) < 1e-6 && Math.abs(s.b[0] - 6) < 1e-6), 'linea di richiamo dal segmento');
});
