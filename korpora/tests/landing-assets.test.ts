import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropView } from '../src/services/landing-assets.js';
import { labelSpot } from '../src/services/sheet-labels.js';

const SHEET =
  '<svg viewBox="0 0 420 297" class="rdw"><rect class="d-out" x="10" y="20" width="100" height="50"/></svg>';

test('a crop view frames the first rect of the class with padding, scaled for <img>', () => {
  const view = cropView(SHEET, 'd-out', { x: 5, top: 2, bottom: 3 }, 4);
  assert.match(view.svg, /viewBox="5 18 110 55"/);
  assert.equal(view.width, 440);
  assert.equal(view.height, 220);
});

test('without the rect the whole sheet is shown, sized from its own viewBox and the same scale', () => {
  const view = cropView(SHEET, 'd-box', { x: 1.5, top: 1.5, bottom: 1.5 }, 4);
  assert.equal(view.svg, SHEET);
  assert.equal(view.width, 1680);
  assert.equal(view.height, 1188);
  const wide = cropView(
    '<svg viewBox="0 0 594 420"></svg>',
    'd-out',
    { x: 0, top: 0, bottom: 0 },
    2,
  );
  assert.equal(wide.width / wide.height, 594 / 420);
});

test('a part number sits as near the middle of the part as nothing runs through it', () => {
  const panel = { x: 0, y: 0, w: 600, h: 700 };
  // 3 letters × 0.6 em × 64 = 115.2 wide, capitals 0.73 em = 46.7 tall: centred
  assert.deepEqual(labelSpot(panel, 'P01', []), { x: 242.4, y: 373.4, size: 64 });
  // a hole in the middle moves it just clear of the hole, still on the part
  const moved = labelSpot(panel, 'P01', [{ x: 300, y: 350, r: 5 }]);
  assert.equal(moved.size, 64);
  const clear = (x: number, y: number) =>
    300 < x - 12 - 5 || 300 > x + 115.2 + 12 + 5 || 350 < y - 46.7 - 12 - 5 || 350 > y + 12 + 5;
  assert.ok(clear(moved.x, moved.y), `${moved.x} ${moved.y}`);
  // a groove along the middle: the number leaves it as well
  const groove = { x0: 0, y0: 350, x1: 600, y1: 350, half: 2.5 };
  const off = labelSpot(panel, 'P01', [], [groove]);
  assert.ok(off.y < 350 - 12 - 2.5 || off.y - 46.7 > 350 + 12 + 2.5, `${off.y}`);
  // a rail 100 mm tall with a hole at each end: between them, at full size
  const rail = labelSpot({ x: 0, y: 0, w: 560, h: 100 }, 'P04', [
    { x: 60, y: 50, r: 5 },
    { x: 500, y: 50, r: 5 },
  ]);
  assert.deepEqual(rail, { x: 251.2, y: 61.7, size: 32 });
});
