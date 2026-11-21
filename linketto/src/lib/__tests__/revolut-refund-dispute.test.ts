// F1/F2 (проходът по Revolut Merchant API, 2026-11-17): отказан refund и
// споровете. Фикстурите са дословно примерите от спецификацията
// (developer.revolut.com/docs/api/merchant.yaml, info.version 2026-09-22):
// Res-Refund-Declined, Res-Refund-Failed, Res-Refund-Min, Res-Dispute-Card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { disputeOutcome, isTransientRevolutError, refundOutcome, webhookEvent } from '../revolut-core';

const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'));

test('F1: refund 200 с отказано плащане (Res-Refund-Declined) е неуспешен, въпреки order state processing', () => {
  const declined = fixture('revolut-refund-declined');
  assert.equal(declined.state, 'processing');
  assert.deepEqual(refundOutcome(declined), {
    id: '6852ea10-3a1b-4c5d-8e9f-0a1b2c3d4e5f',
    state: 'failed',
    declineReason: 'suspected_fraud',
  });
});

test('F1: refund с неуспешно плащане (Res-Refund-Failed) е неуспешен', () => {
  assert.deepEqual(refundOutcome(fixture('revolut-refund-failed')), {
    id: '6852eb20-1c2d-3e4f-5a6b-7c8d9e0f1a2b',
    state: 'failed',
    declineReason: 'technical_error',
  });
});

test('F1: поръчка failed/cancelled → неуспешен; completed → върнат', () => {
  assert.equal(refundOutcome({ id: 'r1', state: 'failed' }).state, 'failed');
  assert.equal(refundOutcome({ id: 'r1', state: 'cancelled' }).state, 'failed');
  assert.equal(refundOutcome({ id: 'r1', state: 'completed', payments: [{ state: 'completed' }] }).state, 'completed');
});

test('F1: refund в ход (Res-Refund-Min: refund_validated) и без плащания остава в ход', () => {
  const inFlight = {
    id: '6852e9a6-5cf0-ac65-8182-6a9c251011ce',
    type: 'refund',
    state: 'processing',
    amount: 100,
    currency: 'GBP',
    payments: [{ id: 'p1', state: 'refund_validated' }],
  };
  assert.equal(refundOutcome(inFlight).state, 'pending');
  assert.equal(refundOutcome({ id: 'r1', state: 'processing' }).state, 'pending');
  assert.equal(refundOutcome({ id: 'r1', state: 'pending', payments: [] }).state, 'pending');
  // Отказан опит, последван от плащане в ход: още не е краен.
  assert.equal(
    refundOutcome({ id: 'r1', state: 'processing', payments: [{ state: 'declined' }, { state: 'refund_started' }] }).state,
    'pending',
  );
  assert.equal(refundOutcome(null).state, 'pending');
  assert.equal(refundOutcome(null).id, null);
});

test('F2: уебхук за спор носи само dispute_id → вид dispute', () => {
  assert.deepEqual(webhookEvent({ event: 'DISPUTE_ACTION_REQUIRED', dispute_id: 'ab934829-e4ba-4e7f-8a21-365cad85c763' }), {
    kind: 'dispute',
    disputeId: 'ab934829-e4ba-4e7f-8a21-365cad85c763',
  });
  for (const event of ['DISPUTE_UNDER_REVIEW', 'DISPUTE_WON', 'DISPUTE_LOST']) {
    assert.equal(webhookEvent({ event, dispute_id: 'd-1' })?.kind, 'dispute');
  }
  assert.deepEqual(webhookEvent({ event: 'ORDER_COMPLETED', order_id: 'o-1' }), { kind: 'order', orderId: 'o-1' });
  assert.deepEqual(webhookEvent({ event: 'ORDER_PAYMENT_DECLINED', order_id: 'o-1' }), { kind: 'order', orderId: 'o-1' });
  // Непознато събитие, липсващо или подозрително id → игнорира се.
  assert.equal(webhookEvent({ event: 'PAYOUT_COMPLETED', payout_id: 'p' }), null);
  assert.equal(webhookEvent({ event: 'DISPUTE_WON' }), null);
  assert.equal(webhookEvent({ event: 'DISPUTE_WON', dispute_id: '../orders/x' }), null);
  assert.equal(webhookEvent({ event: 'DISPUTE_WON', dispute_id: 'x'.repeat(101) }), null);
  assert.equal(webhookEvent({ event: 'ORDER_COMPLETED', order_id: 42 }), null);
  assert.equal(webhookEvent(null), null);
});

test('F2: спорът от GET /api/disputes/{id} (Res-Dispute-Card) — без лични данни', () => {
  const d = disputeOutcome(fixture('revolut-dispute-card'));
  assert.deepEqual(d, {
    id: 'fccc53e9-00e0-4847-9d54-6938e9cdd3ef',
    state: 'lost',
    substate: 'lost_accepted',
    reasonCode: '50',
    reason: 'Fraud',
    amountCents: 1500,
    currency: 'EUR',
    responseDueAt: new Date('2025-03-15T12:00:00.000Z'),
    revolutOrderId: '38bd1186-a276-4b14-91b4-5da886481f85',
  });
});

test('F2: спор с непознато състояние, без сума или без id не се приема (външни данни)', () => {
  const base = fixture('revolut-dispute-card');
  assert.equal(disputeOutcome({ ...base, state: 'warning_closed' }), null);
  assert.equal(disputeOutcome({ ...base, amount: '1500' }), null);
  assert.equal(disputeOutcome({ ...base, id: undefined }), null);
  assert.equal(disputeOutcome({ ...base, currency: 'EURO' }), null);
  assert.equal(disputeOutcome(null), null);
  // Невалидна дата и управляващи знаци в причината не минават.
  const odd = disputeOutcome({ ...base, response_due_date: 'утре', reason_description: 'a\u0000b\nc', payment: undefined });
  assert.equal(odd?.responseDueAt, null);
  assert.equal(odd?.reason, 'a b c');
  assert.equal(odd?.revolutOrderId, null);
});

test('Временна грешка: мрежа, 409 (същият ключ още се обработва), 429, 5XX; изричен 4XX — не', () => {
  const http = (status: number) => Object.assign(new Error(String(status)), { status });
  for (const status of [409, 429, 500, 502, 503, 504]) assert.equal(isTransientRevolutError(http(status)), true, String(status));
  for (const status of [400, 401, 403, 404, 422]) assert.equal(isTransientRevolutError(http(status)), false, String(status));
  assert.equal(isTransientRevolutError(new Error('fetch failed')), true);
});

test('refundAmountMatches: частичното връщане се сверява по сума и валута (abuse-money-spec Б4)', async () => {
  const { refundAmountMatches } = await import('../revolut-core');
  assert.equal(refundAmountMatches({ type: 'refund', amount: 271, currency: 'EUR' }, 271), true);
  assert.equal(refundAmountMatches({ type: 'refund', amount: 400, currency: 'EUR' }, 271), false);
  assert.equal(refundAmountMatches({ type: 'refund', amount: 271, currency: 'USD' }, 271), false);
  assert.equal(refundAmountMatches({ type: 'payment', amount: 271, currency: 'EUR' }, 271), false);
  // Без поле за сума (напр. кратък отговор) — не блокира; сверката е по това, което има.
  assert.equal(refundAmountMatches({ state: 'completed' }, 271), true);
});
