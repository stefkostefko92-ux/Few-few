import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShelves, shade, shortDuration, VIAL } from '../src/domain/vials.js';
import type { BatchLike } from '../src/domain/alerts.js';
import { HOUR_MS } from '../src/domain/decay.js';

const now = new Date('2026-11-04T10:00:00Z');
const rate = { decayPercent: 0.6, decayMinutes: 60 };
const types = [
  { key: 'amnesia', label: 'Amnesia' },
  { key: 'ak', label: 'AK' },
  { key: 'ogkush', label: 'OG Kush' },
  { key: 'purple', label: 'Purple' },
  { key: 'skunk', label: 'Skunk' },
];

function batch(
  id: number,
  seedTypeKey: string,
  percent: number,
  count = 3,
  anchoredAt = now,
): BatchLike {
  return { id, seedTypeKey, count, percent, anchoredAt, rate };
}

function shelves(batches: BatchLike[], thresholds: number[] = [20, 10]) {
  return buildShelves({ batches, types, thresholds, now, timezone: 'Europe/Sofia' });
}

test('рафт за всеки вид с партиди, по реда на видовете; празните — отделно', () => {
  const r = shelves([batch(1, 'skunk', 50), batch(2, 'amnesia', 40), batch(3, 'amnesia', 90)]);
  assert.deepEqual(
    r.shelves.map((s) => s.key),
    ['amnesia', 'skunk'],
  );
  assert.deepEqual(r.empty, ['AK', 'OG Kush', 'Purple']);
});

test('на рафта вляво е това, което изтича първо', () => {
  const r = shelves([batch(1, 'amnesia', 90), batch(2, 'amnesia', 15), batch(3, 'amnesia', 40)]);
  assert.deepEqual(
    r.shelves[0]?.vials.map((v) => v.id),
    [2, 3, 1],
  );
});

test('обобщението на рафта: семки, партиди, най-нисък %, първо изтича', () => {
  const r = shelves([batch(1, 'ak', 30, 10), batch(2, 'ak', 12, 4)]);
  const s = r.shelves[0];
  assert.ok(s);
  assert.equal(s.seeds, 14);
  assert.equal(s.batches, 2);
  assert.equal(s.lowestText, '12,00%');
  assert.equal(s.soonestText, '20 ч 0 мин');
});

test('нивото на разтвора следва процента в границите на стъкленицата', () => {
  const r = shelves([batch(1, 'ak', 100), batch(2, 'ak', 50), batch(3, 'ak', 0.0001)]);
  const [low, half, full] = r.shelves[0]?.vials ?? [];
  assert.ok(low && half && full);
  assert.ok(Math.abs(full.levelY - VIAL.innerTop) < 1e-6);
  assert.ok(Math.abs(half.levelY - (VIAL.innerTop + VIAL.innerHeight / 2)) < 1e-6);
  assert.ok(low.levelY <= VIAL.innerBottom && low.levelY > half.levelY);
});

test('праговете са деления по стъклото; под най-високия прагът се отбелязва с текст', () => {
  const r = shelves([batch(1, 'ak', 15), batch(2, 'ak', 80)]);
  const [under, ok] = r.shelves[0]?.vials ?? [];
  assert.ok(under && ok);
  assert.deepEqual(
    under.ticks.map((t) => t.label),
    ['20%', '10%'],
  );
  for (const t of under.ticks) assert.ok(t.y > VIAL.innerTop && t.y < VIAL.innerBottom);
  assert.equal(under.status, 'под 20%');
  const deeper = shelves([batch(3, 'ak', 8)]).shelves[0]?.vials[0];
  assert.equal(deeper?.status, 'под 10%');
  assert.equal(ok.status, null);
});

test('изтекла партида: празна стъкленица и надпис', () => {
  const old = new Date(now.getTime() - 10 * HOUR_MS);
  const r = shelves([batch(1, 'purple', 3, 2, old)]);
  const v = r.shelves[0]?.vials[0];
  assert.ok(v);
  assert.equal(v.expired, true);
  assert.equal(v.leftText, 'изтекла');
  assert.equal(v.levelY, VIAL.innerBottom);
});

test('семената са вътре в разтвора, най-много 7, и са едни и същи при всяко рисуване', () => {
  const a = shelves([batch(42, 'ak', 60, 25)]).shelves[0]?.vials[0];
  const b = shelves([batch(42, 'ak', 60, 25)]).shelves[0]?.vials[0];
  assert.ok(a && b);
  assert.equal(a.seeds.length, 7);
  assert.deepEqual(a.seeds, b.seeds);
  for (const s of a.seeds) {
    assert.ok(s.cy >= a.levelY && s.cy <= VIAL.innerBottom);
    assert.ok(s.cx >= VIAL.innerLeft && s.cx <= VIAL.innerRight);
  }
  const few = shelves([batch(1, 'ak', 60, 2)]).shelves[0]?.vials[0];
  assert.equal(few?.seeds.length, 2);
});

test('цветовете на разтвора: тъмен ръб и светла среда от цвета на вида', () => {
  assert.equal(shade('#3987e5', 0), '#3987e5');
  assert.equal(shade('#3987e5', -1), '#000000');
  assert.equal(shade('#3987e5', 1), '#ffffff');
  const r = shelves([batch(1, 'amnesia', 50)]);
  const s = r.shelves[0];
  assert.ok(s);
  assert.equal(s.color, '#3987e5');
  assert.match(s.dark, /^#[0-9a-f]{6}$/);
  assert.match(s.light, /^#[0-9a-f]{6}$/);
});

test('кратко оставащо време под стъкленицата', () => {
  assert.equal(shortDuration((3 * 24 + 19) * HOUR_MS + 39 * 60_000), '3 д 19 ч');
  assert.equal(shortDuration(15 * HOUR_MS + 49 * 60_000), '15 ч 49 мин');
  assert.equal(shortDuration(5 * 60_000), '5 мин');
});
