import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FIELDS, SECTIONS } from '../src/schede/fields.js';
import { SEZIONE_CENTRALINA } from '../src/schede/fields-centralina.js';
import { formValuesFromBody, parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-12', matricola: '33871' };

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

describe('the field list', () => {
  it('keeps the sections in the order of the printed sheet the owner marked up (October 2026)', () => {
    // Section 1 is laid out like the head and the plate of the sheet: date, address and work order,
    // matricola and lift number, then load, persons, stops and make. The power unit of a hydraulic
    // lift stands where its machine would; the emergency call is with the alarm, the porter's lodge
    // last; every section with a supplier form ends with its notes. 24 October 2026: is the panel to
    // replace, the stop of the argano, the brake shoes gone, the operator after the suspensions, and
    // the push-button panels in a section of their own.
    assert.deepEqual(
      SECTIONS.map((section) => section.key),
      [
        'impianto',
        'ubicazione',
        'tipologia',
        'quadro',
        'argano',
        'centralina',
        'funi',
        'limitatore',
        'cavi',
        'serrature',
        'allarme',
        'bottoniere',
        'note',
      ],
    );
    assert.deepEqual(
      FIELDS.map((field) => field.key),
      [
        'data',
        'indirizzo',
        'buonoLavoro',
        'matricola',
        'numeroImpianto',
        'portataKg',
        'capienzaPersone',
        'fermate',
        'marca',
        'ubicazioneMacchina',
        'ubicazioneCassettina',
        'parcheggio',
        'tipoImpianto',
        'tipoPorte',
        'doppioAccesso',
        'quadroSostituire',
        'quadroMarca',
        'quadroMarcaAltro',
        'quadroModello',
        'fossaRidotta',
        'testataRidotta',
        'ami100',
        'ami100Tipo',
        'quadroOrdine',
        'quadroNote',
        'arganoPreventivo',
        'arganoTipo',
        'kitControlloGanasce',
        'kitControlloGanasceTipo',
        'controlloQuadro',
        'controlloQuadroTipo',
        'stopArgano',
        'arganoNote',
        ...SEZIONE_CENTRALINA.fields.map((field) => field.key),
        'funiDiametroMm',
        'funiTrefoli',
        'funiNumero',
        'funiLunghezzaM',
        'tirantiCabinaNumero',
        'tirantiCabinaTipo',
        'tirantiContrappesoNumero',
        'tirantiContrappesoTipo',
        'tirantiFossaNumero',
        'tirantiFossaTipo',
        'limitatoreTipo',
        'funicellaDiametroMm',
        'funicellaLunghezzaM',
        'tenditore',
        'caviNumero',
        'caviConduttori',
        'caviLunghezzaM',
        'serrature',
        'serratureNumero',
        'serratureTipo',
        'pattinoRetrattile',
        'pattinoRetrattileTipo',
        'sospensioni',
        'sospensioniNumero',
        'operatore',
        'serratureNote',
        'telesoccorsoInstallare',
        'perifericaInstallare',
        'cornettaInstallare',
        'allarmePortineria',
        'displayPortineria',
        'bottoniereSostituire',
        'bottoniereNote',
        'noteQuadretto',
        'noteImpianto',
        'luceVanoSostituire',
        'luceVanoNote',
        'noteBottoniere',
        'bottoniereMisure',
        'lavoriExtra',
      ],
    );
  });

  it('gives every number a kind the brief asked for: the identifiers are digits, never numbers', () => {
    const kind = (key: string) => FIELDS.find((field) => field.key === key)?.kind;
    assert.equal(kind('matricola'), 'digits');
    assert.equal(kind('numeroImpianto'), 'digits');
    assert.equal(kind('indirizzo'), 'text');
    assert.equal(kind('ubicazioneCassettina'), 'text', 'where the box is, in words');
    for (const key of ['ubicazioneMacchina', 'tipoImpianto', 'tipoPorte']) {
      assert.equal(kind(key), 'checks');
    }
    assert.equal(kind('serrature'), 'yesno');
  });
});

describe('parseScheda', () => {
  it('accepts a minimal sheet: a date and one identifier', () => {
    const data = parsedOrFail(minimal);
    assert.equal(data.data.toISOString(), '2026-10-12T00:00:00.000Z');
    assert.equal(data.matricola, '33871');
    assert.equal(data.indirizzo, null);
    assert.deepEqual(data.tipoImpianto, []);
    assert.equal(data.serrature, null);
  });

  it('refuses a sheet that could never be found again (no address, matricola or number)', () => {
    const result = parseScheda({ data: '2026-10-12', marca: 'Otis' });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.errors.identifiers, 'identifierNeeded');
  });

  it('keeps leading zeros in the identifiers and drops spaces', () => {
    const data = parsedOrFail({
      data: '2026-10-12',
      matricola: ' 0033 871 ',
      numeroImpianto: '000104552',
    });
    assert.equal(data.matricola, '0033871');
    assert.equal(data.numeroImpianto, '000104552');
  });

  it('refuses letters and symbols in the identifiers', () => {
    for (const value of ['MI 123', '123/98', '12-3', '1e5']) {
      const result = parseScheda({ data: '2026-10-12', matricola: value });
      assert.equal(!result.ok && result.errors.matricola, 'digitsOnly', value);
    }
  });

  it('reads decimals with a comma or a dot, at most two places, and stores them exactly', () => {
    const data = parsedOrFail({ ...minimal, funiDiametroMm: '10,5', funiLunghezzaM: '42.75' });
    assert.equal(data.funiDiametroMm, '10.50');
    assert.equal(data.funiLunghezzaM, '42.75');
    const many = parseScheda({ ...minimal, funiDiametroMm: '6,555' });
    assert.equal(!many.ok && many.errors.funiDiametroMm, 'decimalPlaces');
    const thousands = parseScheda({ ...minimal, funiLunghezzaM: '1.250,5' });
    assert.equal(!thousands.ok && thousands.errors.funiLunghezzaM, 'decimal');
  });

  it('checks whole numbers and their range, never below zero', () => {
    assert.equal(parsedOrFail({ ...minimal, portataKg: '630' }).portataKg, 630);
    const letter = parseScheda({ ...minimal, portataKg: '63O' });
    assert.equal(!letter.ok && letter.errors.portataKg, 'integer');
    const negative = parseScheda({ ...minimal, fermate: '-2' });
    assert.equal(!negative.ok && negative.errors.fermate, 'integer');
    const huge = parseScheda({ ...minimal, capienzaPersone: '5000' });
    assert.equal(!huge.ok && huge.errors.capienzaPersone, 'range');
  });

  it('keeps the ticked boxes in the brief order without repeats and refuses unknown values', () => {
    const data = parsedOrFail({ ...minimal, ubicazioneMacchina: ['BASSO', 'ALTO', 'BASSO'] });
    assert.deepEqual(data.ubicazioneMacchina, ['ALTO', 'BASSO']);
    assert.deepEqual(parsedOrFail({ ...minimal, ubicazioneMacchina: 'ALTO' }).ubicazioneMacchina, [
      'ALTO',
    ]);
    const unknown = parseScheda({ ...minimal, tipoImpianto: 'A_VAPORE' });
    assert.equal(!unknown.ok && unknown.errors.tipoImpianto, 'option');
  });

  it('takes one kind of lift and one kind of doors, kept as a list of one', () => {
    const one = parsedOrFail({ ...minimal, tipoImpianto: 'GEARLESS', tipoPorte: ['MANUALI'] });
    assert.deepEqual([one.tipoImpianto, one.tipoPorte], [['GEARLESS'], ['MANUALI']]);
    const repeated = parsedOrFail({ ...minimal, tipoPorte: ['MANUALI', 'MANUALI'] });
    assert.deepEqual(repeated.tipoPorte, ['MANUALI']);
    for (const key of ['tipoImpianto', 'tipoPorte'] as const) {
      const two = key === 'tipoImpianto' ? ['ELETTRICO', 'GEARLESS'] : ['AUTOMATICHE', 'MANUALI'];
      const result = parseScheda({ ...minimal, [key]: two });
      assert.equal(!result.ok && result.errors[key], 'option', `${key}: a page from before`);
    }
  });

  it('keeps the number and type of locks only when "Serrature" is yes', () => {
    const yes = parsedOrFail({
      ...minimal,
      tipoPorte: 'MANUALI',
      serrature: 'si',
      serratureNumero: '6',
      serratureTipo: 'A gancio',
    });
    assert.equal(yes.serrature, true);
    assert.equal(yes.serratureNumero, 6);
    assert.equal(yes.serratureTipo, 'A gancio');
    const no = parsedOrFail({
      ...minimal,
      tipoPorte: 'MANUALI',
      serrature: 'no',
      serratureNumero: '6',
      serratureTipo: 'A gancio',
    });
    assert.equal(no.serrature, false);
    assert.equal(no.serratureNumero, null);
    assert.equal(no.serratureTipo, null);
    assert.equal(parsedOrFail({ ...minimal, serratureNumero: '3' }).serratureNumero, null);
  });

  it('requires a real calendar date in a sane range', () => {
    for (const value of ['', '2026-02-30', '12/10/2026', '1900-01-01', '2026-13-01']) {
      const result = parseScheda({ ...minimal, data: value });
      assert.equal(result.ok, false, value);
    }
  });

  it('cleans text: single lines collapse spaces, notes keep their line breaks, control characters go', () => {
    const data = parsedOrFail({
      ...minimal,
      indirizzo: '  Via   Roma\t12 ',
      ubicazioneCassettina: ' Piano -1,  vano contatori ',
      noteImpianto: 'Riga uno\r\nRiga due\u0007  ',
    });
    assert.equal(data.indirizzo, 'Via Roma 12');
    assert.equal(data.ubicazioneCassettina, 'Piano -1, vano contatori');
    assert.equal(data.noteImpianto, 'Riga uno\nRiga due');
  });

  it('refuses text over the limit and arrays where a single value belongs (forged forms)', () => {
    const long = parseScheda({ ...minimal, marca: 'x'.repeat(121) });
    assert.equal(!long.ok && long.errors.marca, 'tooLong');
    const forged = parseScheda({ ...minimal, indirizzo: ['Via Roma', 'Via Milano'] });
    assert.equal(!forged.ok && forged.errors.indirizzo, 'invalid');
  });
});

describe('formValuesFromBody', () => {
  it('returns strings and string lists only, whatever the body holds', () => {
    const values = formValuesFromBody({ indirizzo: ['a'], tipoPorte: 'MANUALI', fermate: 5 });
    assert.equal(values.indirizzo, '');
    assert.deepEqual(values.tipoPorte, ['MANUALI']);
    assert.equal(values.fermate, '');
  });
});

describe('all errors at once', () => {
  it('reports the missing identifier together with the field errors', () => {
    const result = parseScheda({ data: '2026-10-12', portataKg: 'abc' });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.errors.portataKg, 'integer');
    assert.equal(!result.ok && result.errors.identifiers, 'identifierNeeded');
  });
});
