import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cropView } from '../src/services/landing-assets.js';

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
