import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crossingTime,
  dueRuleIds,
  inWindow,
  isDue,
  minutesOfDay,
  pairKey,
  planAlerts,
  repeatDue,
  type BatchLike,
  type RuleLike,
} from '../src/domain/alerts.js';
import { HOUR_MS } from '../src/domain/decay.js';

const t0 = new Date('2026-11-03T10:00:00Z');
const at = (h: number) => new Date(t0.getTime() + h * HOUR_MS);
const rate = { decayPercent: 0.6, decayMinutes: 60 };

function batch(id: number, percent: number, seedTypeKey = 'amnesia'): BatchLike {
  return { id, seedTypeKey, count: 5, percent, anchoredAt: t0, rate };
}

function rule(id: number, over: Partial<RuleLike> = {}): RuleLike {
  return {
    id,
    kind: 'PERCENT',
    threshold: 20,
    seedTypeKey: null,
    channelId: '111111111111111111',
    roleId: '222222222222222222',
    enabled: true,
    repeatMinutes: null,
    message: null,
    ...over,
  };
}

test('праг в %: минава се, когато процентът стигне прага', () => {
  const b = batch(1, 26);
  const r = rule(1, { threshold: 20 });
  // 26 → 20 = 6% = 10 ч
  assert.equal(crossingTime(r, b).getTime(), at(10).getTime());
  assert.equal(isDue(r, b, at(9.99)), false);
  assert.equal(isDue(r, b, at(10)), true);
});

test('оставащо време: минава се X часа преди 0%', () => {
  const b = batch(1, 12); // изтича след 20 ч
  const r = rule(1, { kind: 'HOURS_LEFT', threshold: 3 });
  assert.equal(crossingTime(r, b).getTime(), at(17).getTime());
  assert.equal(isDue(r, b, at(16.9)), false);
  assert.equal(isDue(r, b, at(17)), true);
});

test('партида, въведена вече под прага, е дължима веднага', () => {
  assert.equal(isDue(rule(1, { threshold: 20 }), batch(1, 15), t0), true);
  assert.equal(isDue(rule(1, { threshold: 20 }), batch(1, 20), t0), true);
  assert.equal(isDue(rule(1, { kind: 'HOURS_LEFT', threshold: 48 }), batch(1, 6), t0), true);
});

test('правило за друг вид или изключено не важи', () => {
  const b = batch(1, 5, 'ak');
  assert.equal(isDue(rule(1, { seedTypeKey: 'amnesia' }), b, t0), false);
  assert.equal(isDue(rule(1, { seedTypeKey: 'ak' }), b, t0), true);
  assert.equal(isDue(rule(1, { enabled: false }), b, t0), false);
});

test('праг 0% = в момента на изтичане', () => {
  const b = batch(1, 1.2); // изтича след 2 ч
  assert.equal(crossingTime(rule(1, { threshold: 0 }), b).getTime(), at(2).getTime());
});

test('dueRuleIds връща само минатите', () => {
  const rules = [
    rule(1, { threshold: 50 }),
    rule(2, { threshold: 20 }),
    rule(3, { threshold: 10 }),
  ];
  assert.deepEqual(dueRuleIds(batch(1, 30), rules, t0), [1]);
  assert.deepEqual(dueRuleIds(batch(1, 30), rules, at(17)), [1, 2]);
});

test('минути от деня в часовата зона', () => {
  // 10:00 UTC = 12:00 в София (EET, UTC+2 през ноември)
  assert.equal(minutesOfDay(t0, 'Europe/Sofia'), 12 * 60);
  assert.equal(minutesOfDay(t0, 'UTC'), 10 * 60);
});

test('часови прозорец: нормален, през полунощ, изключен, цял ден', () => {
  const sofia = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    // София = UTC+2 през ноември
    return new Date(Date.UTC(2026, 10, 3, h - 2, m));
  };
  const day = {
    quietEnabled: true,
    windowStart: '10:00',
    windowEnd: '23:00',
    timezone: 'Europe/Sofia',
  };
  assert.equal(inWindow(sofia('09:59'), day), false);
  assert.equal(inWindow(sofia('10:00'), day), true);
  assert.equal(inWindow(sofia('22:59'), day), true);
  assert.equal(inWindow(sofia('23:00'), day), false);

  const night = { ...day, windowStart: '22:00', windowEnd: '02:00' };
  assert.equal(inWindow(sofia('23:30'), night), true);
  assert.equal(inWindow(sofia('01:59'), night), true);
  assert.equal(inWindow(sofia('02:00'), night), false);
  assert.equal(inWindow(sofia('12:00'), night), false);

  assert.equal(inWindow(sofia('03:00'), { ...day, quietEnabled: false }), true);
  assert.equal(
    inWindow(sofia('03:00'), { ...day, windowStart: '00:00', windowEnd: '00:00' }),
    true,
  );
});

test('planAlerts групира по канал и роля и пропуска вече известените', () => {
  const rules = [
    rule(1, { threshold: 20 }),
    rule(2, { threshold: 10, roleId: '333333333333333333' }),
    rule(3, { threshold: 50, enabled: false }),
  ];
  const batches = [batch(1, 15), batch(2, 8), batch(3, 90)];
  const notified = new Map([[pairKey(1, 1), t0]]);
  const groups = planAlerts(batches, rules, notified, t0);
  assert.equal(groups.length, 2);
  const g1 = groups.find((g) => g.roleId === '222222222222222222');
  const g2 = groups.find((g) => g.roleId === '333333333333333333');
  assert.deepEqual(
    g1?.items.map((i) => [i.batch.id, i.rule.id]),
    [[2, 1]],
  );
  assert.deepEqual(
    g2?.items.map((i) => [i.batch.id, i.rule.id]),
    [[2, 2]],
  );
});

test('planAlerts без нищо дължимо връща празно', () => {
  assert.deepEqual(planAlerts([batch(1, 90)], [rule(1)], new Map(), t0), []);
});

test('повторение: тагва отново след интервала, само докато е под прага', () => {
  const r = rule(1, { threshold: 20, repeatMinutes: 60 });
  const b = batch(1, 15);
  assert.equal(repeatDue(r, t0, at(0.99)), false);
  assert.equal(repeatDue(r, t0, at(1)), true);
  assert.equal(repeatDue(rule(1, { repeatMinutes: null }), t0, at(100)), false);
  const sent = new Map([[pairKey(1, 1), t0]]);
  assert.equal(planAlerts([b], [r], sent, at(0.5)).length, 0);
  assert.equal(planAlerts([b], [r], sent, at(1)).length, 1);
  // над прага повторение няма
  assert.equal(planAlerts([batch(1, 90)], [r], sent, at(5)).length, 0);
});

test('съобщението по избор е част от групата: различни текстове — различни съобщения', () => {
  const rules = [
    rule(1, { threshold: 20, message: 'Освежете семките!' }),
    rule(2, { threshold: 30, message: null }),
  ];
  const groups = planAlerts([batch(1, 10)], rules, new Map(), t0);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.message).sort(), [null, 'Освежете семките!'].sort());
});
