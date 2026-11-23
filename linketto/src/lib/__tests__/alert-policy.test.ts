import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertDue, ALERT_RULE_CAP_PER_HOUR, OUTSIDER_ALERTS_PER_DAY, OUTSIDER_ALERTS_PER_HOUR, outsiderBudgetExhausted } from '../alert-policy';
import { isCriticalKey } from '../limiter';

// Стражата B1 + Разбивача F4: аларма при count >= праг (не ===), веднъж на
// прозорец за правило+ключ и общ таван на правило — нито заливане, нито ослепяване.

test('под прага — няма аларма; на и над прага — има', () => {
  const t0 = Date.UTC(2026, 10, 21, 12);
  assert.equal(alertDue({ count: 2, threshold: 3, rule: 't1', key: 'a', now: t0 }), false);
  assert.equal(alertDue({ count: 3, threshold: 3, rule: 't1', key: 'a', now: t0 }), true);
});

test('постоянен поток над прага: една аларма на прозорец, после пак (не се ослепява)', () => {
  const t0 = Date.UTC(2026, 10, 21, 13);
  const hour = 60 * 60_000;
  assert.equal(alertDue({ count: 5, threshold: 3, rule: 't2', key: 'k', now: t0, windowMs: hour }), true);
  // Нападателят държи брояча над прага → в същия прозорец тишина (без заливане)…
  assert.equal(alertDue({ count: 9, threshold: 3, rule: 't2', key: 'k', now: t0 + 10 * 60_000, windowMs: hour }), false);
  // …но в следващия прозорец алармата идва пак.
  assert.equal(alertDue({ count: 9, threshold: 3, rule: 't2', key: 'k', now: t0 + hour + 1, windowMs: hour }), true);
});

test('скок покрай прага (19 → 21 при паралелни заявки) не изпуска алармата', () => {
  const t0 = Date.UTC(2026, 10, 21, 14);
  assert.equal(alertDue({ count: 21, threshold: 20, rule: 't3', key: 'x', now: t0 }), true);
});

test('общ таван на правило: въртене на ключове не залива пощата', () => {
  const t0 = Date.UTC(2026, 10, 21, 15);
  let sent = 0;
  for (let i = 0; i < 50; i += 1) {
    if (alertDue({ count: 99, threshold: 1, rule: 't4', key: `acc${i}`, now: t0 + i })) sent += 1;
  }
  assert.equal(sent, ALERT_RULE_CAP_PER_HOUR);
});

test('ключовете на алармите не се изхвърлят от лимитера', () => {
  assert.equal(isCriticalKey('alert:t1:a'), true);
  assert.equal(isCriticalKey('alert:t1:global'), true);
});

test('общ бюджет за правилата, които външен човек задейства: сумата по всички ≤ бюджета (Стражата B1)', () => {
  // 4 правила × много ключове × 24 часа — най-лошият случай за квотата на Brevo.
  const day0 = Date.UTC(2026, 10, 25, 0);
  const rules = ['o-wave', 'o-slow', 'o-spray', 'o-webhook'];
  let perDay = 0;
  const perHour = new Map<number, number>();
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    for (const rule of rules) {
      for (let k = 0; k < 3; k += 1) {
        const now = day0 + minute * 60_000 + k;
        if (alertDue({ count: 999, threshold: 1, rule, key: `${minute}-${k}`, now, outsider: true })) {
          perDay += 1;
          const hour = Math.floor(minute / 60);
          perHour.set(hour, (perHour.get(hour) ?? 0) + 1);
        }
      }
    }
  }
  assert.ok(perDay <= OUTSIDER_ALERTS_PER_DAY, `${perDay} > ${OUTSIDER_ALERTS_PER_DAY}`);
  assert.ok(Math.max(...perHour.values()) <= OUTSIDER_ALERTS_PER_HOUR);
  assert.ok(perDay > 0);
});

test('админ алармите (вход, 2FA, step-up) са извън бюджета на външните', () => {
  const t0 = Date.UTC(2026, 10, 26, 0);
  // Бюджетът на външните е изчерпан…
  for (let i = 0; i < 50; i += 1) alertDue({ count: 9, threshold: 1, rule: `o${i}`, key: 'k', now: t0 + i, outsider: true });
  // …а алармата за грешен 2FA код в админ акаунт пак тръгва.
  assert.equal(alertDue({ count: 1, threshold: 1, rule: 'admin-mfa-failed-t', key: 'admin1', now: t0 + 100 }), true);
});

test('последната аларма от бюджета на външните е разпознаваема (бележка „изчерпан“)', () => {
  const t0 = Date.UTC(2026, 10, 27, 0);
  assert.equal(outsiderBudgetExhausted(t0), false);
  let sent = 0;
  let last = t0;
  for (let i = 0; i < 200 && sent < OUTSIDER_ALERTS_PER_DAY; i += 1) {
    const now = t0 + i * 31 * 60_000;
    if (alertDue({ count: 9, threshold: 1, rule: `ex${i % 4}`, key: `k${i}`, now, outsider: true })) {
      sent += 1;
      last = now;
    }
  }
  assert.equal(sent, OUTSIDER_ALERTS_PER_DAY);
  // Веднага след последната — бюджетът е изчерпан (бележката влиза в това писмо).
  assert.equal(outsiderBudgetExhausted(last), true);
});
