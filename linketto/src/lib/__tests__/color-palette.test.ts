import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTE, PALETTE_GROUPS, dominantColors, isHex, normalizeHex, pushRecent } from '../color-palette';

test('PALETTE: само валидни #rrggbb, групите по 8 (живите — 16), без повторения', () => {
  const all = PALETTE_GROUPS.flatMap((group) => PALETTE[group]);
  assert.ok(all.every(isHex));
  assert.equal(new Set(all.map((c) => c.toLowerCase())).size, all.length);
  for (const group of PALETTE_GROUPS) assert.equal(PALETTE[group].length % 8, 0, group);
});

test('normalizeHex: прощава формата, отказва боклука', () => {
  assert.equal(normalizeHex('22C55E'), '#22c55e');
  assert.equal(normalizeHex(' #22c55e '), '#22c55e');
  assert.equal(normalizeHex('#2c5'), '#22cc55');
  assert.equal(normalizeHex('abc'), '#aabbcc');
  assert.equal(normalizeHex(''), '');
  assert.equal(normalizeHex('   '), '');
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex('зелено'), null);
  assert.equal(normalizeHex('#gggggg'), null);
});

const px = (r: number, g: number, b: number, a = 255, times = 1) =>
  Array.from({ length: times }, () => [r, g, b, a]).flat();

test('dominantColors: двата основни цвята, сивото и прозрачното отзад', () => {
  const pixels = [
    ...px(220, 30, 40, 255, 500), // червено
    ...px(30, 60, 220, 255, 300), // синьо
    ...px(128, 128, 128, 255, 600), // сиво — много, но ненаситено
    ...px(0, 255, 0, 0, 2000), // прозрачно — не се брои
  ];
  const colors = dominantColors(pixels, 3);
  assert.equal(colors.length, 3);
  assert.deepEqual(colors.slice(0, 2), ['#dc1e28', '#1e3cdc']);
  assert.ok(!colors.includes('#00ff00'));
});

test('dominantColors: близките нюанси не се повтарят; празна снимка → []', () => {
  const pixels = [...px(200, 40, 40, 255, 100), ...px(205, 45, 42, 255, 100), ...px(40, 200, 40, 255, 50)];
  const colors = dominantColors(pixels, 6);
  assert.equal(colors.length, 2);
  assert.deepEqual(dominantColors([], 6), []);
});

test('pushRecent: новият отпред, без повторения, таван; невалиден — без промяна', () => {
  assert.deepEqual(pushRecent(['#111111', '#222222'], '#222222'), ['#222222', '#111111']);
  assert.deepEqual(pushRecent(['#111111'], '#ABCDEF'), ['#abcdef', '#111111']);
  assert.equal(pushRecent(Array.from({ length: 8 }, (_, i) => `#00000${i}`), '#ffffff').length, 8);
  assert.deepEqual(pushRecent(['#111111'], 'x'), ['#111111']);
});
