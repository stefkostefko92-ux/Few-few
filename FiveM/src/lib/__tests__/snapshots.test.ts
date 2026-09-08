import assert from 'node:assert/strict';
import { test } from 'node:test';

import { bucketByHour, bucketHourLabels, HOUR_MS, type Point } from '../snapshots';

const NOW = new Date('2026-08-01T12:00:00.000Z');
const agoMin = (minutes: number, players: number): Point => ({
  at: new Date(NOW.getTime() - minutes * 60_000),
  players,
});

test('без снимки: 24 нули, не празен масив', () => {
  const buckets = bucketByHour([], 24, NOW);
  assert.equal(buckets.length, 24);
  assert.ok(buckets.every((value) => value === 0));
});

test('кофата взема ПИКА, не средното — иначе „в колко е пълно“ изчезва', () => {
  // Три снимки в един и същи час (преди 60–119 мин): 10, 64, 12.
  const buckets = bucketByHour([agoMin(110, 10), agoMin(90, 64), agoMin(65, 12)], 24, NOW);
  assert.equal(buckets[22], 64, 'средното (28.6) би скрило пика');
});

test('точките падат в кофата по възраст, най-новата е последна', () => {
  const buckets = bucketByHour([agoMin(10, 7), agoMin(60 * 5 + 10, 30)], 24, NOW);
  assert.equal(buckets[23], 7, 'последният час е най-вдясно');
  assert.equal(buckets[18], 30, 'преди 5 часа');
});

test('извън прозореца не влиза: по-старо от 24 ч и с бъдеща дата', () => {
  const future: Point = { at: new Date(NOW.getTime() + HOUR_MS), players: 999 };
  const stale: Point = { at: new Date(NOW.getTime() - 25 * HOUR_MS), players: 999 };
  const buckets = bucketByHour([future, stale], 24, NOW);
  assert.ok(buckets.every((value) => value === 0), 'чужда точка е изместила кофа');
});

test('точно на границата на прозореца се отрязва (age === span)', () => {
  const edge: Point = { at: new Date(NOW.getTime() - 24 * HOUR_MS), players: 42 };
  assert.ok(bucketByHour([edge], 24, NOW).every((value) => value === 0));
});

test('прозорецът е параметър — 6 часа значат 6 кофи', () => {
  const buckets = bucketByHour([agoMin(30, 5), agoMin(60 * 7, 99)], 6, NOW);
  assert.equal(buckets.length, 6);
  assert.equal(buckets[5], 5);
  assert.ok(!buckets.includes(99), 'точка отвъд по-късия прозорец е влязла');
});

// ── Етикети на кофите (надписът при hover) ──────────────────────────────────

test('етикетите вървят в СЪЩИЯ ред като кофите и последната е текущият час', () => {
  const now = new Date('2026-08-02T12:30:00Z'); // 15:30 в София (лятно време)
  const labels = bucketHourLabels(24, now);
  assert.equal(labels.length, 24);
  assert.equal(labels[23], '15 ч.', 'последната кофа трябва да е текущият час');
  assert.equal(labels[22], '14 ч.');
  assert.equal(labels[0], '16 ч.', '24 часа назад е същият час предния ден');
  // ICU за `bg-BG` сам добавя „ ч.“ — оттам идваше „15 ч. ч.“.
  assert.ok(!labels.some((l) => l.includes('ч. ч.')), 'удвоен суфикс');
});

test('английският сайт получава английски етикет, не български', () => {
  const now = new Date('2026-08-02T12:30:00Z');
  assert.equal(bucketHourLabels(24, now, 'en')[23], '15:00');
});

test('часът е в София, не в часовата зона на сървъра (VPS-ът е UTC)', () => {
  // Зимно време: София е UTC+2, значи 22:00 UTC е 00 ч. на следващия ден.
  const labels = bucketHourLabels(2, new Date('2026-01-15T22:00:00Z'));
  assert.equal(labels[1], '00 ч.', 'без изрична зона тук щеше да пише 22 ч.');
});
