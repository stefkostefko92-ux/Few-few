import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit, rateLimitKeyCount, resetRateLimits } from '../limiter';

test('rateLimit: пуска до max в прозореца, после отказва', () => {
  resetRateLimits();
  assert.equal(rateLimit('a', 2, 1000, 0), true);
  assert.equal(rateLimit('a', 2, 1000, 1), true);
  assert.equal(rateLimit('a', 2, 1000, 2), false);
});

test('rateLimit: различните ключове не си пречат', () => {
  resetRateLimits();
  assert.equal(rateLimit('x', 1, 1000, 0), true);
  assert.equal(rateLimit('x', 1, 1000, 1), false);
  assert.equal(rateLimit('y', 1, 1000, 1), true);
});

test('rateLimit: след прозореца отново пуска (инжектирано време)', () => {
  resetRateLimits();
  assert.equal(rateLimit('w', 1, 30, 0), true);
  assert.equal(rateLimit('w', 1, 30, 10), false);
  assert.equal(rateLimit('w', 1, 30, 31), true);
});

test('чистенето не изтрива кофи с по-дълъг прозорец (смесени прозорци)', () => {
  resetRateLimits();
  const HOUR = 60 * 60_000;
  const TEN_MIN = 10 * 60_000;
  // Анкета: 1 глас в t=0 с 1-часов прозорец — на 30-ата минута още е в сила.
  assert.equal(rateLimit('poll:1', 1, HOUR, 0), true);
  // 9 999 входа в t=1 (с poll — точно на лимита от 10 000 кофи), с 10-минутен прозорец → на 30-ата минута са изтекли.
  for (let i = 0; i < 9_999; i++) rateLimit(`login:${i}`, 5, TEN_MIN, 1);
  // Една заявка на 30-ата минута задейства чистенето (кофите са над лимита).
  const now = 30 * 60_000;
  assert.equal(rateLimit('trigger', 1, TEN_MIN, now), true);
  assert.ok(rateLimitKeyCount() < 100, 'изтеклите 10-минутни кофи се чистят');
  // Анкетният глас от t=0 още се брои → втори глас се отказва.
  assert.equal(rateLimit('poll:1', 1, HOUR, now), false);
});
