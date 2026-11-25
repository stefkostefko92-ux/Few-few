import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyEmail,
  emailDomain,
  marketOfPhone,
  normalizeEmail,
  normalizePhone,
  phoneKind,
} from '../src/compliance/normalize.js';

test('normalizeEmail: малки букви, без интервали; невалиден → null', () => {
  assert.equal(normalizeEmail('  Info@Firma.BG '), 'info@firma.bg');
  assert.equal(normalizeEmail('без-маймунка.bg'), null);
  assert.equal(normalizeEmail('a@b'), null);
  assert.equal(normalizeEmail('a b@firma.bg'), null);
});

test('emailDomain връща домейна', () => {
  assert.equal(emailDomain('mario.rossi@ditta.it'), 'ditta.it');
});

test('classifyEmail: общ, именуван, личен', () => {
  assert.equal(classifyEmail('info@firma.bg'), 'generic');
  assert.equal(classifyEmail('office@firma.bg'), 'generic');
  assert.equal(classifyEmail('amministrazione@ditta.it'), 'generic');
  assert.equal(classifyEmail('ivan.petrov@firma.bg'), 'named');
  assert.equal(classifyEmail('firma@abv.bg'), 'personal');
  assert.equal(classifyEmail('ditta@gmail.com'), 'personal');
  assert.equal(classifyEmail('ufficio@libero.it'), 'personal');
});

test('normalizePhone: БГ национален формат → E.164', () => {
  assert.equal(normalizePhone('02 987 65 43', 'BG'), '+35929876543');
  assert.equal(normalizePhone('0888 123 456', 'BG'), '+359888123456');
  assert.equal(normalizePhone('00359 888 123 456', 'BG'), '+359888123456');
});

test('normalizePhone: ИТ формат запазва водещата 0 на стационарните', () => {
  assert.equal(normalizePhone('02 1234 5678', 'IT'), '+390212345678');
  assert.equal(normalizePhone('347 123 4567', 'IT'), '+393471234567');
  assert.equal(normalizePhone('+39 06 1234567', 'BG'), '+39061234567');
});

test('normalizePhone: боклук → null', () => {
  assert.equal(normalizePhone('обади се', 'BG'), null);
  assert.equal(normalizePhone('12', 'IT'), null);
});

test('marketOfPhone по кода на страната', () => {
  assert.equal(marketOfPhone('+359888123456'), 'BG');
  assert.equal(marketOfPhone('+390212345678'), 'IT');
  assert.equal(marketOfPhone('+4930123456'), null);
});

test('phoneKind: мобилен, стационарен, неясен', () => {
  assert.equal(phoneKind('+359888123456'), 'mobile');
  assert.equal(phoneKind('+35929876543'), 'landline');
  assert.equal(phoneKind('+393471234567'), 'mobile');
  assert.equal(phoneKind('+390212345678'), 'landline');
  assert.equal(phoneKind('+35970012345'), 'unknown');
});
