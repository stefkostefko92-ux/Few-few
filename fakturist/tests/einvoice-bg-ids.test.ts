import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidBgVat, isValidEik, normalizeVat } from '../src/einvoice/bg-ids.js';

test('реални ЕИК минават контролната цифра', () => {
  assert.ok(isValidEik('208725180')); // Carbon Stealth VCC
  assert.ok(isValidEik('131063188')); // НАП
});

test('сгрешена цифра или дължина се хваща', () => {
  assert.equal(isValidEik('208725181'), false);
  assert.equal(isValidEik('131063187'), false);
  assert.equal(isValidEik('12345678'), false);
  assert.equal(isValidEik('20872518A'), false);
});

test('13-цифрен код: проверяват се първите 9', () => {
  assert.ok(isValidEik('2087251800001'));
  assert.equal(isValidEik('2087251810001'), false);
});

test('ДДС номер: BG + ЕИК или 10 цифри', () => {
  assert.ok(isValidBgVat('BG208725180'));
  assert.ok(isValidBgVat('BG7501010010'));
  assert.equal(isValidBgVat('BG208725181'), false);
  assert.equal(isValidBgVat('208725180'), false);
  assert.equal(normalizeVat(' bg 208-725.180 '), 'BG208725180');
});
