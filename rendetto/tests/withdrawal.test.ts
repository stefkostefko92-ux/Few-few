import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isBgWorkingDay,
  orthodoxEaster,
  sofiaDay,
  sofiaEndOfDay,
} from '../src/plans/bg-calendar.js';
import {
  canWithdraw,
  paidStartAllowedFrom,
  refundDeadline,
  withdrawalLastDay,
  withdrawalOpenUntil,
} from '../src/plans/withdrawal.js';

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

test('Orthodox Easter falls on the known dates', () => {
  assert.equal(orthodoxEaster(2024), day('2024-05-05'));
  assert.equal(orthodoxEaster(2025), day('2025-04-20'));
  assert.equal(orthodoxEaster(2026), day('2026-04-12'));
  assert.equal(orthodoxEaster(2027), day('2027-05-02'));
});

test('Bulgarian non-working days: holidays, Easter and the days moved off a weekend', () => {
  const off = [
    '2026-01-01',
    '2026-03-03',
    '2026-04-10', // Велики петък
    '2026-04-11',
    '2026-04-12',
    '2026-04-13', // понеделник след Великден
    '2026-05-01',
    '2026-05-06',
    '2026-05-25', // 24 май е в неделя
    '2026-09-07', // 6 септември е в неделя
    '2026-09-22',
    '2026-12-24',
    '2026-12-25',
    '2026-12-28', // 26 декември е в събота
    '2022-12-27', // 24 и 25 декември 2022 са в събота и неделя
    '2022-12-28',
    '2023-01-02', // 1 януари 2023 е в неделя
  ];
  for (const date of off) assert.equal(isBgWorkingDay(day(date)), false, date);
  for (const date of ['2026-04-14', '2026-05-26', '2026-12-29', '2022-12-29', '2026-10-05'])
    assert.equal(isBgWorkingDay(day(date)), true, date);
});

test('the day is taken by the Sofia calendar', () => {
  assert.equal(sofiaDay(new Date('2026-10-05T21:30:00Z')), day('2026-10-06'));
  assert.equal(sofiaDay(new Date('2026-01-15T21:59:00Z')), day('2026-01-15'));
});

test('the end of a chosen day is 23:59:59.999 in Sofia, summer and winter; a non-existent date is refused', () => {
  const end = (date: string) => sofiaEndOfDay(date)?.toISOString() ?? null;
  assert.equal(end('2026-12-31'), '2026-12-31T21:59:59.999Z');
  assert.equal(end('2026-07-31'), '2026-07-31T20:59:59.999Z');
  // денят на смяната на часа: лятното време е в сила в края на 28 март, зимното — в края на 25 октомври
  assert.equal(end('2027-03-28'), '2027-03-28T20:59:59.999Z');
  assert.equal(end('2026-10-25'), '2026-10-25T21:59:59.999Z');
  for (const date of ['2026-12-31', '2026-07-31', '2027-03-28', '2026-10-25'])
    assert.equal(sofiaDay(sofiaEndOfDay(date)!), day(date), date);
  for (const date of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-04-31', 'не е дата'])
    assert.equal(sofiaEndOfDay(date), null, date);
  assert.equal(end('2028-02-29'), '2028-02-29T21:59:59.999Z');
});

test('the period ends 14 days after the day of the contract, moved past non-working days', () => {
  // 3 октомври 2026 (събота) + 14 = 17 октомври (събота) → понеделник 19 октомври
  assert.equal(iso(withdrawalLastDay(new Date('2026-10-03T10:00:00Z'))), '2026-10-19');
  // 21:30 UTC на 5 октомври е вече 6 октомври по София → 20 октомври (вторник)
  assert.equal(iso(withdrawalLastDay(new Date('2026-10-05T21:30:00Z'))), '2026-10-20');
  // 10 декември + 14 = 24 декември → 24, 25, 26 (събота), 27, 28 (преместен) → 29 декември
  assert.equal(iso(withdrawalLastDay(new Date('2026-12-10T09:00:00Z'))), '2026-12-29');
});

test('the function stays open to the end of the last day in every EU time zone', () => {
  const at = new Date('2026-10-05T10:00:00Z');
  assert.equal(withdrawalOpenUntil(at).toISOString(), '2026-10-20T04:00:00.000Z');
});

test('the refund deadline counts calendar days by Sofia, also across the clock change', () => {
  // 23:30 по София на 15 март 2027; 14 × 24 часа през смяната на часа (28 март) биха дали 30 март
  assert.equal(iso(refundDeadline(new Date('2027-03-15T21:30:00Z'))), '2027-03-29');
  // 21:30 UTC на 5 октомври е вече 6 октомври по София — срокът тече от него
  assert.equal(iso(refundDeadline(new Date('2026-10-05T21:30:00Z'))), '2026-10-20');
  // не се мести за неработни дни: 10 декември + 14 = 24 декември
  assert.equal(iso(refundDeadline(new Date('2026-12-10T09:00:00Z'))), '2026-12-24');
});

test('who may withdraw and when the paid period may start', () => {
  const createdAt = new Date('2026-10-05T10:00:00Z');
  const order = {
    buyerType: 'CONSUMER' as const,
    status: 'OPEN' as const,
    createdAt,
    earlyStartRequestedAt: null,
    withdrawnAt: null,
    termsVersion: '2026-10-03',
  };
  assert.equal(canWithdraw(order, new Date('2026-10-19T20:00:00Z')), true);
  assert.equal(canWithdraw(order, new Date('2026-10-20T04:00:00Z')), false);
  assert.equal(canWithdraw({ ...order, status: 'DONE' }, createdAt), true);
  assert.equal(canWithdraw({ ...order, buyerType: 'BUSINESS' }, createdAt), false);
  assert.equal(canWithdraw({ ...order, status: 'CANCELLED' }, createdAt), false);
  assert.equal(canWithdraw({ ...order, withdrawnAt: createdAt }, createdAt), false);
  assert.equal(paidStartAllowedFrom(order).toISOString(), '2026-10-20T04:00:00.000Z');
  assert.equal(paidStartAllowedFrom({ ...order, earlyStartRequestedAt: createdAt }), createdAt);
  assert.equal(paidStartAllowedFrom({ ...order, buyerType: 'BUSINESS' }), createdAt);
  // заявка отпреди поръчките: не е договор по тези правила — без бутон за отказ и без изчакване
  assert.equal(canWithdraw({ ...order, termsVersion: null }, createdAt), false);
  assert.equal(paidStartAllowedFrom({ ...order, termsVersion: null }), createdAt);
});
