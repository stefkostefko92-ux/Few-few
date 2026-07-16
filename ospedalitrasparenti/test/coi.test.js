// Тестове за индикаторите „конфликт на интереси" (двойки болница↔доставчик).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizzaCoppie, eSocietaDiCapitali, RE_CONVENZIONE, SOGLIE_COI } from '../src/coi.js';

const dir = (codice, cf, importo, extra = {}) => ({
  codice,
  fornitoreCf: cf,
  fornitore: `FORN ${cf} S.R.L.`,
  importo,
  categoria: 'diretto',
  ...extra,
});
const gara = (codice, cf, importo) => dir(codice, cf, importo, { categoria: 'competitiva' });

test('coi — rotazione: ≥5 преки към същия доставчик, ≥100k', () => {
  const c = Array.from({ length: 5 }, () => dir('010101', '11111111111', 25_000));
  const out = analizzaCoppie(c);
  assert.equal(out.length, 1);
  assert.ok(out[0].flags.includes('rotazione'));
});

test('coi — под праговете не сигнализира', () => {
  // 4 преки (< 5) и малка стойност
  assert.equal(analizzaCoppie(Array.from({ length: 4 }, () => dir('010101', '11111111111', 25_000))).length, 0);
  // 5 преки, но < 100k общо
  assert.equal(analizzaCoppie(Array.from({ length: 5 }, () => dir('010101', '11111111111', 10_000))).length, 0);
});

test('coi — dipendenza: материален доставчик, ≥85% от една болница, без търг', () => {
  const c = [
    ...Array.from({ length: 4 }, () => dir('010101', '22222222222', 150_000)), // 600k от една
    gara('020202', '22222222222', 50_000), // малко другаде
  ];
  const out = analizzaCoppie(c);
  const p = out.find((x) => x.codice === '010101');
  assert.ok(p && p.flags.includes('dipendenza'));
  assert.ok(p.quotaFornitore > SOGLIE_COI.dipendenzaQuota);
});

test('coi — конкурентни договори НЕ вдигат rotazione/esclusiva', () => {
  const out = analizzaCoppie(Array.from({ length: 12 }, () => gara('010101', '33333333333', 100_000)));
  assert.equal(out.length, 0);
});

test('coi — esclusiva: ≥10 договора, ≥90% без търг', () => {
  const c = [...Array.from({ length: 10 }, () => dir('010101', '44444444444', 5_000)), gara('010101', '44444444444', 5_000)];
  const out = analizzaCoppie(c);
  assert.equal(out.length, 1);
  assert.ok(out[0].flags.includes('esclusiva'));
});

test('coi — физически лица (без fornitoreCf) са изключени', () => {
  const c = Array.from({ length: 10 }, () => ({ codice: '010101', fornitoreCf: null, fornitore: 'Operatore individuale (persona fisica)', importo: 50_000, categoria: 'diretto' }));
  assert.equal(analizzaCoppie(c).length, 0);
});

test('coi — тежест: два флага → alta', () => {
  // rotazione + esclusiva едновременно
  const c = Array.from({ length: 10 }, () => dir('010101', '55555555555', 25_000));
  const out = analizzaCoppie(c);
  assert.equal(out[0].gravita, 'alta');
});

test('coi — eSocietaDiCapitali: капиталови/кооп. форми ДА, лични имена НЕ', () => {
  // допустими
  assert.ok(eSocietaDiCapitali('NOVARTIS FARMA SPA'));
  assert.ok(eSocietaDiCapitali('CARESTREAM HEALTH ITALIA S.R.L.'));
  assert.ok(eSocietaDiCapitali("PALOMAR SOCIETA' CONSORTILE COOPERATIVA SOCIALE"));
  assert.ok(eSocietaDiCapitali('CONSORZIO INDACO'));
  // недопустими: субекти с лични имена по конструкция (правен одит)
  assert.ok(!eSocietaDiCapitali('MULTISERVICE DI ROSANNA GALASSO'));
  assert.ok(!eSocietaDiCapitali('IMPRESA EDILE BARIZZA S.A.S. DI BARIZZA GIANFRANCO & C.'));
  assert.ok(!eSocietaDiCapitali('UNI-FER DI FERRERO GIAN PIERO & C. S.N.C.'));
  assert.ok(!eSocietaDiCapitali('AZIENDA AGRICOLA DI FRANCESCO PASSARO'));
  // sentinel и публични органи
  assert.ok(!eSocietaDiCapitali('IMPRESA INESISTENTE'));
  assert.ok(!eSocietaDiCapitali('AZIENDA SANITARIA PROVINCIALE DI VIBO VALENTIA'));
  assert.ok(!eSocietaDiCapitali(''));
});

test('coi — персонални дружества не влизат в двойките', () => {
  const c = Array.from({ length: 10 }, () => dir('010101', '66666666666', 50_000, { fornitore: 'JET SERVICE DI MICHELE CEGLIA' }));
  assert.equal(analizzaCoppie(c).length, 0);
});

test('coi — RE_CONVENZIONE: рамкови адхезии не броят като „senza gara"', () => {
  // 5 преки, но всичките с рамков предмет → нула флагове
  const oggetti = [
    'ADESIONE CONVENZIONE CONSIP ENERGIA ELETTRICA',
    'ADESIONE ALLA CONVENZIONE QUADRO REGIONALE',
    'APPALTO SPECIFICO INDETTO DALLA REGIONE AUTONOMA DELLA SARDEGNA',
    'ACCORDO-QUADRO FARMACI ESCLUSIVI',
    'ADESIONE A CONVENZIONE INTERCENT-ER',
  ];
  const c = oggetti.map((oggetto) => dir('010101', '77777777777', 50_000, { oggetto }));
  assert.equal(analizzaCoppie(c).length, 0);
  for (const o of oggetti) assert.ok(RE_CONVENZIONE.test(o), o);
  // а реален пряк предмет НЕ съвпада
  assert.ok(!RE_CONVENZIONE.test('FORNITURA DI DISPOSITIVI MEDICI'));
});

test('coi — importo<=0 не брои към count-праговете', () => {
  const c = Array.from({ length: 10 }, () => dir('010101', '88888888888', 0));
  assert.equal(analizzaCoppie(c).length, 0);
});
