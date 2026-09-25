// Тестове за новите източници: mobilità (CE Extraregione) и personale (Conto Annuale).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizzaMobilita } from '../src/mobilita.js';
import { aggregaOccupazione } from '../src/personale.js';

const rigaCe = (codReg, regione, ente, voce, descr, imp) => ({
  'Codice Regione': codReg,
  'Descrizione Regione': regione,
  'Codice Ente SSN': ente,
  'Codice Voce Contabile': voce,
  'Descrizione Voce Contabile': descr,
  'Importo Totale': String(imp),
});

test('mobilità — активна (AA0450) и пасивна (листов Extraregione) по региони', () => {
  const rows = [
    rigaCe('010', 'Piemonte', '201', 'AA0450', 'A.4.A.3) Ricavi ... Extraregione', 100),
    rigaCe('010', 'Piemonte', '201', 'BA0830', 'B.2.A.7.3) - da pubblico (Extraregione)', 40),
    rigaCe('180', 'Calabria', '201', 'BA0830', 'B.2.A.7.3) - da pubblico (Extraregione)', 300),
  ];
  const { regioni } = analizzaMobilita(rows);
  const pie = regioni.find((r) => r.regione === 'Piemonte');
  assert.equal(pie.attivaParziale, 100);
  assert.equal(pie.passivaPubblico, 40);
  const cal = regioni.find((r) => r.regione === 'Calabria');
  assert.equal(cal.passivaTot, 300);
});

test('mobilità — изключва intraregionale, „non residenti" и консолидирания 999', () => {
  const rows = [
    rigaCe('030', 'Lombardia', '201', 'BA0470', "B.2.A.1.2) - da pubblico ... Mobilita' intraregionale", 999),
    rigaCe('030', 'Lombardia', '201', 'BA0890', "B.2.A.7.5) - da privato per cittadini non residenti - Extraregione (mobilita' attiva in compensazione)", 999),
    rigaCe('030', 'Lombardia', '999', 'BA0830', 'B.2.A.7.3) - da pubblico (Extraregione)', 999),
    rigaCe('030', 'Lombardia', '201', 'BA0830', 'B.2.A.7.3) - da pubblico (Extraregione)', 7),
  ];
  const { regioni } = analizzaMobilita(rows);
  assert.equal(regioni.length, 1);
  assert.equal(regioni[0].passivaTot, 7); // само реалният листов Extraregione ред на азиендата
});

test('mobilità — родителски код не се брои двойно при съвпадащо дете', () => {
  const rows = [
    rigaCe('050', 'Veneto', '201', 'BA0800', 'B.2.A.7) Acquisti ... Extraregione', 100), // родител
    rigaCe('050', 'Veneto', '201', 'BA0830', 'B.2.A.7.3) - da pubblico (Extraregione)', 60), // дете
  ];
  const { regioni } = analizzaMobilita(rows);
  assert.equal(regioni[0].passivaTot, 60); // само листът
});

const rigaOcc = (ente, bdap, categoria, extra = {}) => ({
  'Descrizione Comparto': "SANITA'",
  'Codice Ente BDAP': bdap,
  'Descrizione Ente': ente,
  'Descrizione Categoria': categoria,
  'Numero Dipendenti Donne Tempo Pieno': '10',
  'Numero Dipendenti Uomini Tempo Pieno': '5',
  'Numero Dipendenti Donne Tempo Determinato': '2',
  'Numero Dipendenti Uomini Lavoro Interinale': '1',
  ...extra,
});

test('personale — агрегация: стабилни + гъвкави, медици по категория', () => {
  const perBdap = aggregaOccupazione([
    rigaOcc('AUSL TEST', 'B1', 'MEDICI'),
    rigaOcc('AUSL TEST', 'B1', 'INFERMIERI'),
  ]);
  const g = perBdap.get('B1');
  assert.equal(g.totale, 36); // 2 реда × (15 стабилни + 3 гъвкави)
  assert.equal(g.flessibili, 6);
  assert.equal(g.medici, 18); // само редът MEDICI
});

test('personale — не-здравните ведомства се пропускат', () => {
  const perBdap = aggregaOccupazione([
    { ...rigaOcc('UNI', 'U1', 'DOCENTI'), 'Descrizione Comparto': 'ISTRUZIONE E RICERCA' },
  ]);
  assert.equal(perBdap.size, 0);
});
