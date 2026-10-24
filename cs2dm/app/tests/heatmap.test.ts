import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CELL_PX,
  DUST2_OVERVIEW,
  GRID,
  HEATMAP_DELAY_MS,
  aggregate,
  cellOf,
  cleanCells,
  heatmapWindow,
  hottestSector,
  renderHeatmapSvg,
  worldToRadar,
} from '../src/heatmap.js';

test('константите са от de_dust2.txt (CONTRACT.md §4)', () => {
  assert.deepEqual(DUST2_OVERVIEW, { posX: -2476, posY: 3239, scale: 4.4, size: 1024 });
  assert.equal(GRID * CELL_PX, 1024);
});

test('трансформацията: px = (x − pos_x) / scale, py = (pos_y − y) / scale', () => {
  assert.deepEqual(worldToRadar(-2476, 3239), { px: 0, py: 0 });
  const far = worldToRadar(-2476 + 4.4 * 1024, 3239 - 4.4 * 1024);
  assert.ok(Math.abs(far.px - 1024) < 1e-9);
  assert.ok(Math.abs(far.py - 1024) < 1e-9);
  // Средата на радара.
  const mid = worldToRadar(-2476 + 4.4 * 512, 3239 - 4.4 * 512);
  assert.ok(Math.abs(mid.px - 512) < 1e-9 && Math.abs(mid.py - 512) < 1e-9);
  // y расте нагоре в света и надолу на радара.
  assert.ok(worldToRadar(0, 1000).py < worldToRadar(0, 0).py);
});

test('клетката на точка и изхвърлянето на точки извън радара', () => {
  assert.deepEqual(cellOf(-2476, 3239), { cx: 0, cy: 0 });
  assert.deepEqual(cellOf(-2476 + 4.4 * 40, 3239 - 4.4 * 80), { cx: 1, cy: 2 });
  assert.equal(cellOf(-2477, 3239), null, 'вляво от радара');
  assert.equal(cellOf(-2476 + 4.4 * 1100, 0), null, 'вдясно от радара');
  assert.equal(cellOf(0, 3239 + 10), null, 'над радара');
  assert.equal(cellOf(Number.NaN, 0), null);
});

test('агрегирането брои точките по клетки', () => {
  const x = -2476 + 4.4 * 100;
  const y = 3239 - 4.4 * 40;
  const cells = aggregate([
    { x, y },
    { x: x + 4.4, y },
    { x: -9999, y: -9999 },
    { x: -2476 + 4.4 * 900, y: 3239 - 4.4 * 900 },
  ]);
  assert.deepEqual(cells, [
    { cx: 3, cy: 1, n: 2 },
    { cx: 28, cy: 28, n: 1 },
  ]);
});

test('cleanCells пази само валидни клетки от SQL', () => {
  assert.deepEqual(
    cleanCells([
      { cx: -1, cy: 0, n: 3 },
      { cx: 0, cy: GRID, n: 3 },
      { cx: 4, cy: 4, n: 0 },
      { cx: 4, cy: 4, n: 2 },
    ]),
    [{ cx: 4, cy: 4, n: 2 }],
  );
});

test('прозорецът е 30 дни назад и спира час преди сега (никога на живо)', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const { since, until } = heatmapWindow(now);
  assert.equal(now.getTime() - until.getTime(), HEATMAP_DELAY_MS);
  assert.ok(HEATMAP_DELAY_MS >= 60 * 60 * 1000);
  assert.equal(since.toISOString(), '2026-09-24T12:00:00.000Z');
});

test('SVG-ът е самостоятелен: нула външни ресурси, достъпно име, клетки с плътност', () => {
  const svg = renderHeatmapSvg({
    id: 'hm-test',
    kind: 'kills',
    cells: [
      { cx: 1, cy: 1, n: 1 },
      { cx: 2, cy: 2, n: 50 },
    ],
    title: 'Убийства <script>',
    description: 'Описание & още',
  });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /role="img" aria-labelledby="hm-test-t hm-test-d"/);
  assert.match(svg, /<title id="hm-test-t">Убийства &lt;script&gt;<\/title>/);
  assert.match(svg, /<desc id="hm-test-d">Описание &amp; още<\/desc>/);
  assert.doesNotMatch(svg, /<image|href=|url\(|<script/i, 'никакви външни картинки или скриптове');
  const cells = [
    ...svg.matchAll(/class="hm-cell" x="(\d+)" y="(\d+)"[^>]*fill-opacity="([\d.]+)"/g),
  ];
  assert.equal(cells.length, 2);
  assert.equal(cells[1]?.[3], '1.00', 'най-гъстата клетка е с пълна плътност');
  assert.ok(Number(cells[0]?.[3]) < 1);
  assert.equal(cells[0]?.[1], String(CELL_PX));
  assert.match(svg, />A<\/text>/);
  assert.match(svg, />8<\/text>/);
  assert.equal(svg.split('<svg').length - 1, 1);
});

test('празен heatmap пак е валидна рамка без клетки', () => {
  const svg = renderHeatmapSvg({
    id: 'x',
    kind: 'deaths',
    cells: [],
    title: 't',
    description: 'd',
  });
  assert.doesNotMatch(svg, /hm-cell/);
  assert.match(svg, /hm-frame/);
});

test('най-гъстият сектор се назовава в решетката 8 × 8', () => {
  assert.equal(
    hottestSector([
      { cx: 0, cy: 0, n: 1 },
      { cx: 9, cy: 13, n: 5 },
      { cx: 8, cy: 12, n: 2 },
    ]),
    'C4',
  );
  assert.equal(hottestSector([]), null);
});
