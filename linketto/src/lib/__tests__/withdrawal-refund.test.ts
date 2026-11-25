import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withdrawalRefund } from '../withdrawal-refund';

// abuse-money-spec Б3/Б4 (решение на собственика: пропорционално, FOUNDER спрямо 365 дни).
const DAY = 24 * 60 * 60 * 1000;
const at = (iso: string) => new Date(iso);
const base = {
  amountCents: 400,
  vatCents: 67,
  plan: 'PRO',
  interval: 'monthly',
  prevPlan: 'FREE',
  prevExpiresAt: null,
  completedAt: at('2026-03-01T00:00:00Z'),
  immediateStartAt: at('2026-03-01T00:00:00Z'),
  applied: true,
};

test('без изрично искане за ранно начало → пълна сума (чл. 14(4)(а))', () => {
  const r = withdrawalRefund({ ...base, immediateStartAt: null, requestedAt: at('2026-03-10T00:00:00Z') });
  assert.deepEqual(r, { refundCents: 400, refundVatCents: 67, usedSec: 0 });
});

test('неприложена поръчка (conflict) → пълна сума — нищо не е предоставено', () => {
  const r = withdrawalRefund({ ...base, applied: false, requestedAt: at('2026-03-10T00:00:00Z') });
  assert.equal(r.refundCents, 400);
});

test('реалният месец: март = 31 дни; 10 дни → удръжка floor(400×10/31) = 129', () => {
  const r = withdrawalRefund({ ...base, requestedAt: at('2026-03-11T00:00:00Z') });
  assert.equal(r.usedSec, 10 * 86400);
  assert.equal(r.refundCents, 400 - Math.floor((400 * 10) / 31));
  // ДДС на върнатото: задържано + върнато = оригинала.
  assert.equal(r.refundVatCents, Math.round((67 * r.refundCents) / 400));
});

test('февруари (28 дни) — по-къс месец, по-голяма дневна част', () => {
  const r = withdrawalRefund({ ...base, completedAt: at('2026-02-01T00:00:00Z'), requestedAt: at('2026-02-08T00:00:00Z') });
  assert.equal(r.refundCents, 400 - Math.floor((400 * 7) / 28));
});

test('закръгляне в полза на потребителя (ползваното — надолу)', () => {
  const r = withdrawalRefund({ ...base, requestedAt: new Date(base.completedAt.getTime() + 1000) });
  assert.equal(r.refundCents, 400); // 1 секунда → 0 цента удръжка
});

test('удължаване на същия план: новият период започва от края на стария → 0 ползвано → пълна сума', () => {
  const r = withdrawalRefund({
    ...base,
    prevPlan: 'PRO',
    prevExpiresAt: at('2026-03-20T00:00:00Z'),
    requestedAt: at('2026-03-12T00:00:00Z'),
  });
  assert.deepEqual(r, { refundCents: 400, refundVatCents: 67, usedSec: 0 });
});

test('удължаване: отказ СЛЕД началото на новия период → удръжка само за времето след него', () => {
  const r = withdrawalRefund({
    ...base,
    prevPlan: 'PRO',
    prevExpiresAt: at('2026-03-05T00:00:00Z'),
    requestedAt: at('2026-03-08T00:00:00Z'),
  });
  assert.equal(r.usedSec, 3 * 86400);
  // период 05.03–05.04 = 31 дни
  assert.equal(r.refundCents, 400 - Math.floor((400 * 3) / 31));
});

test('по-висок план: удръжката е за новия план от плащането (старият се удължава отделно)', () => {
  const r = withdrawalRefund({
    ...base,
    plan: 'BUSINESS',
    amountCents: 900,
    vatCents: 150,
    prevPlan: 'PRO',
    prevExpiresAt: at('2026-06-01T00:00:00Z'),
    requestedAt: at('2026-03-06T00:00:00Z'),
  });
  assert.equal(r.usedSec, 5 * 86400);
  assert.equal(r.refundCents, 900 - Math.floor((900 * 5) / 31));
});

test('FOUNDER: спрямо 365 дни; 14 дни от €49 → удръжка floor(4900×14/365) = 187', () => {
  const r = withdrawalRefund({
    ...base,
    plan: 'FOUNDER',
    interval: 'lifetime',
    amountCents: 4900,
    vatCents: 817,
    requestedAt: new Date(base.completedAt.getTime() + 14 * DAY),
  });
  assert.equal(r.refundCents, 4900 - Math.floor((4900 * 14) / 365));
});

test('граници: преди началото → пълна; след целия период → 0 (никога отрицателно)', () => {
  assert.equal(withdrawalRefund({ ...base, requestedAt: at('2026-02-20T00:00:00Z') }).refundCents, 400);
  assert.equal(withdrawalRefund({ ...base, requestedAt: at('2026-05-01T00:00:00Z') }).refundCents, 0);
});
