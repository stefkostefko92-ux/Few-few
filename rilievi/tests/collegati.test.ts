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
import { ARGANI, PELAZZA } from '../src/ordini/moduli.js';
import { SLOTS } from '../src/ordini/registry.js';

const t = translatorFor('it');

/**
 * A sheet with the Pelazza order and the argano sheet open, as the browser sends it: the MoviLift and
 * the two Mastech forms are on the page too, hidden, and they have been filled when the page was first
 * served.
 */
const open = {
  data: '2026-10-12',
  matricola: '33871',
  quadroMarca: 'PELAZZA',
  quadroOrdine: 'si',
  'oq-_': '1',
  'om-_': '1',
  'mn-_': '1',
  'mq-_': '1',
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
    const found = discrepanzeDi({ ...open, fermate: '5', 'oq-nFermate': '6', 'pa-piani': '5' }, t);
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
    assert.deepEqual(
      discrepanzeDi({ ...open, 'oq-tq2Velocita': 'si', 'pa-motoreInverter': 'si' }, t),
      [
        {
          key: 'tipoVelocita',
          voci: [
            { luogo: 'oq', valore: '2 Velocità' },
            { luogo: 'pa', valore: 'Inverter' },
          ],
        },
      ],
    );
    assert.deepEqual(
      discrepanzeDi({ ...open, 'oq-tqVvvfChiuso': 'si', 'pa-motoreInverter': 'si' }, t),
      [],
    );
    // The argano sheet writes the machine room as words: filled from the survey, never compared.
    const words = { ...open, ubicazioneMacchina: ['ALTO'], 'pa-macchina': 'Basso' };
    assert.deepEqual(discrepanzeDi(words, t), []);
  });

  it('compares the speed, the travel and the brake voltage of the order and the argano sheet', () => {
    const found = discrepanzeDi(
      {
        ...open,
        'oq-velocita': '1,0',
        'pa-velocita': '1.6',
        'oq-corsa': '12',
        'pa-corsa': '12,0',
        'oq-circuitoFrenoVcc': '48',
        'pa-tensioneFreno': '180',
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
      funiTrefoli: '8',
    });
    // The motor voltage of the panel is not on the argano sheet: it stays where it is.
    assert.deepEqual(valori, {
      matricola: '33871',
      piani: '5',
      velocita: '1,0',
      motoreAc2: true,
      corsa: '12',
      portata: '630',
      tensioneFreno: '48',
      trefoli: '8',
    });
  });

  it('ticks a box only when exactly one box means it', () => {
    assert.deepEqual(prefillCollegati('oq', { ...open, 'pa-motoreInverter': 'si' }), {});
    assert.deepEqual(prefillCollegati('oq', { ...open, 'pa-motoreAc1': 'si' }), {
      tq1Velocita: true,
    });
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
  const ctx = {
    azienda: 'Prova',
    utente: 'Prova',
    ruolo: 'Tecnico',
    email: 'p@rilievi.test',
    etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
  };

  it('keeps as following only the fields the browser says still follow, of the sheet or a form', () => {
    // Linked fields, a survey field of a form, a field of the sheet filled from a form: they follow.
    // A name the form does not have, or a field that never follows, is dropped.
    const { auto } = withPrefill(
      {
        ...open,
        'sg-_': '1',
        'so-_': '1',
        [AUTO_KEY]: 'oq-nFermate pa-motoreAc2 oq-cliente oq-nonEsiste fermate oq-note buonoLavoro',
      },
      ctx,
    );
    assert.deepEqual([...auto].sort(), ['fermate', 'oq-cliente', 'oq-nFermate', 'pa-motoreAc2']);
  });

  it('keeps empty a survey field emptied in a filled form, not one that had nothing to take', () => {
    const { values, scritti } = withPrefill(
      {
        ...open,
        quadroMarca: 'MOVILIFT',
        tipoImpianto: ['GEARLESS'],
        // Emptied by hand: the company, and the kind of lift the sheet calls "Gearless" (MRL).
        'om-ragioneSociale': '',
        'om-tipologia': '',
        // Written by hand.
        'om-riferimento': 'Commessa 77',
        // Nothing to take: the sheet has no kind of doors ticked.
        'om-tipoPorte': '',
      },
      ctx,
    );
    const movilift = [...scritti].filter((name) => name.startsWith('om-')).sort();
    assert.deepEqual(movilift, ['om-ragioneSociale', 'om-tipologia']);
    assert.equal(values['om-ragioneSociale'], '', 'nothing is put back');
    assert.equal(values['om-riferimento'], 'Commessa 77');
    // A form opened for the first time is filled, nothing in it is "emptied".
    const { values: first, scritti: none } = withPrefill(
      { data: '2026-10-12', matricola: '33871', quadroMarca: 'MOVILIFT', quadroOrdine: 'si' },
      ctx,
    );
    assert.equal(first['om-ragioneSociale'], 'Prova');
    assert.deepEqual([...none], []);
  });
});

describe('the linked data themselves', () => {
  it('name every linked datum and every place in the dictionary', () => {
    for (const link of COLLEGAMENTI) {
      assert.notEqual(t(`collegati.${link.key}`), `collegati.${link.key}`, link.key);
    }
    for (const luogo of ['scheda', ...SLOTS.map((slot) => slot.prefix)]) {
      assert.notEqual(t(`collegati.luogo.${luogo}`), `collegati.luogo.${luogo}`);
    }
  });

  it('put the list of differences under the group of the form where the field is', () => {
    const groupOf = (titolo: string, modulo: typeof PELAZZA | typeof ARGANI) => {
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
      'servizi',
    ]);
    assert.deepEqual(collegatiDelGruppo('pa', groupOf('Motore', ARGANI)), [
      'tipoVelocita',
      'tensioneFreno',
      'correnteMotore',
      'giriMotore',
      'poli',
      'potenzaMotore',
    ]);
    assert.deepEqual(collegatiDelGruppo('pa', groupOf('Trazione e funi', ARGANI)), [
      'funiNumero',
      'funiDiametro',
      'funiTrefoli',
      'diametroPuleggia',
      'rapportoRiduzione',
    ]);
    assert.deepEqual(collegatiDelGruppo('oq', groupOf('Accessori', PELAZZA)), []);
  });
});
