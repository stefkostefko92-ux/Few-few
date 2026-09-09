import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePlate, normalizePlate, isValidPlate, maskPlate } from '../plate';
import { hashPlate } from '../plate-hash';

test('normalizePlate маха интервали/тирета и вдига главни', () => {
  assert.equal(normalizePlate(' ab 123-cd '), 'AB123CD');
  assert.equal(normalizePlate('ab.123.cd'), 'AB123CD');
});

test('parsePlate: автомобил AA000AA', () => {
  const p = parsePlate('ab 123 cd');
  assert.ok(p);
  assert.equal(p.kind, 'AUTO');
  assert.equal(p.normalized, 'AB123CD');
  assert.equal(p.display, 'AB 123 CD');
});

test('parsePlate: отхвърля забранените букви I O Q U', () => {
  assert.equal(parsePlate('AI123CD'), null);
  assert.equal(parsePlate('AB123CO'), null);
  assert.equal(parsePlate('QB123CD'), null);
  assert.equal(parsePlate('AB123UD'), null);
});

test('parsePlate: мотоциклет AA00000 и ремарке XA000AA', () => {
  assert.equal(parsePlate('FX 12345')?.kind, 'MOTO');
  assert.equal(parsePlate('XA 123 BC')?.kind, 'RIMORCHIO');
});

test('parsePlate: стар формат провинция+число е LEGACY', () => {
  assert.equal(parsePlate('MI 123456')?.kind, 'LEGACY');
});

test('isValidPlate: боклук е невалиден', () => {
  assert.equal(isValidPlate(''), false);
  assert.equal(isValidPlate('ABC'), false);
  assert.equal(isValidPlate('1234567'), false);
  assert.equal(isValidPlate('AB123CDE9'), false);
});

test('hashPlate: детерминистичен, зависи от pepper, отказва слаб pepper', () => {
  const a = hashPlate('AB123CD', 'x'.repeat(32));
  const b = hashPlate('AB123CD', 'x'.repeat(32));
  const c = hashPlate('AB123CD', 'y'.repeat(32));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.length, 64);
  assert.throws(() => hashPlate('AB123CD', 'short'));
});

test('maskPlate: показва само първите 3 знака', () => {
  assert.equal(maskPlate('AB123CD'), 'AB1••••');
  assert.equal(maskPlate('???'), '•••');
});
