// Тестове за споделения филтър „здравни възложители“ (SSN) — src/lib/enti-ssn.js.
// Регексите са ЗАМРАЗЕНИ: тук фиксираме кои имена матчват (launch данни).
// Виж CLAUDE.md „Капани": INMP остава здравен; INPS/INAIL/previdenza се изключват.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEALTH, NOT_HEALTH, eEnteSanitario } from '../src/lib/enti-ssn.js';

// Известни SSN възложители → трябва да са здравни.
const SANITARI = [
  'ASL ROMA 1',
  'AZIENDA OSPEDALIERA SANT’ANDREA',
  'AZIENDA OSPEDALIERO UNIVERSITARIA DI BOLOGNA',
  'FONDAZIONE IRCCS ISTITUTO NAZIONALE DEI TUMORI',
  'IRCCS OSPEDALE SAN RAFFAELE',
  'POLICLINICO UNIVERSITARIO A. GEMELLI',
  'A.S.S.T. GRANDE OSPEDALE METROPOLITANO NIGUARDA',
  'AZIENDA ULSS 3 SERENISSIMA',
  'ISTITUTO NAZIONALE PER LA PROMOZIONE DELLA SALUTE DELLE POPOLAZIONI MIGRANTI (INMP)',
];

// Нездравни субекти, случайно уловени от общи думи → трябва да се изключат.
const NON_SANITARI = [
  'ISTITUTO NAZIONALE DELLA PREVIDENZA SOCIALE', // INPS
  'INPS',
  'INAIL',
  'ISTITUTO NAZIONALE ASSICURAZIONE CONTRO GLI INFORTUNI SUL LAVORO',
  'ISTITUTO SUPERIORE DI SANITA', // ISS
  'MINISTERO DELLA SALUTE',
  'SPORT E SALUTE S.P.A.',
  'COMUNE DI MILANO',
];

test('eEnteSanitario: известните SSN имена матчват като здравни', () => {
  for (const nome of SANITARI) {
    assert.equal(eEnteSanitario(nome), true, `трябва здравен: ${nome}`);
  }
});

test('eEnteSanitario: нездравните субекти се изключват', () => {
  for (const nome of NON_SANITARI) {
    assert.equal(eEnteSanitario(nome), false, `трябва НЕ-здравен: ${nome}`);
  }
});

test('INMP остава здравен въпреки „ISTITUTO NAZIONALE" (мигрантско здраве)', () => {
  const inmp = 'ISTITUTO NAZIONALE PER LA PROMOZIONE DELLA SALUTE DELLE POPOLAZIONI MIGRANTI';
  assert.ok(HEALTH.test(inmp));
  assert.ok(!NOT_HEALTH.test(inmp));
  assert.equal(eEnteSanitario(inmp), true);
});

test('INPS/INAIL/previdenza: HEALTH ги хваща, но NOT_HEALTH ги отсява', () => {
  const inps = 'ISTITUTO NAZIONALE DELLA PREVIDENZA SOCIALE';
  assert.ok(HEALTH.test(inps), 'ISTITUTO NAZIONALE се лови от HEALTH');
  assert.ok(NOT_HEALTH.test(inps), 'PREVIDENZA го изключва');
  assert.equal(eEnteSanitario(inps), false);
  assert.equal(eEnteSanitario('INAIL'), false);
});

test('eEnteSanitario: приема и не-стрингове без хвърляне', () => {
  assert.equal(eEnteSanitario(null), false);
  assert.equal(eEnteSanitario(undefined), false);
  assert.equal(eEnteSanitario(''), false);
});
