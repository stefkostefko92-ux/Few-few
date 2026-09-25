import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivati, median, percentile, analizzaEnte, SOGLIE } from '../src/analyze.js';

test('derivati — коефициенти', () => {
  const d = derivati({ risultatoEsercizio: -10, valoreProduzione: 100, costiProduzione: 110, costoPersonale: 40, debiti: 50, totaleAttivo: 40 });
  assert.equal(d.deficitRatio, -0.1);
  assert.equal(d.coperturaCosti, 1.1);
  assert.equal(d.personaleRatio, 0.4);
  assert.equal(d.debitiSuAttivo, 1.25);
});

test('derivati — липсващи/нулеви знаменатели', () => {
  const d = derivati({ risultatoEsercizio: -10, valoreProduzione: 0 });
  assert.equal(d.deficitRatio, undefined);
});

test('median и percentile', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 10);
});

/** Помощник: строи ente с дадени годишни редове. */
function makeEnte(rows, extra = {}) {
  const serie = new Map();
  for (const [anno, y] of Object.entries(rows)) serie.set(Number(anno), y);
  return { codice: '010999', codReg: '010', codEnte: '999', regione: 'Test', denominazione: 'TEST', serie, anag: null, ...extra };
}
const CTX = { ultimoAnnoCe: 2024, personaleP90: 0.5, personaleMediano: 0.3 };

test('правило: тежък дефицит в последната година', () => {
  const ente = makeEnte({ 2024: { valoreProduzione: 100, risultatoEsercizio: -10, costiProduzione: 108 } });
  const seg = analizzaEnte(ente, CTX);
  assert.ok(seg.some((s) => s.regola === 'disavanzo_grave' && s.gravita === 'alta'));
});

test('правило: балансиран бюджет → без disavanzo_grave', () => {
  const ente = makeEnte({ 2024: { valoreProduzione: 100, risultatoEsercizio: -1, costiProduzione: 99 } });
  const seg = analizzaEnte(ente, CTX);
  assert.ok(!seg.some((s) => s.regola === 'disavanzo_grave'));
});

test('правило: отрицателно нетно имущество', () => {
  const ente = makeEnte({ 2024: { valoreProduzione: 100, patrimonioNetto: -5, totaleAttivo: 50, debiti: 20 } });
  const seg = analizzaEnte(ente, CTX);
  assert.ok(seg.some((s) => s.regola === 'patrimonio_netto_negativo' && s.gravita === 'alta'));
});

test('правило: задължения над актива', () => {
  const ente = makeEnte({ 2024: { valoreProduzione: 100, debiti: 60, totaleAttivo: 40 } });
  const seg = analizzaEnte(ente, CTX);
  assert.ok(seg.some((s) => s.regola === 'debiti_oltre_attivo'));
});

test('правило: устойчив дефицит 5/5 години', () => {
  const rows = {};
  for (let a = 2020; a <= 2024; a++) rows[a] = { valoreProduzione: 100, risultatoEsercizio: -2, costiProduzione: 101 };
  const seg = analizzaEnte(makeEnte(rows), CTX);
  assert.ok(seg.some((s) => s.regola === 'disavanzo_persistente'));
  assert.ok(seg.some((s) => s.regola === 'squilibrio_strutturale'));
});

test('правило: аномален скок в разходите', () => {
  const ente = makeEnte({
    2023: { valoreProduzione: 100, costiProduzione: 100, risultatoEsercizio: 0 },
    2024: { valoreProduzione: 105, costiProduzione: 200, risultatoEsercizio: -95 },
  });
  const seg = analizzaEnte(ente, CTX);
  assert.ok(seg.some((s) => s.regola === 'salto_costi'));
});

test('правило: „твърде кръгъл“ резултат', () => {
  const ente = makeEnte({ 2024: { valoreProduzione: 100_000_000, risultatoEsercizio: 300_000, costiProduzione: 99_700_000 } });
  const seg = analizzaEnte(ente, CTX);
  assert.ok(seg.some((s) => s.regola === 'risultato_arrotondato'));
});

test('здрава структура без данни → нула сигнали', () => {
  const ente = makeEnte({ 2024: { valoreProduzione: 100, risultatoEsercizio: 1, costiProduzione: 99, patrimonioNetto: 50, totaleAttivo: 80, debiti: 20, costoPersonale: 30 } });
  const seg = analizzaEnte(ente, CTX);
  assert.equal(seg.length, 0);
});

test('SOGLIE са разумни', () => {
  assert.equal(SOGLIE.disavanzoGrave, 0.05);
  assert.ok(SOGLIE.arrotondamento >= 100_000);
});
