import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { verifyRevolutSignature } from '../src/billing/revolut.js';

const secret = 'wsk_test_secret';
const body = Buffer.from('{"event":"ORDER_COMPLETED","order_id":"abc"}');
const now = 1_794_500_000_000;
const ts = String(now);
const sign = (key: string, t: string) =>
  `v1=${createHmac('sha256', key).update(`v1.${t}.${body.toString()}`).digest('hex')}`;

test('валиден подпис минава; при смяна на тайната — който и да е от двата', () => {
  assert.ok(
    verifyRevolutSignature({
      secret,
      timestamp: ts,
      signature: sign(secret, ts),
      rawBody: body,
      now,
    }),
  );
  const rotated = `${sign('wsk_old', ts)},${sign(secret, ts)}`;
  assert.ok(
    verifyRevolutSignature({ secret, timestamp: ts, signature: rotated, rawBody: body, now }),
  );
});

test('чужд ключ, подменено тяло, старо клеймо или липса — отказ', () => {
  assert.equal(
    verifyRevolutSignature({
      secret,
      timestamp: ts,
      signature: sign('wsk_x', ts),
      rawBody: body,
      now,
    }),
    false,
  );
  assert.equal(
    verifyRevolutSignature({
      secret,
      timestamp: ts,
      signature: sign(secret, ts),
      rawBody: Buffer.from('{"event":"ORDER_COMPLETED","order_id":"zzz"}'),
      now,
    }),
    false,
  );
  const old = String(now - 6 * 60 * 1000);
  assert.equal(
    verifyRevolutSignature({
      secret,
      timestamp: old,
      signature: sign(secret, old),
      rawBody: body,
      now,
    }),
    false,
  );
  assert.equal(
    verifyRevolutSignature({
      secret,
      timestamp: undefined,
      signature: undefined,
      rawBody: body,
      now,
    }),
    false,
  );
  assert.equal(
    verifyRevolutSignature({
      secret: '',
      timestamp: ts,
      signature: sign('', ts),
      rawBody: body,
      now,
    }),
    false,
  );
});

test('клеймо в секунди (единицата не е потвърдена от първоизточник) — същата проверка и срок', () => {
  const seconds = String(Math.floor(now / 1000));
  assert.ok(
    verifyRevolutSignature({
      secret,
      timestamp: seconds,
      signature: sign(secret, seconds),
      rawBody: body,
      now,
    }),
  );
  const stale = String(Math.floor(now / 1000) - 6 * 60);
  assert.equal(
    verifyRevolutSignature({
      secret,
      timestamp: stale,
      signature: sign(secret, stale),
      rawBody: body,
      now,
    }),
    false,
  );
  assert.equal(
    verifyRevolutSignature({
      secret,
      timestamp: '12345',
      signature: sign(secret, '12345'),
      rawBody: body,
      now,
    }),
    false,
  );
});
