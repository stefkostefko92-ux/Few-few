import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWithdraw, withdrawalAckEmail, withdrawalDeadline } from '../withdrawal';

// W (чл. 11а Дир. 2011/83, изм. с Дир. 2023/2673; ЗЗП): функцията „Откажи се от
// договора тук“ е налична през целия 14-дневен срок за всяка платена и приложена
// поръчка, веднъж; срокът тече от деня след плащането и изтича в края на 14-ия ден.

const paid = new Date('2026-11-14T15:30:00Z');

test('W1: срокът изтича в края на 14-ия ден след деня на плащането (UTC)', () => {
  assert.equal(withdrawalDeadline(paid).toISOString(), '2026-11-29T00:00:00.000Z');
});

test('W2: допустим отказ — платена, приложена, в срока, без предишно изявление', () => {
  const base = { state: 'completed', applied: true, completedAt: paid, withdrawalRequestedAt: null };
  assert.equal(canWithdraw({ ...base, now: new Date('2026-11-20T10:00:00Z') }), true);
  assert.equal(canWithdraw({ ...base, now: new Date('2026-11-28T23:59:59Z') }), true);
  assert.equal(canWithdraw({ ...base, now: new Date('2026-11-29T00:00:00Z') }), false);
});

test('W3: недопустим — вече поискан, неприложен, непълен или върнат', () => {
  const now = new Date('2026-11-20T10:00:00Z');
  assert.equal(canWithdraw({ state: 'completed', applied: true, completedAt: paid, withdrawalRequestedAt: now, now }), false);
  assert.equal(canWithdraw({ state: 'conflict', applied: false, completedAt: paid, withdrawalRequestedAt: null, now }), false);
  assert.equal(canWithdraw({ state: 'pending', applied: false, completedAt: null, withdrawalRequestedAt: null, now }), false);
  assert.equal(canWithdraw({ state: 'refund_pending', applied: true, completedAt: paid, withdrawalRequestedAt: null, now }), false);
  assert.equal(canWithdraw({ state: 'refunded', applied: true, completedAt: paid, withdrawalRequestedAt: null, now }), false);
});

test('W4: потвърждение на траен носител — съдържанието на изявлението с дата и час', () => {
  const { subject, html } = withdrawalAckEmail({
    locale: 'bg',
    name: 'Мария <b>',
    plan: 'PRO',
    interval: 'quarterly',
    amountCents: 1080,
    orderRef: 'ord_1',
    orderedAt: paid,
    requestedAt: new Date('2026-11-20T10:05:00Z'),
  });
  assert.match(subject, /отказ/i);
  assert.ok(html.includes('ord_1'));
  assert.ok(html.includes('Мария &lt;b&gt;'));
  assert.ok(!html.includes('Мария <b>'));
  assert.match(html, /€10\.80/);
  assert.match(html, /2026/);
  assert.match(html, /14 дни/);
  const en = withdrawalAckEmail({
    locale: 'fi',
    name: 'Ana',
    plan: 'FOUNDER',
    interval: 'lifetime',
    amountCents: 4900,
    orderRef: 'ord_2',
    orderedAt: paid,
    requestedAt: new Date('2026-11-20T10:05:00Z'),
  });
  assert.match(en.subject, /withdrawal/i);
  assert.match(en.html, /Founder/);
});
