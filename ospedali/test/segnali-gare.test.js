// Тестове за чистите функции на процедурните red-flag сигнали.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sogliaUE, bandaSottoSoglia, termineBreve, clusterFrazionamento } from '../src/segnali-gare.js';

test('sogliaUE: праг по година', () => {
  assert.equal(sogliaUE(2024), 221_000);
  assert.equal(sogliaUE(2023), 215_000);
  assert.equal(sogliaUE(2020), 214_000);
});

test('bandaSottoSoglia: точно под vs точно над прага', () => {
  assert.equal(bandaSottoSoglia(210_000, 2024), 'sotto'); // 221k*0.92=203k ≤ 210k < 221k
  assert.equal(bandaSottoSoglia(225_000, 2024), 'sopra');
  assert.equal(bandaSottoSoglia(50_000, 2024), null); // далеч под прага
  assert.equal(bandaSottoSoglia(300_000, 2024), null); // далеч над
});

test('termineBreve: ≤10 дни е кратък срок', () => {
  assert.equal(termineBreve(5), true);
  assert.equal(termineBreve(10), true);
  assert.equal(termineBreve(20), false);
  assert.equal(termineBreve(-3), false); // невалиден
  assert.equal(termineBreve(NaN), false);
});

test('clusterFrazionamento: ≥3 преки под прага в 30 дни със сума над прага', () => {
  const d = (day, importo) => ({ t: Date.parse(`2024-01-${String(day).padStart(2, '0')}`), importo });
  // 3 преки по 20k в рамките на 10 дни = 60k > 40k → 1 клъстер
  const r = clusterFrazionamento([d(1, 20_000), d(5, 20_000), d(9, 20_000)], { window: 30, soglia: 40_000 });
  assert.equal(r.cluster, 1);
  assert.equal(r.valore, 60_000);
});

test('clusterFrazionamento: разпръснати във времето не са клъстер', () => {
  const d = (mese, importo) => ({ t: Date.parse(`2024-${String(mese).padStart(2, '0')}-01`), importo });
  const r = clusterFrazionamento([d(1, 20_000), d(6, 20_000), d(12, 20_000)], { window: 30, soglia: 40_000 });
  assert.equal(r.cluster, 0);
});

test('clusterFrazionamento: застъпени прозорци НЕ броят двойно (непокриващи се клъстери)', () => {
  // равномерен поток от 6 преки по 20k на всеки 14 дни (window 30) — един affidamento
  // не бива да влиза в няколко клъстера. Очаквани: 2 непокриващи се клъстера, не 4.
  const d = (day, importo) => ({ t: Date.parse(`2024-01-01`) + day * 86400000, importo });
  const arr = [d(0, 20000), d(14, 20000), d(28, 20000), d(42, 20000), d(56, 20000), d(70, 20000)];
  const r = clusterFrazionamento(arr, { window: 30, soglia: 40_000 });
  assert.equal(r.cluster, 2);
  assert.equal(r.valore, 120_000); // общата стойност на 6-те, не преброена многократно
});

test('clusterFrazionamento: над прага поотделно се изключват (не е раздробяване)', () => {
  const d = (day, importo) => ({ t: Date.parse(`2024-01-${String(day).padStart(2, '0')}`), importo });
  const r = clusterFrazionamento([d(1, 50_000), d(2, 50_000), d(3, 50_000)], { window: 30, soglia: 40_000 });
  assert.equal(r.cluster, 0); // всяко е над прага → не са „под прага за да заобиколят"
});

// TODO(undercount): известен дефект — щом клъстер се затвори при `j`, следващите
// възлагания в СЪЩИЯ прозорец (i ≤ ultimoFine) не влизат в никой клъстер, затова
// и `valore` подценява. Пиннато нарочно (launch данните зависят от него);
// поправката е отделна координирана стъпка след пуска. НЕ „поправяй" теста.
test('clusterFrazionamento: подценяване — 4-то възлагане в прозореца се изпуска', () => {
  // 4 преки по 20k в рамките на 12 дни (window 30). Реалното раздробяване е 80k,
  // но кодът затваря клъстера на 3-тото и НЕ прибавя 4-тото → valore=60k (−20k).
  const d = (day, importo) => ({ t: Date.parse(`2024-01-${String(day).padStart(2, '0')}`), importo });
  const r = clusterFrazionamento([d(1, 20_000), d(5, 20_000), d(9, 20_000), d(13, 20_000)], { window: 30, soglia: 40_000 });
  assert.equal(r.cluster, 1);
  assert.equal(r.valore, 60_000); // ТЕКУЩО поведение: 4-тото възлагане (20k) не е преброено
});
