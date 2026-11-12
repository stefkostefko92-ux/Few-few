import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { elementoSchema } from '../src/schizzi/elementi.js';
import { browser, plain } from './schizzi-browser.js';

// Moving and snapping in the sketch editor (public/js/schizzo-regole.js, schizzo-aggancio.js): what the
// editor makes of a move or a snapped point, the server takes.

describe('the sketch editor rules', () => {
  it('moves a selection only as far as the sheet goes, and the server takes the result', () => {
    const b = browser();
    const els = [
      { t: 'p', c: 'k', s: 1, d: 'M10 20l500 300' },
      { t: 'q', c: 'k', s: 1, x1: 1300, y1: 900, x2: 1390, y2: 990, o: 0, v: '1' },
      { t: 's', c: 'k', s: 1, n: 'cabina', x: 700, y: 500, w: 400, h: 300, r: 1 },
    ];
    for (const [dx, dy] of [
      [-500, -500],
      [500, 500],
      [3, -7],
      [0, 2000],
    ] as const) {
      const [mx, my] = b.limitMove(els, dx, dy);
      for (const el of els)
        assert.ok(elementoSchema.safeParse(b.moved(el, mx, my)).success, `${dx},${dy}`);
    }
    assert.deepEqual(plain(b.limitMove(els, -500, -500)), [-10, -20]);
    assert.deepEqual(plain(b.limitMove(els, 500, 500)), [10, 10]);
  });

  it('snaps to whole units, also to the corner of a symbol of odd size', () => {
    const b = browser();
    const cabina = { t: 's', c: 'k', s: 1, n: 'cabina', x: 138, y: 125, w: 75, h: 50, r: 0 };
    const options = { on: true, elements: [cabina], tolerance: 10, unitsPerPx: 1 };
    const { p, kind } = b.snap({ x: 100.3, y: 100.2 }, options);
    assert.equal(kind, 'punto');
    assert.ok(Number.isInteger(p.x) && Number.isInteger(p.y), JSON.stringify(p));
    const line = b.normalizza({ t: 'p', c: 'k', s: 1, d: `M${p.x} ${p.y}l300 300` });
    assert.ok(line && elementoSchema.safeParse(line).success);
  });

  it('keeps the line of a dimension on the sheet when it moves (2 units past the edge, as the server)', () => {
    const b = browser();
    const quote = [
      { t: 'q', c: 'k', s: 1, x1: 100, y1: 60, x2: 500, y2: 60, o: -50, v: '1600' },
      { t: 'q', c: 'k', s: 1, x1: 1300, y1: 200, x2: 1300, y2: 600, o: -95, v: '400' },
      { t: 'q', c: 'k', s: 1, x1: 300, y1: 300, x2: 700, y2: 650, o: 120, v: '7' },
    ];
    for (const q of quote) {
      assert.ok(elementoSchema.safeParse(q).success);
      for (const [dx, dy] of [
        [0, -60],
        [0, -13],
        [2000, 0],
        [-2000, 0],
        [0, 2000],
        [-37, 41],
      ] as const) {
        const [mx, my] = b.limitMove([q], dx, dy);
        assert.ok(Number.isInteger(mx) && Number.isInteger(my));
        assert.ok(elementoSchema.safeParse(b.moved(q, mx, my)).success, `${q.v} ${dx},${dy}`);
      }
    }
    // The upper line is at y = 10: up to 12 units more, not 60.
    assert.deepEqual(plain(b.limitMove([quote[0]], 0, -60)), [0, -12]);
  });
});
