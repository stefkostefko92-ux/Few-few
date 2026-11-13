// The price list filled at once (the owner, 13 November 2026: "Нямаме listino prezzi, направи го от
// impostazioni за да можем да правим preventivi по-бързо и лесно"). The list existed, one row at a time; a
// company with a few hundred prices in a spreadsheet pastes them in one go. What is checked here, without a
// database: reading what was pasted from Excel (tabs) or from a CSV file (semicolons, quotes) — with a row of
// titles in any order or without one in the documented order —, the Italian amounts, what is missing, and the
// errors row by row. Nothing is guessed: a price that cannot be read is an error, never zero.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { righeCsv } from '../src/http/csv.js';
import { MAX_VOCI } from '../src/preventivi/listino.js';
import {
  improntaImport,
  INTESTAZIONE_LISTINO,
  leggiImport,
  MAX_TESTO_IMPORT,
  rigaCsvDi,
} from '../src/preventivi/listino-import.js';

const BASE = { unita: 'pz', iva: 22 } as const;
const dati = (testo: string, predefiniti: { unita: string; iva: 22 | 10 | 4 } = BASE) =>
  leggiImport(testo, predefiniti);

describe('reading a pasted price list', () => {
  it('takes rows copied from a spreadsheet, with the row of titles in any order', () => {
    const letto = dati(
      'Descrizione\tUM\tPrezzo €\tCodice\tIVA %\n' +
        'Quadro di manovra VVVF\tpz\t€ 4.850,00\tQM-01\t10\n' +
        'Manodopera specializzata\th\t48,5\t\t\n',
    );
    assert.equal(letto.errore, null);
    assert.deepEqual(letto.errori, []);
    assert.equal(letto.intestazione, true);
    assert.deepEqual(letto.righe, [
      {
        riga: 2,
        data: {
          codice: 'QM-01',
          descrizione: 'Quadro di manovra VVVF',
          unita: 'pz',
          prezzo: 485000,
          iva: 10,
        },
      },
      {
        riga: 3,
        data: {
          codice: null,
          descrizione: 'Manodopera specializzata',
          unita: 'h',
          prezzo: 4850,
          iva: 22,
        },
      },
    ]);
  });

  it('takes a CSV file with semicolons and no titles, in the documented order', () => {
    // Codice; Descrizione; Unità; Prezzo; IVA — the last one may be missing.
    const letto = dati('A1;Fune 10 mm;m;3,20;22\r\nA2;Olio idraulico;l;1234.5\r\n\r\n');
    assert.equal(letto.errore, null);
    assert.equal(letto.intestazione, false);
    assert.deepEqual(
      letto.righe.map((r) => [r.riga, r.data.codice, r.data.unita, r.data.prezzo, r.data.iva]),
      [
        [1, 'A1', 'm', 320, 22],
        [2, 'A2', 'l', 123450, 22],
      ],
    );
  });

  it('reads the Italian amounts and refuses what is not a price', () => {
    const letto = dati(
      'Descrizione;Prezzo\n' +
        'Uno;1.290,50 €\nDue;12\nTre;0,5\nQuattro;gratis\nCinque;1,234\nSei;-5\nSette;\n',
    );
    assert.deepEqual(
      letto.righe.map((r) => r.data.prezzo),
      [129050, 1200, 50],
    );
    assert.deepEqual(letto.errori, [
      { riga: 5, campo: 'prezzo', codice: 'decimal' },
      { riga: 6, campo: 'prezzo', codice: 'decimal' },
      { riga: 7, campo: 'prezzo', codice: 'decimal' },
      { riga: 8, campo: 'prezzo', codice: 'required' },
    ]);
  });

  it('uses the unit and the VAT chosen in the form where the sheet has none', () => {
    const letto = dati('Voce;Prezzo\nSopralluogo;80\n', { unita: 'a corpo', iva: 10 });
    assert.deepEqual(letto.righe[0]!.data, {
      codice: null,
      descrizione: 'Sopralluogo',
      unita: 'a corpo',
      prezzo: 8000,
      iva: 10,
    });
    // The VAT of the sheet: "22", "22 %", "0,22" (a percent cell) — anything else is an error.
    const iva = dati('Descrizione;Prezzo;IVA\nA;1;22 %\nB;1;0,1\nC;1;4\nD;1;21\nE;1;esente\n');
    assert.deepEqual(
      iva.righe.map((r) => r.data.iva),
      [22, 10, 4],
    );
    assert.deepEqual(iva.errori, [
      { riga: 5, campo: 'iva', codice: 'option' },
      { riga: 6, campo: 'iva', codice: 'option' },
    ]);
  });

  it('reads quoted cells, and its own export back', () => {
    const letto = dati(
      '﻿"Codice";"Descrizione";"Unità";"Prezzo €";"IVA %"\r\n' +
        '"K;1";"Kit ""A3""; completo";"pz";"950,00";"22"\r\n',
    );
    assert.deepEqual(letto.righe[0]!.data, {
      codice: 'K;1',
      descrizione: 'Kit "A3"; completo',
      unita: 'pz',
      prezzo: 95000,
      iva: 22,
    });
    // What the portal writes for Excel comes back the same — also a description that starts like a formula.
    const voci = [
      { codice: 'QM-01', descrizione: 'Quadro', unita: 'pz', prezzo: 485000, iva: 10 },
      { codice: null, descrizione: '-20 % su richiesta', unita: 'a corpo', prezzo: 5, iva: 22 },
      { codice: '=1+1', descrizione: 'Riga "strana"\tcon tab', unita: 'h', prezzo: 123456, iva: 4 },
    ];
    const csv = righeCsv(INTESTAZIONE_LISTINO, voci.map(rigaCsvDi));
    const tornato = dati(csv);
    assert.equal(tornato.errore, null);
    assert.deepEqual(tornato.errori, []);
    assert.deepEqual(
      tornato.righe.map((r) => r.data),
      voci.map((v) => ({ ...v, descrizione: v.descrizione.replace('\t', ' ') })),
    );
  });

  it('says what is wrong row by row, with the number of the row as pasted', () => {
    const lunga = 'x'.repeat(301);
    const letto = dati(
      'Codice;Descrizione;Unità;Prezzo\n' +
        'A;Prima;pz;10\n' +
        '\n' +
        `B;${lunga};pz;10\n` +
        'C;;pz;10\n' +
        'A;Doppia;pz;10\n' +
        `${'c'.repeat(31)};Codice lungo;pz;10\n` +
        `D;Unità lunga;${'u'.repeat(13)};10\n`,
    );
    assert.deepEqual(
      letto.righe.map((r) => r.riga),
      [2],
    );
    assert.deepEqual(letto.errori, [
      { riga: 4, campo: 'descrizione', codice: 'tooLong' },
      { riga: 5, campo: 'descrizione', codice: 'required' },
      { riga: 6, campo: 'codice', codice: 'duplicato' },
      { riga: 7, campo: 'codice', codice: 'tooLong' },
      { riga: 8, campo: 'unita', codice: 'tooLong' },
    ]);
  });

  it('stops at once on what cannot be a price list', () => {
    assert.equal(dati('').errore, 'vuoto');
    assert.equal(dati('  \n \n').errore, 'vuoto');
    assert.equal(dati('Descrizione;Prezzo\n').errore, 'vuoto');
    // Two columns and no titles: which one is the price is not guessed.
    assert.equal(dati('Fune;3,20\nOlio;12\n').errore, 'colonne');
    assert.equal(dati('una riga sola senza colonne').errore, 'colonne');
    assert.equal(dati('x'.repeat(MAX_TESTO_IMPORT + 1)).errore, 'troppoLungo');
    const troppe = Array.from({ length: MAX_VOCI + 1 }, (_, i) => `C${i};Voce ${i};pz;1`).join(
      '\n',
    );
    assert.equal(dati(troppe).errore, 'troppe');
    assert.equal(dati(troppe.split('\n').slice(1).join('\n')).righe.length, MAX_VOCI);
  });

  it('reads a cell with a line break inside as one cell, and counts the rows after it right', () => {
    const letto = dati(
      'Codice\tDescrizione\tUM\tPrezzo\nA\t"Riga uno\nriga due"\tpz\t5\nB\tDopo\tpz\t6\n',
    );
    assert.deepEqual(
      letto.righe.map((r) => [r.riga, r.data.descrizione]),
      [
        [2, 'Riga uno riga due'],
        [4, 'Dopo'],
      ],
    );
  });

  // The review of 13 November 2026 (Кодаджията): a price is never taken from the wrong column in silence.
  it('never takes a number for a unit: columns in another order are refused row by row', () => {
    // «Codice; Descrizione; Prezzo; IVA» without titles would give 22,00 € as the price of everything.
    const spostate = dati('A1;Porta;100;22\nA2;Finestra;50;22\n');
    assert.deepEqual(spostate.righe, []);
    assert.deepEqual(spostate.errori, [
      { riga: 1, campo: 'unita', codice: 'numero' },
      { riga: 2, campo: 'unita', codice: 'numero' },
    ]);
    // A row one cell short among whole ones: the same.
    const corta = dati('A1;Porta;pz;100;22\nA2;Finestra;50;22\n');
    assert.deepEqual(
      corta.righe.map((r) => r.riga),
      [1],
    );
    assert.deepEqual(corta.errori, [{ riga: 2, campo: 'unita', codice: 'numero' }]);
    // With titles too: «100» is not a unit of measure.
    assert.deepEqual(dati('Descrizione;UM;Prezzo\nPorta;100;22\n').errori, [
      { riga: 2, campo: 'unita', codice: 'numero' },
    ]);
  });

  it('does not choose between two columns for the same thing', () => {
    // The purchase cost and the price in the same sheet: which one is the price is not guessed.
    const due = dati('Codice;Descrizione;Costo;Prezzo\nA1;Porta;50;100\n');
    assert.equal(due.errore, 'ambigue');
    assert.equal(due.dettaglio, 'Costo, Prezzo');
    assert.deepEqual(due.righe, []);
    // One of them alone is the price.
    assert.equal(dati('Descrizione;Costo\nPorta;50\n').righe[0]!.data.prezzo, 5000);
  });

  it('reads a quoted cell after a space, and refuses a row with more cells than columns', () => {
    const spazio = dati('Codice;Prezzo;Descrizione\nA1;100; "Porta; 2 ante"\n');
    assert.deepEqual(spazio.errori, []);
    assert.equal(spazio.righe[0]!.data.descrizione, 'Porta; 2 ante');
    // A «;» inside a text without quotes moves every cell after it: the row is refused, not read wrong.
    const troppe = dati('Codice;Descrizione;UM;Prezzo\nA1;Porta; 2 ante;pz;100\nA2;Fune;m;3\n');
    assert.deepEqual(troppe.errori, [{ riga: 2, campo: 'descrizione', codice: 'troppeColonne' }]);
    assert.deepEqual(
      troppe.righe.map((r) => r.riga),
      [3],
    );
    assert.deepEqual(dati('A1;Porta;pz;100;22;altro\n').errori, [
      { riga: 1, campo: 'descrizione', codice: 'troppeColonne' },
    ]);
  });

  it('takes a VAT written as a fraction only when it is exactly a rate', () => {
    const letto = dati('Descrizione;Prezzo;IVA\nA;1;0,22\nB;1;22,0\nC;1;0,215\nD;1;0,095\n');
    assert.deepEqual(
      letto.righe.map((r) => r.data.iva),
      [22, 22],
    );
    assert.deepEqual(letto.errori, [
      { riga: 4, campo: 'iva', codice: 'option' },
      { riga: 5, campo: 'iva', codice: 'option' },
    ]);
  });

  it('gives the pasted text a fingerprint: what is confirmed is what was looked at', () => {
    const a = improntaImport('A;B;pz;1', 'pz', 22);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(improntaImport('A;B;pz;1', 'pz', 22), a);
    assert.notEqual(improntaImport('A;B;pz;2', 'pz', 22), a);
    assert.notEqual(improntaImport('A;B;pz;1', 'h', 22), a);
    assert.notEqual(improntaImport('A;B;pz;1', 'pz', 10), a);
    // The three parts cannot be moved into one another.
    assert.notEqual(improntaImport('A', 'pz\u000022', 22), improntaImport('A\u0000pz', '22', 22));
  });
});
