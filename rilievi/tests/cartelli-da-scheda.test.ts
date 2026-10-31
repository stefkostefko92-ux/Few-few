// A stop sign filled from the scheda of the lift (the owner, 30 October 2026: "usare le schede per auto
// compilare cartello di fermo impianto"): the address split into street, city and part of the building,
// the memory of what a person already corrected on the last sign of the same lift, and the text for the
// residents built from the works the scheda marks — never from a question the scheda hides.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  dividiIndirizzo,
  lavoriDi,
  testoProposto,
  valoriDaScheda,
} from '../src/cartelli/da-scheda.js';

describe('the address of the scheda', () => {
  it('splits at the last comma into street and city, without CAP and province', () => {
    assert.deepEqual(dividiIndirizzo('Via Roma 1, 20121 Milano (MI)'), {
      indirizzo: 'Via Roma 1',
      citta: 'Milano',
      ubicazione: '',
    });
    assert.deepEqual(dividiIndirizzo('Piazza Duomo, 1, Milano'), {
      indirizzo: 'Piazza Duomo, 1',
      citta: 'Milano',
      ubicazione: '',
    });
    assert.equal(
      dividiIndirizzo('Via Garibaldi 3, Sesto San Giovanni').citta,
      'Sesto San Giovanni',
    );
  });

  it('keeps it whole when what follows the comma is a number, not a city', () => {
    for (const address of [
      'Via Roma, 12',
      'Via Roma 1, 12/A',
      'Via Roma 1, 20121',
      'Corso Venezia 128',
    ])
      assert.deepEqual(dividiIndirizzo(address), { indirizzo: address, citta: '', ubicazione: '' });
    assert.deepEqual(dividiIndirizzo(null), { indirizzo: '', citta: '', ubicazione: '' });
  });

  it('takes the part of the building from the end as the place of the lift', () => {
    assert.deepEqual(dividiIndirizzo('Via Roma 1, Milano, Scala B'), {
      indirizzo: 'Via Roma 1',
      citta: 'Milano',
      ubicazione: 'Scala B',
    });
    assert.deepEqual(dividiIndirizzo('Via Roma 1, Scala B, Palazzina 2'), {
      indirizzo: 'Via Roma 1',
      citta: '',
      ubicazione: 'Scala B, Palazzina 2',
    });
  });
});

describe('the works on the scheda', () => {
  const elettrico = { tipoImpianto: ['ELETTRICO'], tipoPorte: ['AUTOMATICHE'] };

  it('become the text for the residents, in the order they read on the sign', () => {
    const text = testoProposto(
      {
        ...elettrico,
        bottoniereSostituire: true,
        quadroSostituire: true,
        arganoPreventivo: true,
        operatore: true,
        telesoccorsoInstallare: true,
        ami100: false,
      },
      '2026-11-03',
    );
    assert.equal(
      text,
      "Dal 3/11 l'impianto è fermo per lavori di ammodernamento: sostituzione del quadro di manovra, dell'argano, dei meccanismi delle porte e delle bottoniere; installazione del sistema di telesoccorso.",
    );
    assert.ok(text.length <= 600);
  });

  it('never come from a question the scheda hides', () => {
    // A hydraulic lift has no argano: a stale answer there says nothing.
    const idraulico = {
      tipoImpianto: ['IDRAULICO'],
      arganoPreventivo: true,
      centralinaDaFare: true,
    };
    assert.deepEqual(lavoriDi(idraulico), {
      sostituzione: ['della centralina'],
      installazione: [],
    });
    // Door suspensions are asked only for automatic doors.
    assert.deepEqual(lavoriDi({ tipoPorte: ['MANUALI'], sospensioni: true }).sostituzione, []);
  });

  it('leave the text empty when the scheda marks no work: no reason is invented', () => {
    assert.equal(testoProposto({ ...elettrico, quadroSostituire: false }, '2026-11-03'), '');
  });
});

describe('the values of the new sign', () => {
  const scheda = {
    tipoImpianto: ['ELETTRICO'],
    indirizzo: 'Via Roma 1, 20121 Milano (MI), Scala A',
    quadroSostituire: true,
  };

  it('come from the scheda the first time', () => {
    assert.deepEqual(valoriDaScheda(scheda, null, '2026-11-03'), {
      data: '2026-11-03',
      indirizzo: 'Via Roma 1',
      citta: 'Milano',
      ubicazione: 'Scala A',
      testo:
        "Dal 3/11 l'impianto è fermo per lavori di ammodernamento: sostituzione del quadro di manovra.",
    });
  });

  it('then from what a person wrote on the last sign of the same lift', () => {
    const values = valoriDaScheda(
      scheda,
      { indirizzo: 'Via Roma 1/3', citta: null, ubicazione: 'Scala B, ascensore di sinistra' },
      '2026-11-03',
    );
    assert.equal(values.indirizzo, 'Via Roma 1/3');
    assert.equal(values.citta, '', 'an emptied city stays empty');
    assert.equal(values.ubicazione, 'Scala B, ascensore di sinistra');
    assert.match(String(values.testo), /quadro di manovra/, 'the text is new every time');
  });
});
