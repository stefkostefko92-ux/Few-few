import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNew, type DisputeSnapshot } from '../src/billing/dispute-core.js';

/**
 * Кога спорът дава нов запис в одита и ново писмо до мастъра (src/billing/disputes.ts): ново състояние,
 * подсъстояние или срок — да; същото — не; непрочетен — веднъж за вид известие; по-старо от записаното (по
 * `updated_at` на Revolut) — никога.
 */
const read = (over: Partial<DisputeSnapshot> = {}): DisputeSnapshot => ({
  state: 'needs_response',
  substate: 'new',
  responseDueAt: '2026-12-01T10:00:00.000Z',
  updatedAt: '2026-11-17T07:00:00.000Z',
  amountCents: 1200,
  currency: 'EUR',
  reasonCode: '50',
  orderId: 'f2f2f2f2-0000-4000-8000-000000000001',
  ...over,
});
const unread: DisputeSnapshot = {
  state: 'unread',
  substate: null,
  responseDueAt: null,
  updatedAt: null,
  amountCents: null,
  currency: null,
  reasonCode: null,
  orderId: null,
};
const asRecord = (s: DisputeSnapshot, event = 'DISPUTE_ACTION_REQUIRED') => ({ event, ...s });

test('първи запис за спора — ново', () => {
  assert.equal(
    isNew({ last: null, lastRead: null, event: 'DISPUTE_ACTION_REQUIRED', snap: read() }),
    true,
  );
});

test('същото състояние, подсъстояние и срок — без ново писмо', () => {
  const last = asRecord(read());
  assert.equal(
    isNew({ last, lastRead: last, event: 'DISPUTE_ACTION_REQUIRED', snap: read() }),
    false,
  );
  // По-нов updated_at без промяна в нещо, което мастърът вижда — пак без писмо.
  assert.equal(
    isNew({
      last,
      lastRead: last,
      event: 'DISPUTE_ACTION_REQUIRED',
      snap: read({ updatedAt: '2026-11-17T08:00:00.000Z' }),
    }),
    false,
  );
});

test('същото състояние с нов срок или ново подсъстояние — ново писмо', () => {
  const last = asRecord(read());
  assert.equal(
    isNew({
      last,
      lastRead: last,
      event: 'DISPUTE_ACTION_REQUIRED',
      snap: read({
        responseDueAt: '2026-12-20T10:00:00.000Z',
        updatedAt: '2026-11-25T07:00:00.000Z',
      }),
    }),
    true,
  );
  assert.equal(
    isNew({
      last,
      lastRead: last,
      event: 'DISPUTE_ACTION_REQUIRED',
      snap: read({ substate: 'pre_arbitration', updatedAt: '2026-11-25T07:00:00.000Z' }),
    }),
    true,
  );
});

test('по-старо състояние след по-ново (по updated_at на Revolut) — не се записва', () => {
  const last = asRecord(read({ state: 'lost', updatedAt: '2026-11-20T07:00:00.000Z' }));
  assert.equal(
    isNew({
      last,
      lastRead: last,
      event: 'DISPUTE_ACTION_REQUIRED',
      snap: read({ state: 'under_review', updatedAt: '2026-11-19T07:00:00.000Z' }),
    }),
    false,
  );
});

test('непрочетен: пропуска се само ако ПОСЛЕДНИЯТ запис е от същото известие', () => {
  assert.equal(
    isNew({ last: null, lastRead: null, event: 'DISPUTE_ACTION_REQUIRED', snap: unread }),
    true,
  );
  const prior = asRecord(read());
  assert.equal(
    isNew({ last: prior, lastRead: prior, event: 'DISPUTE_ACTION_REQUIRED', snap: unread }),
    false,
    'повторна доставка на прочетеното известие — „не се прочете“ би било невярно',
  );
  const unreadBefore = asRecord(unread, 'DISPUTE_ACTION_REQUIRED');
  assert.equal(
    isNew({ last: unreadBefore, lastRead: null, event: 'DISPUTE_ACTION_REQUIRED', snap: unread }),
    false,
    'второто „не се прочете“ от същото известие не праща второ писмо',
  );
  assert.equal(isNew({ last: prior, lastRead: prior, event: 'DISPUTE_LOST', snap: unread }), true);
});

test('needs_response → under_review → непрочетено DISPUTE_ACTION_REQUIRED (нов кръг) → записва се', () => {
  // По-стар запис от DISPUTE_ACTION_REQUIRED има, но последният е от DISPUTE_UNDER_REVIEW.
  const lastRead = asRecord(
    read({ state: 'under_review', updatedAt: '2026-11-18T07:00:00.000Z' }),
    'DISPUTE_UNDER_REVIEW',
  );
  assert.equal(
    isNew({ last: lastRead, lastRead, event: 'DISPUTE_ACTION_REQUIRED', snap: unread }),
    true,
  );
});

test('прочетен след „не се прочете“ — ново (мастърът получава подробностите)', () => {
  const lastUnread = asRecord(unread);
  assert.equal(
    isNew({ last: lastUnread, lastRead: null, event: 'DISPUTE_ACTION_REQUIRED', snap: read() }),
    true,
  );
  const lastRead = asRecord(read());
  assert.equal(
    isNew({
      last: asRecord(unread, 'DISPUTE_LOST'),
      lastRead,
      event: 'DISPUTE_ACTION_REQUIRED',
      snap: read(),
    }),
    true,
  );
});
