import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coreTokens, normReg, matchAutoritaEnti } from '../src/lib/match.js';

test('coreTokens — маха типовата фраза, пази отличителното', () => {
  const t = coreTokens('AZIENDA SANITARIA LOCALE TO3');
  assert.ok(t.has('TO3'));
  assert.ok(!t.has('AZIENDA'));
  assert.ok(!t.has('SANITARIA'));
});

test('coreTokens — събира „код + число“ (TO 1 → TO1)', () => {
  assert.ok(coreTokens('AZIENDA SANITARIA LOCALE TO 1').has('TO1'));
  assert.ok(coreTokens('ASL ROMA 1').has('ROMA1') || coreTokens('ASL ROMA 1').has('ROMA'));
});

test('normReg — каноничен ключ на регион', () => {
  assert.equal(normReg('Piemonte'), normReg('SEZIONE REGIONALE PIEMONTE'));
  assert.equal(normReg('P.A. Bolzano').length > 0, true);
});

test('matchAutoritaEnti — коректно съвпадение', () => {
  const enti = [{ codice: '010203', denominazione: 'AZIENDA SANITARIA LOCALE TO3', regione: 'Piemonte' }];
  const autorita = [{ cf: '111', den: 'AZIENDA SANITARIA LOCALE TO3', reg: 'SEZIONE REGIONALE PIEMONTE' }];
  const { byCodice } = matchAutoritaEnti(enti, autorita);
  assert.equal(byCodice.get('010203'), '111');
});

test('matchAutoritaEnti — НЕ бърка Torino с Teramo (различен core)', () => {
  const enti = [{ codice: '010201', denominazione: 'AZIENDA SANITARIA LOCALE TO 1', regione: 'Piemonte' }];
  const autorita = [{ cf: '999', den: 'AZIENDA SANITARIA LOCALE TERAMO', reg: 'SEZIONE REGIONALE ABRUZZO' }];
  const { byCodice } = matchAutoritaEnti(enti, autorita);
  assert.equal(byCodice.has('010201'), false); // различен регион И различен core
});

test('matchAutoritaEnti — отхвърля двусмислие', () => {
  const enti = [{ codice: '150904', denominazione: 'AZIENDA OSPEDALIERA SAN GIOVANNI', regione: 'Campania' }];
  const autorita = [
    { cf: 'a', den: 'AZIENDA OSPEDALIERA SAN GIOVANNI ADDOLORATA', reg: 'SEZIONE REGIONALE CAMPANIA' },
    { cf: 'b', den: 'AZIENDA OSPEDALIERA SAN GIOVANNI BOSCO', reg: 'SEZIONE REGIONALE CAMPANIA' },
  ];
  const { byCodice } = matchAutoritaEnti(enti, autorita);
  // и двете споделят „SAN GIOVANNI“ еднакво → двусмислено → без съвпадение
  assert.equal(byCodice.has('150904'), false);
});

test('matchAutoritaEnti — различен регион не съвпада', () => {
  const enti = [{ codice: '010203', denominazione: 'ASL TO3', regione: 'Piemonte' }];
  const autorita = [{ cf: '111', den: 'ASL TO3', reg: 'SEZIONE REGIONALE LOMBARDIA' }];
  const { byCodice } = matchAutoritaEnti(enti, autorita);
  assert.equal(byCodice.has('010203'), false);
});
