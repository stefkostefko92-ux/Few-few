// Rilievi — MoviLift's panel order, ported from rilievi's tests/movilift.test.ts (commit ae6329cb6), the pure part: it
// opens only for its make, with the answers of the blank form, the survey and the linked data; its lists take an option
// by its word or by its numbers; it carries the Pelazza order's data over when the make changes and is compared with the
// sheet, never with what is left of a Pelazza order; it keeps only its own options; it comes into the sheet's print with
// its choices as the paper words them. The PDF: src/server/__tests__/rilievi-moduli.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fieldByKey } from '@/lib/rilievi/fields';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { discrepanzeDi, prefillCollegati } from '@/lib/rilievi/ordini/collegati';
import { MOVILIFT, PELAZZA } from '@/lib/rilievi/ordini/moduli';
import { opzioneDi } from '@/lib/rilievi/ordini/opzioni';
import { prefillValori } from '@/lib/rilievi/ordini/prefill';
import { marcheOf } from '@/lib/rilievi/ordini/registry';
import { riepilogoModuli } from '@/lib/rilievi/ordini/riepilogo';
import { parseModulo, storedValori } from '@/lib/rilievi/ordini/valori';
import { parseScheda } from '@/lib/rilievi/validation';

const t = rilieviTranslator();

describe('the MoviLift order form', () => {
  it('opens under the question of the panel order only for its own make', () => {
    assert.deepEqual(marcheOf('quadroOrdine'), ['PELAZZA', 'MOVILIFT']);
    assert.deepEqual(fieldByKey('quadroOrdine')?.when?.values, marcheOf('quadroOrdine'));
    // the argano sheet and the 2SG sheet are for every make: their questions have no condition
    for (const question of ['arganoPreventivo', 'sospensioni'] as const) {
      assert.deepEqual(marcheOf(question), [], question);
      assert.equal(fieldByKey(question)?.when, undefined, question);
    }
  });
});

describe('prefilling the MoviLift order', () => {
  const ctx = {
    values: {
      data: '2026-10-12', numeroImpianto: '104552', indirizzo: 'Via Verdi 14, Milano', portataKg: '630', capienzaPersone: '8', fermate: '6',
      tipoImpianto: ['ELETTRICO', 'GEARLESS'], tipoPorte: ['AUTOMATICHE'], operatoreMarca: 'Selcom', operatoreTensione: '24 V DC', doppioAccesso: 'si',
      ubicazioneMacchina: ['BASSO'],
      // hidden with automatic doors: says nothing
      pattinoRetrattile: 'si',
    },
    azienda: 'Ascensori Rossi Srl',
    utente: 'Mario Bianchi',
    ruolo: 'Tecnico',
    email: 'mario@example.it',
    etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
  };

  it('opens with the answers of the blank form, the survey and the linked data', () => {
    assert.deepEqual(prefillValori(MOVILIFT, ctx), {
      // the blank form
      controllo: 'scheda', fornitura: 'soloQuadro', alimentazioneA: 'conLimiti', pianoB1: '-', interpianiStandard: true, armadio: 'standard', anta: 'sx',
      uscita: 'poloPiano', comune: 'neg', combinatore: 'predisposizione',
      // the survey and the person writing
      riferimento: 'N° 104552 — Via Verdi 14, Milano', ragioneSociale: 'Ascensori Rossi Srl', email: 'mario@example.it', tipologia: 'Elettrico, MRL',
      tipoPorte: 'Automatiche', marcaOpA: 'SELCOM', voltA: '24Vcc',
      // the plant data, over the blank form («Operatore Unico», «Loc. Macc. in ALTO»)
      fermate: '6', portata: '630', capienza: '8', nImpianto: '104552', ingressi: 'doppio', locMacc: 'basso',
    });
  });

  it('takes nothing from a hidden field of the survey', () => {
    const valori = prefillValori(MOVILIFT, { ...ctx, values: { ...ctx.values, tipoPorte: ['MANUALI'], ubicazioneMacchina: [] } });
    assert.equal(valori.marcaOpA, undefined, 'no door operator with manual doors');
    assert.equal(valori.voltA, undefined);
    assert.equal(valori.ingressi, 'doppio', 'the double entrance is asked with manual doors too');
    assert.equal(valori.locMacc, 'alto');
    assert.equal(valori.elettrPattino, true, 'the retractable skate is asked with manual doors');
  });

  it('picks a list option by its word, or by its numbers when only one option has them', () => {
    const volt = ['24Vcc', '48Vcc', '96Vca', '125Vca', '220mono', '220tri'];
    assert.equal(opzioneDi(['2SG', 'SELCOM'], ' Selcom '), 'SELCOM');
    assert.equal(opzioneDi(volt, '24 V DC'), '24Vcc');
    assert.equal(opzioneDi(volt, '220 tri'), '220tri');
    assert.equal(opzioneDi(volt, '220 V'), null, 'mono or three-phase: not for us to guess');
    assert.equal(opzioneDi(volt, '230 V'), null);
    assert.equal(opzioneDi(volt, ''), null);
  });
});

describe('the MoviLift order among the linked data', () => {
  const movilift = { quadroMarca: 'MOVILIFT', quadroOrdine: 'si', 'om-_': '1' };

  it('takes the entrances and the machine room from the sheet, a radio only from one answer', () => {
    assert.deepEqual(prefillCollegati('om', { ...movilift, tipoPorte: ['AUTOMATICHE'], doppioAccesso: 'no', ubicazioneMacchina: ['ALTO', 'BASSO'] }), { ingressi: 'unico' });
  });

  it('carries the plant data of the Pelazza order over when the panel becomes a MoviLift', () => {
    const pelazza = { quadroMarca: 'PELAZZA', quadroOrdine: 'si', 'oq-nFermate': '7', 'oq-velocita': '1,6', 'oq-corsa': '21', 'oq-motVca': '400' };
    assert.deepEqual(prefillCollegati('om', pelazza), { fermate: '7', velocita: '1,6', corsa: '21', tensFune: '400' });
  });

  it('compares it with the sheet, never with what is left of a Pelazza order', () => {
    const values = { ...movilift, fermate: '5', 'om-fermate': '6', 'oq-nFermate': '9', tipoPorte: ['AUTOMATICHE'], doppioAccesso: 'si', 'om-ingressi': 'unico' };
    assert.deepEqual(discrepanzeDi(values, t), [
      { key: 'fermate', voci: [{ luogo: 'scheda', valore: '5' }, { luogo: 'om', valore: '6' }] },
      { key: 'ingressi', voci: [{ luogo: 'scheda', valore: '2' }, { luogo: 'om', valore: 'Operatore Unico' }] },
    ]);
    // a selected double entrance is still a double entrance
    assert.deepEqual(discrepanzeDi({ ...values, 'om-fermate': '5', 'om-ingressi': 'doppioSelezionato' }, t), []);
  });
});

describe('saving the MoviLift order', () => {
  it('keeps only the options of its radio groups and lists', () => {
    const ok = parseModulo(MOVILIFT, 'om', { 'om-controllo': 'plc', 'om-voltA': '48Vcc', 'om-pianoA1': 'S1', 'om-interpianiStandard': 'si' });
    assert.deepEqual(ok.errors, {});
    assert.deepEqual(ok.dati, { modulo: MOVILIFT.id, valori: { controllo: 'plc', voltA: '48Vcc', pianoA1: 'S1', interpianiStandard: true } });
    const forged = parseModulo(MOVILIFT, 'om', { 'om-controllo': 'constructor', 'om-voltA': '380V', 'om-pianoA1': 'ABC' });
    assert.deepEqual(forged.errors, { 'om-controllo': 'option', 'om-voltA': 'option', 'om-pianoA1': 'tooLong' });
  });

  it('reads back only its own JSON, never the Pelazza order stored in the same column', () => {
    assert.equal(storedValori(MOVILIFT, { modulo: PELAZZA.id, valori: { note: 'x' } }), null);
    assert.deepEqual(storedValori(MOVILIFT, { modulo: MOVILIFT.id, valori: { controllo: 'plc', voltA: '999', note: 'ok', interpianiStandard: true } }), { controllo: 'plc', note: 'ok', interpianiStandard: true });
  });

  it('is the order of the sheet for a MoviLift panel, and the Pelazza one for a Pelazza panel', () => {
    const both = { data: '2026-10-12', matricola: '33871', quadroOrdine: 'si', 'oq-_': '1', 'oq-nFermate': '6', 'om-_': '1', 'om-fermate': '6', 'om-controllo': 'plc' };
    const movilift = parseScheda({ ...both, quadroMarca: 'MOVILIFT' });
    assert.ok(movilift.ok);
    assert.deepEqual(movilift.ok && movilift.data.ordineQuadro, { modulo: MOVILIFT.id, valori: { fermate: '6', controllo: 'plc' } });
    const pelazza = parseScheda({ ...both, quadroMarca: 'PELAZZA' });
    assert.ok(pelazza.ok);
    assert.deepEqual(pelazza.ok && pelazza.data.ordineQuadro, { modulo: PELAZZA.id, valori: { nFermate: '6' } });
  });

  it('comes into the sheet print with its choices as the paper words them', () => {
    const scheda = {
      riepilogoOrdini: true,
      quadroMarca: 'MOVILIFT' as const,
      quadroOrdine: true,
      // «-» is the blank form's own text on side B: not written by anyone, not printed
      ordineQuadro: { modulo: MOVILIFT.id, valori: { controllo: 'scheda', fornitura: 'soloQuadro', fermate: '6', marcaOpA: 'SELCOM', pianoB1: '-' } },
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      ordineSospensioni: null,
    };
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        nome: 'Modulo ordine quadro (Scelta v2.6) · MoviLift',
        gruppi: [
          { titolo: 'Impianto', spunte: ['Solo Quadro'], testi: [{ label: 'Fermate', value: '6' }, { label: 'Controllo', value: 'SCHEDA' }] },
          { titolo: 'Varie', spunte: [], testi: [{ label: 'Marca Op (lato A)', value: 'SELCOM' }] },
        ],
      },
    ]);
    assert.deepEqual(riepilogoModuli({ ...scheda, quadroMarca: 'PELAZZA' }), []);
  });
});
