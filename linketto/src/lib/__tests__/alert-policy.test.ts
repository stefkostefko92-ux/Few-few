import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertDue, ALERT_RULE_CAP_PER_HOUR } from '../alert-policy';
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
