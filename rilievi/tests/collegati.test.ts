import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { AUTO_KEY, COLLEGAMENTI, collegatiDelGruppo } from '../src/ordini/collegamenti.js';
import {
  discrepanzeDi,
  improntaDi,
  numeriDi,
  prefillCollegati,
  stessoValore,
} from '../src/ordini/collegati.js';
import { withPrefill } from '../src/ordini/form.js';
import { MONTANARI, PELAZZA } from '../src/ordini/moduli.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';

const t = translatorFor('it');

/**
 * A sheet with the Pelazza and Montanari forms open, as the browser sends it: the MoviLift form is on
 * the page too, hidden, and it has been filled when the page was first served.
 */
const open = {
  data: '2026-10-12',
  matricola: '33871',
  quadroMarca: 'PELAZZA',
  quadroOrdine: 'si',
  'oq-_': '1',
  'om-_': '1',
  arganoMarca: 'MONTANARI',
  arganoPreventivo: 'si',
  'pa-_': '1',
};

describe('numbers in the data the sheet and the orders share', () => {
  it('reads them the Italian way: decimal comma or dot, dotted thousands, units around them', () => {
    assert.deepEqual(numeriDi('1,6'), [1.6]);
    assert.deepEqual(numeriDi('1.6 m/s'), [1.6]);
    assert.deepEqual(numeriDi('1.000'), [1000]);
    assert.deepEqual(numeriDi('1.000,5 kg'), [1000.5]);
    assert.deepEqual(numeriDi('0.630'), [0.63]);
    assert.deepEqual(numeriDi('400/230 V'), [400, 230]);
    assert.deepEqual(numeriDi('Fermator'), []);
  });

  it('calls two values the same only when they say the same numbers', () => {
    assert.ok(stessoValore('1,0', '1'));
    assert.ok(stessoValore('1.0 m/s', '1'));
    assert.ok(stessoValore('400 Vca', '400'));
    assert.ok(stessoValore('Selcom', '  selcom '));
    assert.ok(!stessoValore('1,6', '1,0'));
    assert.ok(!stessoValore('400/230', '400'));
    assert.ok(!stessoValore('5', 'cinque'));
  });
});

describe('what disagrees between the sheet and the two forms', () => {
  it('lists the stops when the sheet and an order say different numbers, every place in order', () => {
    const found = discrepanzeDi(
      { ...open, fermate: '5', 'oq-nFermate': '6', 'pa-fermate': '5' },
      t,
    );
    assert.deepEqual(found, [
      {
        key: 'fermate',
        voci: [
          { luogo: 'scheda', valore: '5' },
          { luogo: 'oq', valore: '6' },
          { luogo: 'pa', valore: '5' },
        ],
      },
    ]);
    assert.deepEqual(discrepanzeDi({ ...open, fermate: '5', 'oq-nFermate': '5' }, t), []);
  });

  it('compares only what is shown: a closed form or a hidden field says nothing', () => {
    const closed = { ...open, quadroOrdine: 'no', fermate: '5', 'oq-nFermate': '6' };
    assert.deepEqual(discrepanzeDi(closed, t), []);
    // "Doppio accesso" comes with the door type: before one is ticked it says nothing.
    const noDoors = { ...open, doppioAccesso: 'si', 'oq-nAccessi': '1' };
    assert.deepEqual(discrepanzeDi(noDoors, t), []);
    const manual = { ...noDoors, tipoPorte: ['MANUALI'], 'oq-porteManuali': 'si' };
    assert.deepEqual(
      discrepanzeDi(manual, t).map((d) => d.key),
      ['accessi'],
      'asked with manual doors too',
    );
    const automatic = { ...noDoors, tipoPorte: ['AUTOMATICHE'] };
    assert.deepEqual(discrepanzeDi({ ...automatic, 'oq-porteAutomatiche': 'si' }, t), [
      {
        key: 'accessi',
        voci: [
          { luogo: 'scheda', valore: '2' },
          { luogo: 'oq', valore: '1' },
        ],
      },
    ]);
    assert.deepEqual(discrepanzeDi({ ...automatic, 'oq-nAccessi': '2' }, t), []);
  });

  it('calls the boxes different only when they have nothing in common', () => {
    assert.deepEqual(discrepanzeDi({ ...open, 'oq-tq2Velocita': 'si', 'pa-vvvf': 'si' }, t), [
      {
        key: 'tipoVelocita',
        voci: [
          { luogo: 'oq', valore: '2 Velocità' },
          { luogo: 'pa', valore: 'VVVF' },
        ],
      },
    ]);
    assert.deepEqual(discrepanzeDi({ ...open, 'oq-tqVvvfChiuso': 'si', 'pa-vvvf': 'si' }, t), []);
    // EN 81-1 exists only on the Montanari form: against EN 81-20 it is another standard.
    const norme = discrepanzeDi({ ...open, 'oq-normaEn8120': 'si', 'pa-normaEn811': 'si' }, t);
    assert.deepEqual(
      norme.map((d) => d.key),
      ['norma'],
    );
    // "Laterale" is only on the Montanari form: it says nothing about high or low.
    const side = { ...open, ubicazioneMacchina: ['ALTO'], 'pa-macchinaLaterale': 'si' };
    assert.deepEqual(discrepanzeDi(side, t), []);
    const low = discrepanzeDi({ ...side, 'pa-macchinaBasso': 'si' }, t);
    assert.deepEqual(low, [
      {
        key: 'macchina',
        voci: [
          { luogo: 'scheda', valore: t('scheda.option.ubicazioneMacchina.ALTO') },
          { luogo: 'pa', valore: 'IN BASSO' },
        ],
      },
    ]);
  });

  it('compares the speed, the travel and the motor and brake voltages of the two orders', () => {
    const found = discrepanzeDi(
      {
        ...open,
        'oq-velocita': '1,0',
        'pa-velocita': '1.6',
        'oq-corsa': '12',
        'pa-corsa': '12,0',
        'oq-motVca': '400',
        'pa-motoreVoltaggio': '400 V',
        'oq-circuitoFrenoVcc': '48',
        'pa-frenoVoltaggio': '180',
      },
      t,
    );
    assert.deepEqual(
      found.map((d) => d.key),
      ['velocita', 'tensioneFreno'],
    );
  });

  it('never takes an inherited key for an answer (a tampered form)', () => {
    const forged = {
      ...open,
      tipoPorte: ['AUTOMATICHE'],
      doppioAccesso: 'constructor',
      'oq-nAccessi': '2',
    };
    assert.deepEqual(discrepanzeDi(forged, t), []);
    assert.equal(prefillCollegati('oq', forged).nAccessi, undefined);
  });

  it('fingerprints exactly these differences', () => {
    const one = discrepanzeDi({ ...open, fermate: '5', 'oq-nFermate': '6' }, t);
    const same = discrepanzeDi({ ...open, fermate: '5', 'oq-nFermate': '6' }, t);
    const other = discrepanzeDi({ ...open, fermate: '5', 'oq-nFermate': '7' }, t);
    assert.match(improntaDi(one), /^[0-9a-f]{32}$/);
    assert.equal(improntaDi(one), improntaDi(same));
    assert.notEqual(improntaDi(one), improntaDi(other));
  });
});

describe('filling a form from the sheet and from the other form', () => {
  it('takes what the sheet says first, then the other form', () => {
    const valori = prefillCollegati('pa', {
      ...open,
      fermate: '5',
      portataKg: '630',
      'oq-nFermate': '6',
      'oq-velocita': '1,0',
      'oq-corsa': '12',
      'oq-motVca': '400',
      'oq-circuitoFrenoVcc': '48',
      'oq-tq2Velocita': 'si',
      'oq-normaEn8120': 'si',
    });
    assert.deepEqual(valori, {
      fermate: '5',
      velocita: '1,0',
      ac2: true,
      corsa: '12',
      portata: '630',
      normaEn8120: true,
      motoreVoltaggio: '400',
      frenoVoltaggio: '48',
    });
  });

  it('ticks a box only when exactly one box means it', () => {
    assert.deepEqual(prefillCollegati('oq', { ...open, 'pa-vvvf': 'si' }), {});
    assert.deepEqual(prefillCollegati('oq', { ...open, 'pa-ac1': 'si' }), { tq1Velocita: true });
  });

  it('takes nothing from a closed form or a hidden field', () => {
    const closed = { ...open, arganoPreventivo: 'no', 'pa-velocita': '1,6' };
    assert.deepEqual(prefillCollegati('oq', closed), {});
    assert.deepEqual(prefillCollegati('oq', { ...open, doppioAccesso: 'si' }), {}, 'no door type');
    const manual = { ...open, tipoPorte: ['MANUALI'], doppioAccesso: 'si' };
    assert.deepEqual(prefillCollegati('oq', manual), { porteManuali: true, nAccessi: '2' });
  });
});

describe('a form that comes back (an error, the confirmation)', () => {
  it('keeps as following only the linked fields the browser says still follow', () => {
    const ctx = {
      azienda: 'Prova',
      utente: 'Prova',
      ruolo: 'Tecnico',
      email: 'p@rilievi.test',
      etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
    };
    const { auto } = withPrefill(
      { ...open, [AUTO_KEY]: 'oq-nFermate pa-ac2 oq-cliente oq-nonEsiste fermate' },
      ctx,
    );
    assert.deepEqual([...auto].sort(), ['oq-nFermate', 'pa-ac2']);
  });
});

describe('the linked data themselves', () => {
  it('name every linked datum and every place in the dictionary', () => {
    for (const link of COLLEGAMENTI) {
      assert.notEqual(t(`collegati.${link.key}`), `collegati.${link.key}`, link.key);
    }
    for (const luogo of ['scheda', 'oq', 'om', 'pa']) {
      assert.notEqual(t(`collegati.luogo.${luogo}`), `collegati.luogo.${luogo}`);
    }
  });

  it('put the list of differences under the group of the form where the field is', () => {
    const groupOf = (titolo: string, modulo: typeof PELAZZA | typeof MONTANARI) => {
      const group = modulo.gruppi.find((g) => g.titolo === titolo);
      assert.ok(group, titolo);
      return group.righe.flatMap((row) => row.campi.map((field) => field.key));
    };
    assert.deepEqual(collegatiDelGruppo('oq', groupOf('Porte', PELAZZA)), [
      'fermate',
      'velocita',
      'corsa',
      'porte',
      'accessi',
    ]);
    assert.deepEqual(collegatiDelGruppo('pa', groupOf('Motore & freno', MONTANARI)), [
      'tipoVelocita',
      'tensioneMotore',
      'tensioneFreno',
    ]);
    assert.deepEqual(collegatiDelGruppo('oq', groupOf('Accessori', PELAZZA)), []);
  });
});

describe('the orders in the sheet print', () => {
  const ordine = {
    modulo: PELAZZA.id,
    valori: { ordine: true, velocita: '1,0', nFermate: '5', note: 'Consegna in cantiere' },
  };
  const scheda = {
    riepilogoOrdini: true,
    quadroMarca: 'PELAZZA' as const,
    quadroOrdine: true,
    ordineQuadro: ordine,
    arganoMarca: 'MONTANARI' as const,
    arganoPreventivo: false,
    preventivoArgano: { modulo: MONTANARI.id, valori: { mrl: true } },
  };

  it('come in only when the sheet asks for them, with what is filled in', () => {
    assert.deepEqual(riepilogoModuli({ ...scheda, riepilogoOrdini: false }), []);
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        titolo: PELAZZA.titolo,
        fornitore: PELAZZA.fornitore,
        gruppi: [
          { titolo: 'Intestazione', spunte: ['ORDINE'], testi: [] },
          {
            titolo: 'Porte',
            spunte: [],
            testi: [
              { label: 'Velocità m/s', value: '1,0' },
              { label: 'N° Fermate', value: '5' },
            ],
          },
          {
            titolo: 'Consegna e note',
            spunte: [],
            testi: [{ label: 'NOTE', value: 'Consegna in cantiere' }],
          },
        ],
      },
    ]);
  });
});
