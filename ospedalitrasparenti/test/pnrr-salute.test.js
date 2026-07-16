// Тестове за PNRR Missione 6 (Salute): филтър M6, сумиране per misura и per регион,
// разрешаване на регион от територия (R/P/C, много-регионален → само национално).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggrega,
  regKeyFromIstat2,
  regKeyDaTerritorio,
  risolviRegione,
  parseProgettoLine,
} from '../src/fetch-pnrr-salute.js';

const prog = (id, cm, pnrr) => ({ progetto_id: id, codice_misura: cm, finanziamento_pnrr: pnrr });

test('aggrega — изхвърля не-M6, сумира per misura и национално', () => {
  const progetti = [
    prog('1', 'M1C1I1.04.05', 1000), // не-M6 → изхвърля се
    prog('2', 'M6C1I1.03.01', 100), // Case della Comunità
    prog('3', 'M6C2I1.01.02', 300), // болница технологии
    prog('4', 'M6C1I1.01.00', 50),
  ];
  const terr = new Map();
  const { nazionale } = aggrega(progetti, terr);
  assert.equal(nazionale.nProgetti, 3); // не-M6 не се брои
  assert.equal(nazionale.finanziamentoPnrr, 450);
  assert.equal(nazionale.perMisura.M6C1.n, 2);
  assert.equal(nazionale.perMisura.M6C1.importo, 150);
  assert.equal(nazionale.perMisura.M6C2.n, 1);
  assert.equal(nazionale.perMisura.M6C2.importo, 300);
  assert.equal(nazionale.perMisura.M1C1, undefined);
});

test('aggrega — регионално сумиране от територии (комуна и регион)', () => {
  const progetti = [
    prog('2', 'M6C1I1.03.01', 100),
    prog('3', 'M6C2I1.01.02', 300),
    prog('4', 'M6C1I1.01.00', 50),
  ];
  const terr = new Map([
    ['2', [{ tipologia: 'C', istat_id: '015146' }]], // Milano → Lombardia '030'
    ['3', [{ tipologia: 'R', istat_id: '03' }]], // Lombardia директно
    ['4', [{ tipologia: 'C', istat_id: '063049' }]], // Napoli (провинция 063) → Campania '150'
  ]);
  const { perRegione } = aggrega(progetti, terr);
  assert.equal(perRegione['030'].nProgetti, 2);
  assert.equal(perRegione['030'].finanziamentoPnrr, 400);
  assert.equal(perRegione['150'].nProgetti, 1);
  assert.equal(perRegione['150'].finanziamentoPnrr, 50);
});

test('aggrega — много-регионален проект се брои само национално', () => {
  const progetti = [prog('9', 'M6C2I1.02.00', 200)];
  const terr = new Map([
    ['9', [{ tipologia: 'R', istat_id: '03' }, { tipologia: 'R', istat_id: '15' }]],
  ]);
  const { nazionale, perRegione } = aggrega(progetti, terr);
  assert.equal(nazionale.finanziamentoPnrr, 200); // в националното
  assert.deepEqual(perRegione, {}); // но в никой регион
});

test('regKeyFromIstat2 — 2-цифрен ISTAT регион → ключ (Трентино=taa)', () => {
  assert.equal(regKeyFromIstat2('01'), '010');
  assert.equal(regKeyFromIstat2('04'), 'taa');
  assert.equal(regKeyFromIstat2('10'), '100');
  assert.equal(regKeyFromIstat2('20'), '200');
  assert.equal(regKeyFromIstat2('99'), null);
});

test('regKeyDaTerritorio — R/P/CM/C/N', () => {
  assert.equal(regKeyDaTerritorio({ tipologia: 'R', istat_id: '18' }), '180'); // Calabria
  assert.equal(regKeyDaTerritorio({ tipologia: 'P', istat_id: '044' }), '110'); // Ascoli Piceno → Marche
  assert.equal(regKeyDaTerritorio({ tipologia: 'CM', istat_id: '092' }), '200'); // Cagliari → Sardegna
  assert.equal(regKeyDaTerritorio({ tipologia: 'C', istat_id: '037006' }), '080'); // Bologna → Emilia-Romagna
  assert.equal(regKeyDaTerritorio({ tipologia: 'N', istat_id: '' }), null); // национален
  assert.equal(regKeyDaTerritorio({ tipologia: 'C', istat_id: '021001' }), 'taa'); // Bolzano → Trentino
});

test('risolviRegione — единствен регион или null при разнородни/празни', () => {
  assert.equal(risolviRegione([{ tipologia: 'C', istat_id: '015146' }]), '030');
  assert.equal(
    risolviRegione([{ tipologia: 'C', istat_id: '015146' }, { tipologia: 'C', istat_id: '016024' }]),
    '030'
  ); // и двете Lombardia
  assert.equal(
    risolviRegione([{ tipologia: 'R', istat_id: '03' }, { tipologia: 'R', istat_id: '15' }]),
    null
  ); // две различни
  assert.equal(risolviRegione([]), null);
});

test('parseProgettoLine — котва is_in_regis устоява на запетаи в titolo', () => {
  // titolo съдържа запетая → редът има повече полета, но котвата „true" държи
  const line =
    '102973,AMMODERNAMENTO, MEDIA TECNOLOGIA,E29J,E29J,179000.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,179000.00,0.00,0.00,179000.00,true,319,Ammodernamento,M6C2I1.01.02,57440,REGIONE EMILIA-ROMAGNA,02086690373';
  const p = parseProgettoLine(line);
  assert.equal(p.progetto_id, '102973');
  assert.equal(p.codice_misura, 'M6C2I1.01.02');
  assert.equal(p.finanziamento_pnrr, 179000);
});
