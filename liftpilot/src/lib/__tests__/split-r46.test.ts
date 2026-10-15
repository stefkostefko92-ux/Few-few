// Round 46 S2: the table of which parts each check concerns (ambito.ts) and the parts' obligations (obblighi.ts) moved
// out of collaudo.ts and norme-collaudo.ts, which re-export the same objects — every importer reads what it read; the
// skeleton of the variations' rows (report/variazioni.ts) prints nothing without a change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ambito from '../lift/ambito';
import * as collaudo from '../lift/collaudo';
import * as lift from '../lift';
import * as obblighi from '../lift/obblighi';
import * as norme from '../lift/norme-collaudo';
import { variazioniNota, variazioniRows } from '../report/variazioni';

test('collaudo.ts e index.ts riesportano le tabelle di ambito.ts', () => {
  assert.equal(collaudo.AMBITO_VERIFICHE, ambito.AMBITO_VERIFICHE);
  assert.equal(lift.AMBITO_VERIFICHE, ambito.AMBITO_VERIFICHE);
  assert.equal(collaudo.SOLO_10411_1, ambito.SOLO_10411_1);
  assert.equal(collaudo.VERIFICHE_DATI, ambito.VERIFICHE_DATI);
});

test('norme-collaudo.ts riesporta gli obblighi di obblighi.ts', () => {
  assert.equal(norme.OBBLIGHI_PARTI, obblighi.OBBLIGHI_PARTI);
  assert.equal(norme.obblighiParti, obblighi.obblighiParti);
  assert.equal(norme.SOSTANZIALE, obblighi.SOSTANZIALE);
  assert.equal(lift.SOSTANZIALE, obblighi.SOSTANZIALE);
  // the points keep the source they were read on
  assert.ok(Object.values(obblighi.OBBLIGHI_PARTI['10411-1']).every((p) => p?.stato === 'confermato' && p.fonte?.startsWith('testo della norma, letto il 2026-10-06')));
});

test('variazioni: senza variazioni nessuna riga e nessuna frase', () => {
  assert.deepEqual(variazioniRows([]), []);
  assert.equal(variazioniNota([]), '');
  assert.deepEqual(variazioniRows([{ voce: 'corsa', text: 'x' }]), [['Corsa del primo collaudo · variazione', 'x']]);
  assert.equal(variazioniNota([{ voce: 'velocita', text: 'a.' }, { voce: 'corsa', text: 'b.' }]), ' a. b.');
});
