import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { resetRateLimits, withinGlobalRateLimit } from '../rate-limit';

/**
 * Единствената анти-спам защита на публичните форми, и досега без нито един
 * тест. Времето се подава като аргумент (`now`), затова тестовете са
 * детерминистични — нула `sleep`, нула зависимост от истинския часовник.
 */
beforeEach(() => resetRateLimits());

const T0 = 1_000_000;

test('пуска до тавана и спира след него', () => {
  for (let i = 1; i <= 60; i += 1) {
    assert.equal(withinGlobalRateLimit('submit', T0), true, `заявка ${i} трябваше да мине`);
  }
  assert.equal(withinGlobalRateLimit('submit', T0), false, '61-вата трябва да бъде спряна');
});

test('прозорецът се източва — след минута отново се пуска', () => {
  for (let i = 0; i < 61; i += 1) withinGlobalRateLimit('submit', T0);
  assert.equal(withinGlobalRateLimit('submit', T0 + 60_001), true, 'прозорецът не се източи');
});

test('точно на границата прозорецът ОЩЕ е стар — няма подраняване', () => {
  for (let i = 0; i < 61; i += 1) withinGlobalRateLimit('submit', T0);
  assert.equal(withinGlobalRateLimit('submit', T0 + 60_000), false, 'изтече твърде рано');
});

test('действията са РАЗДЕЛЕНИ — формите не се блокират взаимно', () => {
  // Иначе вълна върху „сигнал“ би затворила и „добави сървър“, и обратно.
  for (let i = 0; i < 61; i += 1) withinGlobalRateLimit('report', T0);
  assert.equal(withinGlobalRateLimit('report', T0), false);
  assert.equal(withinGlobalRateLimit('submit', T0), true, 'чуждото действие е било засегнато');
  assert.equal(withinGlobalRateLimit('review', T0), true);
});

test('часовник назад не отваря тавана', () => {
  // `now - start > WINDOW` е невярно при отрицателна разлика, значи скок назад
  // (NTP, ръчна смяна) НЕ нулира брояча — иначе е безплатен байпас.
  for (let i = 0; i < 61; i += 1) withinGlobalRateLimit('submit', T0);
  assert.equal(withinGlobalRateLimit('submit', T0 - 500_000), false, 'скок назад отвори тавана');
});

test('resetRateLimits наистина изчиства — иначе тестовете лъжат', () => {
  for (let i = 0; i < 61; i += 1) withinGlobalRateLimit('submit', T0);
  assert.equal(withinGlobalRateLimit('submit', T0), false);
  resetRateLimits();
  assert.equal(withinGlobalRateLimit('submit', T0), true);
});
