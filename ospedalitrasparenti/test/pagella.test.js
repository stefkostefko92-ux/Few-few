// Тестове за чистата pagella логика (src/lib/pagella.js): 5-те спии, праговете
// и nd клоновете. Детерминистично, без I/O.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { semaforoStruttura, contaSpie, quotaSottoSoglia } from '../src/lib/pagella.js';

/** Намира спия по ключ. */
const spia = (spie, key) => spie.find((s) => s.key === key);

test('semaforo — без никакви данни: bilanci/spesa verde, останалите nd', () => {
  const spie = semaforoStruttura({ seg: null, forse: null, app: null, medianaSenzaGara: null, medianaSottoSoglia: null });
  assert.equal(spie.length, 5);
  assert.equal(spia(spie, 'bilanci').stato, 'verde');
  assert.equal(spia(spie, 'spesa').stato, 'verde');
  assert.equal(spia(spie, 'senzagara').stato, 'nd');
  assert.equal(spia(spie, 'concorrenza').stato, 'nd');
  assert.equal(spia(spie, 'sottosoglia').stato, 'nd');
});

test('semaforo — bilanci: gravità alta → rosso, media → giallo', () => {
  const alta = semaforoStruttura({ seg: { codice: 'x', denominazione: 'X', regione: 'R', gravitaMax: 'alta', segnalazioni: [{}, {}] }, forse: null, app: null });
  assert.equal(spia(alta, 'bilanci').stato, 'rosso');
  const media = semaforoStruttura({ seg: { codice: 'x', denominazione: 'X', regione: 'R', gravitaMax: 'media', segnalazioni: [{}] }, forse: null, app: null });
  assert.equal(spia(media, 'bilanci').stato, 'giallo');
});

test('semaforo — spesa anomala: 1 флаг giallo, 2+ rosso', () => {
  const uno = semaforoStruttura({ seg: null, forse: { codice: 'x', denominazione: 'X', regione: 'R', anno: 2024, flags: [{}], cat: {} }, app: null });
  assert.equal(spia(uno, 'spesa').stato, 'giallo');
  const due = semaforoStruttura({ seg: null, forse: { codice: 'x', denominazione: 'X', regione: 'R', anno: 2024, flags: [{}, {}], cat: {} }, app: null });
  assert.equal(spia(due, 'spesa').stato, 'rosso');
});

test('semaforo — senza gara: спрямо медианата; n<50 → nd', () => {
  const app = { cf: 'c', den: 'D', reg: 'R', importo: 1, n: 100, quotaSenzaGaraNum: 0.9, cat: {} };
  const rosso = semaforoStruttura({ seg: null, forse: null, app, medianaSenzaGara: 0.5 });
  assert.equal(spia(rosso, 'senzagara').stato, 'rosso'); // 0.9 > 0.5*1.5
  const giallo = semaforoStruttura({ seg: null, forse: null, app: { ...app, quotaSenzaGaraNum: 0.6 }, medianaSenzaGara: 0.5 });
  assert.equal(spia(giallo, 'senzagara').stato, 'giallo'); // 0.6 > 0.5, < 0.75
  const verde = semaforoStruttura({ seg: null, forse: null, app: { ...app, quotaSenzaGaraNum: 0.4 }, medianaSenzaGara: 0.5 });
  assert.equal(spia(verde, 'senzagara').stato, 'verde');
  const piccolo = semaforoStruttura({ seg: null, forse: null, app: { ...app, n: 49 }, medianaSenzaGara: 0.5 });
  assert.equal(spia(piccolo, 'senzagara').stato, 'nd');
});

test('semaforo — concorrenza: ≥50% rosso, ≥30% giallo, <20 гари nd', () => {
  const base = { cf: 'c', den: 'D', reg: 'R', importo: 1, n: 100, quotaSenzaGaraNum: null, cat: {} };
  const ag = (q, gare = 30) => ({ ...base, aggiu: { gareConPartecipanti: gare, gareUnicoOfferente: 0, quotaUnicoOfferente: q, nFornitori: 1, top1Quota: null, valoreAggiudicato: 0, topFornitori: [] } });
  assert.equal(spia(semaforoStruttura({ seg: null, forse: null, app: ag(0.55) }), 'concorrenza').stato, 'rosso');
  assert.equal(spia(semaforoStruttura({ seg: null, forse: null, app: ag(0.35) }), 'concorrenza').stato, 'giallo');
  assert.equal(spia(semaforoStruttura({ seg: null, forse: null, app: ag(0.1) }), 'concorrenza').stato, 'verde');
  assert.equal(spia(semaforoStruttura({ seg: null, forse: null, app: ag(0.9, 10) }), 'concorrenza').stato, 'nd');
});

test('semaforo — sotto soglia: >2× медианата и ≥10 случая → rosso', () => {
  const app = { cf: 'c', den: 'D', reg: 'R', importo: 1, n: 100, quotaSenzaGaraNum: null, cat: {}, band40: 10, band140: 5 };
  const rosso = semaforoStruttura({ seg: null, forse: null, app, medianaSottoSoglia: 0.05 });
  assert.equal(spia(rosso, 'sottosoglia').stato, 'rosso'); // 0.15 > 0.1 и 15 ≥ 10
  const giallo = semaforoStruttura({ seg: null, forse: null, app: { ...app, band40: 7, band140: 0 }, medianaSottoSoglia: 0.05 });
  assert.equal(spia(giallo, 'sottosoglia').stato, 'giallo'); // 0.07 > 0.065
  const verde = semaforoStruttura({ seg: null, forse: null, app: { ...app, band40: 2, band140: 0 }, medianaSottoSoglia: 0.05 });
  assert.equal(spia(verde, 'sottosoglia').stato, 'verde');
});

test('quotaSottoSoglia + contaSpie', () => {
  assert.equal(quotaSottoSoglia({ n: 100, band40: 10, band140: 5 }), 0.15);
  assert.equal(quotaSottoSoglia({ n: 0 }), null);
  const spie = semaforoStruttura({ seg: null, forse: null, app: null });
  const c = contaSpie(spie);
  assert.equal(c.verdi, 2);
  assert.equal(c.nd, 3);
  assert.equal(c.rosse + c.gialle, 0);
});
