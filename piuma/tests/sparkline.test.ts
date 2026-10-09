import assert from 'node:assert/strict';
import test from 'node:test';
import { sparkline } from '../src/admin/sparkline.js';

const points = (values: Array<number | null>) =>
  values.map((value, index) => ({ value, label: `ден ${index + 1}` }));

test('под две точки не е тренд — рисува се само числото', () => {
  assert.equal(sparkline([]).svg, '');
  assert.equal(sparkline([]).last, null);
  const one = sparkline(points([42]));
  assert.equal(one.svg, '');
  assert.equal(one.last, 42);
  assert.equal(one.delta, null);
});

test('линията, площта и крайната точка се рисуват в рамката', () => {
  const result = sparkline(points([10, 20, 30]), { width: 100, height: 40 });
  assert.match(result.svg, /class="spark-line" d="M4 36 L50 20 L96 4"/);
  assert.match(result.svg, /class="spark-area"/);
  assert.doesNotMatch(
    result.svg,
    /preserveAspectRatio="none"/,
    'разтеглянето прави точката елипса',
  );
  assert.match(result.svg, /class="spark-end" cx="96" cy="4"/);
  assert.equal(result.last, 30);
  assert.equal(result.delta, 20);
});

test('плоска редица не ляга на ръба на рамката', () => {
  const svg = sparkline(points([5, 5, 5]), { width: 100, height: 40 }).svg;
  const line = /class="spark-line" d="([^"]+)"/.exec(svg)?.[1] ?? '';
  assert.equal(line, 'M4 20 L50 20 L96 20', 'плоската линия стои по средата, не на дъното');
  assert.equal(sparkline(points([5, 5, 5])).delta, 0);
});

test('дупка в данните не чупи линията и не влиза в числата', () => {
  const result = sparkline(points([10, null, 30]));
  assert.equal(result.last, 30);
  assert.equal(result.delta, 20);
  assert.equal(result.svg.split('spark-hit').length - 1, 2, 'дупката няма мишена за посочване');
});

test('етикетът за посочване е екраниран', () => {
  const svg = sparkline([
    { value: 1, label: '<script>' },
    { value: 2, label: 'ок & добре' },
  ]).svg;
  assert.match(svg, /<title>&lt;script&gt;<\/title>/);
  assert.match(svg, /<title>ок &amp; добре<\/title>/);
  assert.doesNotMatch(svg, /<title><script>/);
});

test('показват се само последните точки при дълга редица', () => {
  const long = points(Array.from({ length: 200 }, (_, i) => i));
  const result = sparkline(long, { maxPoints: 30 });
  assert.equal(result.last, 199);
  assert.equal(result.delta, 29, 'делтата се мери спрямо първата ПОКАЗАНА точка');
});
