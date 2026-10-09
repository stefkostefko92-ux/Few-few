import assert from 'node:assert/strict';
import test from 'node:test';
import type { PostPerformance } from '../src/services/insights.js';
import { DAY_PARTS, dayPartOf, learnFrom, suggestedTimes } from '../src/services/learn.js';

/* Слоят, който учи от собствените числа. Тестовете пазят ЧЕСТНОСТТА, не само сметките:
   малка извадка да не ражда уверен извод, обхватът да не се чете като качество, а поясът
   да е в същия часовник, в който планировчикът после насрочва. */

let counter = 0;
function post(partial: Partial<PostPerformance> & { rate: number }): PostPerformance {
  counter += 1;
  return {
    id: `p${counter}`,
    kind: partial.kind ?? 'IMAGE',
    caption: `caption ${counter}`,
    topic: partial.topic ?? null,
    permalink: null,
    // `??` би превърнало изричното `null` в дефолта, тоест случаят „пост без дата“
    // нямаше как да се тества изобщо.
    publishedAt: 'publishedAt' in partial ? partial.publishedAt! : new Date('2026-09-01T20:00:00'),
    reach: partial.reach ?? 1000,
    views: 0,
    interactions: Math.round(((partial.reach ?? 1000) * partial.rate) / 100),
    engagementRate: partial.rate,
    fetchedAt: new Date(),
  };
}

/** `n` поста в даден час с дадени проценти — за пълнене на кофа до прага. */
function atHour(hour: number, rates: number[], kind: 'IMAGE' | 'REELS' = 'IMAGE') {
  return rates.map((rate) => post({ rate, kind, publishedAt: new Date(2026, 8, 1, hour, 0, 0) }));
}

test('поясите покриват денонощието без дупка и нощта минава през полунощ', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const key = dayPartOf(hour);
    assert.ok(
      DAY_PARTS.some((part) => part.key === key),
      `час ${hour} не попада в пояс`,
    );
  }
  assert.equal(dayPartOf(6), 'morning');
  assert.equal(dayPartOf(10), 'morning');
  assert.equal(dayPartOf(11), 'midday');
  assert.equal(dayPartOf(19), 'evening');
  assert.equal(dayPartOf(22), 'evening');
  // Границите на нощта: 23 и 0 са един пояс.
  assert.equal(dayPartOf(23), 'night');
  assert.equal(dayPartOf(0), 'night');
  assert.equal(dayPartOf(5), 'night');
});

test('без публикации не се твърди нищо', () => {
  const learned = learnFrom([]);
  assert.equal(learned.sample, 0);
  assert.equal(learned.timing.confidence, 'none');
  assert.equal(learned.timing.reason, 'no-posts');
  assert.equal(learned.timing.best, null);
  assert.deepEqual(suggestedTimes(learned), []);
});

test('малка извадка показва числата, но мълчи за извода', () => {
  // По три поста в два пояса — под прага от шест.
  const learned = learnFrom([...atHour(20, [9, 8, 10]), ...atHour(8, [2, 3, 1])]);
  assert.equal(learned.timing.confidence, 'early');
  assert.equal(learned.timing.reason, 'too-few');
  assert.equal(learned.timing.best, null, 'при шест поста не се обявява печеливш час');
  // Кофите СА видими — човек трябва да вижда какво има, дори да няма извод.
  assert.equal(learned.timing.buckets.length, 2);
  assert.equal(learned.timing.buckets[0]?.posts, 3);
  assert.deepEqual(suggestedTimes(learned), []);
});

test('достатъчно данни и ясна преднина дават извод и час за плана', () => {
  const learned = learnFrom([
    ...atHour(20, [9, 8.5, 9.5, 8, 10, 9]),
    ...atHour(8, [3, 2.5, 3.5, 3, 2, 4]),
  ]);
  assert.equal(learned.timing.confidence, 'ready');
  assert.equal(learned.timing.reason, 'ok');
  assert.equal(learned.timing.best, 'evening');
  assert.equal(learned.sample, 12);
  // Средата на пояса 19–23 → 21:00, право за `postingTimes`.
  assert.deepEqual(suggestedTimes(learned), ['21:00']);
});

test('достатъчно данни, но разлика в рамките на шума — пак мълчи', () => {
  const learned = learnFrom([
    ...atHour(20, [5, 5.2, 4.8, 5.1, 4.9, 5]),
    ...atHour(8, [4.9, 5, 5.1, 4.8, 5.2, 5]),
  ]);
  assert.equal(learned.timing.confidence, 'early');
  assert.equal(learned.timing.reason, 'no-clear-winner');
  assert.equal(learned.timing.best, null);
  assert.deepEqual(suggestedTimes(learned), []);
});

/**
 * Дефектът, който това замества: победителят се избираше по СРЕДЕН ОБХВАТ. Обхватът расте
 * с последователите, тоест по-новите постове печелят заради растежа на акаунта, не заради
 * съдържанието. Тук сутрешните имат четирикратен обхват, но слаба ангажираност.
 */
test('обхватът не се чете като качество — мярката е ангажираност', () => {
  const learned = learnFrom([
    ...atHour(20, [9, 8.5, 9.5, 8, 10, 9]).map((row) => ({ ...row, reach: 1000 })),
    ...atHour(8, [3, 2.5, 3.5, 3, 2, 4]).map((row) => ({ ...row, reach: 4000 })),
  ]);
  assert.equal(
    learned.timing.best,
    'evening',
    'големият обхват не бива да бие слабата ангажираност',
  );
});

test('медиана, не средно — един вирусен пост не решава сам', () => {
  // Сутрин: пет слаби и един изстрел. Средното би било подвеждащо високо.
  const learned = learnFrom([
    ...atHour(8, [1, 1, 1, 1, 1, 60]),
    ...atHour(20, [4, 4.5, 4, 5, 4, 4.5]),
  ]);
  assert.equal(learned.timing.best, 'evening');
});

test('форматът и темата се четат и от пост без точно време', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => post({ rate: 9, kind: 'REELS', publishedAt: null })),
    ...Array.from({ length: 6 }, () => post({ rate: 3, kind: 'IMAGE', publishedAt: null })),
  ];
  const learned = learnFrom(rows);
  assert.equal(learned.format.best, 'REELS');
  // Часът липсва навсякъде → поясите нямат какво да кажат, но форматът има.
  assert.equal(learned.timing.confidence, 'none');
});

test('темите се класират по същата стълба', () => {
  const rows = [
    ...Array.from({ length: 6 }, () => post({ rate: 9, topic: 'Зад кулисите' })),
    ...Array.from({ length: 6 }, () => post({ rate: 2, topic: 'Промоции' })),
    post({ rate: 50, topic: 'Еднократна' }), // една публикация не печели нищо
  ];
  const learned = learnFrom(rows);
  assert.equal(learned.topic.best, 'Зад кулисите');
  assert.ok(
    learned.topic.buckets.some((bucket) => bucket.value === 'Еднократна' && bucket.posts === 1),
  );
});

test('пост без обхват не участва — делението няма смисъл', () => {
  const learned = learnFrom([...atHour(20, [9, 8, 10]), post({ rate: 0, reach: 0 })]);
  assert.equal(learned.sample, 3);
});

/**
 * Поясите се смятат в ЛОКАЛНИЯ часовник, защото `nextSlots` насрочва със `setHours` в
 * същия. Анализ в UTC би дал пояс, който планировчикът после мести с часове — тиха грешка,
 * която никой не вижда, докато постовете не започнат да излизат в грешния момент.
 */
test('поясът е в часовника на планировчика, не в UTC', () => {
  const learned = learnFrom(atHour(20, [9, 8, 10]));
  assert.equal(learned.timing.buckets[0]?.value, 'evening');
  assert.equal(typeof learned.timezone, 'string');
  assert.ok(learned.timezone.length > 0, 'часовата зона се показва, за да се види разминаване');
});
