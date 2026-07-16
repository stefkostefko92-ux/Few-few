// Тестове за регионалната агрегация на PNE (клинични резултати AGENAS).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregaRegione, scegliIndicatori, toNum } from '../src/fetch-pne.js';

// Фиктивен индикатор: цезарови сечения (по-нисък = по-добре).
const IND = { id: 'i-cesarei', codice: '37', descr: 'Taglio cesareo primario', chiave: 'cesarei', tipoMigliore: 'basso', unita: '%' };

// 2 региона × 2 структури. valore: { n (обем), perc, perc_adj (headline) }.
const valori = [
  // Piemonte (010): две структури с различен обем
  { indicatore: { id: 'i-cesarei' }, struttura: { id: 's-pie-1' }, valore: { n: 1000, perc: 30, perc_adj: 20 } },
  { indicatore: { id: 'i-cesarei' }, struttura: { id: 's-pie-2' }, valore: { n: 100, perc: 44, perc_adj: 40 } },
  // Lazio (120): една структура
  { indicatore: { id: 'i-cesarei' }, struttura: { id: 's-laz-1' }, valore: { n: 500, perc: 35, perc_adj: 35 } },
  // друг индикатор (трябва да се игнорира от aggregaRegione за IND)
  { indicatore: { id: 'i-altro' }, struttura: { id: 's-pie-1' }, valore: { n: 999, perc: 1, perc_adj: 1 } },
  // ред без регион (структурата не е в картата) → пропуска се
  { indicatore: { id: 'i-cesarei' }, struttura: { id: 's-ignota' }, valore: { n: 700, perc_adj: 99 } },
];

const strutturaRegione = {
  's-pie-1': '010',
  's-pie-2': '010',
  's-laz-1': '120',
  // 's-ignota' липсва нарочно
};

test('PNE — претеглена по обем регионална средна на perc_adj', () => {
  const agg = aggregaRegione(valori, strutturaRegione, IND);

  // Piemonte: (20*1000 + 40*100) / (1000+100) = 24000/1100 = 21.818…
  assert.ok(Math.abs(agg.perRegione['010'].valore - 24000 / 1100) < 1e-9);
  assert.equal(agg.perRegione['010'].nStrutture, 2);
  assert.equal(agg.perRegione['010'].volume, 1100);

  // Lazio: една структура → самата стойност
  assert.equal(agg.perRegione['120'].valore, 35);
  assert.equal(agg.perRegione['120'].nStrutture, 1);
  assert.equal(agg.perRegione['120'].volume, 500);

  // структурата без регион е пропусната (не влиза никъде)
  assert.equal(Object.keys(agg.perRegione).length, 2);
});

test('PNE — националната средна е по всички мапнати структури, другите индикатори се игнорират', () => {
  const agg = aggregaRegione(valori, strutturaRegione, IND);
  // (20*1000 + 40*100 + 35*500) / (1000+100+500) = (20000+4000+17500)/1600 = 41500/1600 = 25.9375
  assert.ok(Math.abs(agg.nazionale.valore - 41500 / 1600) < 1e-9);
  assert.equal(agg.nazionale.nStrutture, 3); // i-altro и s-ignota не се броят
  assert.equal(agg.nazionale.volume, 1600);
});

test('PNE — tipoMigliore и метаданните се пренасят от индикатора', () => {
  const agg = aggregaRegione(valori, strutturaRegione, IND);
  assert.equal(agg.tipoMigliore, 'basso');
  assert.equal(agg.codice, '37');
  assert.equal(agg.chiave, 'cesarei');
});

test('PNE — Map като strutturaRegione работи също', () => {
  const mapa = new Map(Object.entries(strutturaRegione));
  const agg = aggregaRegione(valori, mapa, IND);
  assert.equal(agg.perRegione['120'].valore, 35);
  assert.equal(agg.nazionale.nStrutture, 3);
});

test('PNE — проста средна при липсващ обем (n)', () => {
  const senzaN = [
    { indicatore: { id: 'i-x' }, struttura: { id: 'a' }, valore: { perc_adj: 10 } },
    { indicatore: { id: 'i-x' }, struttura: { id: 'b' }, valore: { perc_adj: 30 } },
  ];
  const reg = { a: '010', b: '010' };
  const ind = { id: 'i-x', codice: '99', chiave: 'x', tipoMigliore: 'alto', unita: '%' };
  const agg = aggregaRegione(senzaN, reg, ind);
  assert.equal(agg.perRegione['010'].valore, 20); // (10+30)/2
  assert.equal(agg.perRegione['010'].volume, 0);
});

test('PNE — избор на индикатори по codice/descr регекс', () => {
  const dizionario = [
    { id: 'a', codice: '37', descr: 'Taglio cesareo primario: proporzione di parti' },
    { id: 'b', codice: '640', descr: 'Frattura del collo del femore: intervento chirurgico entro 48 ore' },
    { id: 'c', codice: '111', descr: 'Mortalità a 30 giorni dopo infarto miocardico acuto (IMA)' },
    { id: 'd', codice: '222', descr: 'Un indicatore non selezionato qualsiasi' },
  ];
  const scelti = scegliIndicatori(dizionario);
  const perChiave = Object.fromEntries(scelti.map((s) => [s.chiave, s]));
  assert.equal(perChiave.cesarei.id, 'a');
  assert.equal(perChiave.cesarei.tipoMigliore, 'basso');
  assert.equal(perChiave.femore48.id, 'b');
  assert.equal(perChiave.femore48.tipoMigliore, 'alto');
  assert.equal(perChiave.mortalitaIma.id, 'c');
  // индикаторът „d" не съответства на никоя селекция
  assert.ok(!scelti.some((s) => s.id === 'd'));
});

test('PNE — toNum толерира италианска запетая и невалидни стойности', () => {
  assert.equal(toNum(12.5), 12.5);
  assert.equal(toNum('12,5'), 12.5);
  assert.equal(toNum(''), null);
  assert.equal(toNum(null), null);
  assert.equal(toNum('n.d.'), null);
});
