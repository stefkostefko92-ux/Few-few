import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggrega } from '../src/fetch-perlapa.js';

// Фиктивни редове: две здравни структури + една нездравна. „Soggetto Percettore“
// съдържа ИМЕ на физическо лице — то НЕ бива да се появи в изхода (GDPR).
const rows2023 = [
  {
    'Soggetto Dichiarante': 'Azienda USL di Ferrara',
    'Soggetto Percettore': 'ROSSI MARIO',
    'Compenso Lordo': '10.000,00€',
    'Ammontare Erogato': '8.000,00€',
  },
  {
    'Soggetto Dichiarante': 'AZIENDA OSPEDALIERO UNIVERSITARIA DI BOLOGNA',
    'Soggetto Percettore': 'BIANCHI GIULIA',
    'Compenso Lordo': '5000.00€',
    'Ammontare Erogato': '', // празно → пада на Compenso Lordo
  },
  {
    // нездравна структура → трябва да се изхвърли
    'Soggetto Dichiarante': 'Comune di Ferrara',
    'Soggetto Percettore': 'VERDI ANNA',
    'Compenso Lordo': '99.999,00€',
    'Ammontare Erogato': '99.999,00€',
  },
];
const rows2024 = [
  {
    'Soggetto Dichiarante': 'Azienda USL di Ferrara', // повтаря се → нова година в anni[]
    'Soggetto Percettore': 'NERI PAOLO',
    'Compenso Lordo': '2.000,00€',
    'Ammontare Erogato': '2.000,00€',
  },
];

test('aggrega — нездравната структура се изхвърля', () => {
  const { perAnno, perEnte } = aggrega([{ anno: 2023, rows: rows2023 }]);
  assert.equal(perAnno[2023].nIncarichi, 2); // само двете здравни
  assert.equal(perAnno[2023].nEnti, 2);
  assert.ok(!('COMUNE DI FERRARA' in perEnte));
});

test('aggrega — сумиране: Ammontare Erogato, fallback Compenso Lordo', () => {
  const { perAnno, perEnte } = aggrega([{ anno: 2023, rows: rows2023 }]);
  // 8.000 (erogato) + 5.000 (fallback lordo, защото erogato е празно)
  assert.equal(perAnno[2023].importo, 13000);
  assert.equal(perEnte['AZIENDA USL DI FERRARA'].importo, 8000);
  assert.equal(perEnte['AZIENDA OSPEDALIERO UNIVERSITARIA DI BOLOGNA'].importo, 5000);
});

test('aggrega — нормализация на името + натрупване по години', () => {
  const { perEnte } = aggrega([
    { anno: 2023, rows: rows2023 },
    { anno: 2024, rows: rows2024 },
  ]);
  const e = perEnte['AZIENDA USL DI FERRARA'];
  assert.deepEqual(e.anni, [2023, 2024]);
  assert.equal(e.nIncarichi, 2);
  assert.equal(e.importo, 10000); // 8.000 + 2.000
});

test('GDPR — изходът НЕ съдържа НИКАКВО име на физическо лице', () => {
  const out = aggrega([
    { anno: 2023, rows: rows2023 },
    { anno: 2024, rows: rows2024 },
  ]);
  const json = JSON.stringify(out);
  for (const nome of ['ROSSI', 'BIANCHI', 'VERDI', 'NERI', 'MARIO', 'GIULIA', 'ANNA', 'PAOLO', 'Percettore']) {
    assert.ok(!json.includes(nome), `изходът съдържа „${nome}“`);
  }
});
