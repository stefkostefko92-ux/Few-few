import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SchedaShown } from '../src/schede/format.js';
import { displaySections } from '../src/schede/format.js';
import { activeFields, FIELDS, fieldByKey } from '../src/schede/fields.js';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-12', matricola: '33871' };

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

/** Every door detail at once, as a browser with JavaScript off would send them. */
const DOORS = {
  operatoreMarca: 'Selcom',
  lucePorte: '800 x 2000',
  operatoreTensione: '24 V DC',
  doppioAccesso: 'si',
  bloccaPortine: 'si',
  autolivellamento: 'no',
  pattinoRetrattile: 'si',
  pattinoRetrattileNumero: '2',
};

describe('conditions', () => {
  it('point at an earlier field: a yes/no answered "si", or ticked options of that field', () => {
    for (const [index, field] of FIELDS.entries()) {
      if (!field.when) continue;
      const control = fieldByKey(field.when.field);
      assert.ok(control, `${field.key} depends on a field that does not exist`);
      assert.ok(FIELDS.indexOf(control) < index, `${field.key} must come after ${control.key}`);
      if (control.kind === 'yesno') assert.deepEqual(field.when.values, ['si'], field.key);
      else if (control.kind === 'checks' || control.kind === 'choice') {
        for (const value of field.when.values) assert.ok(control.options.includes(value), value);
      } else assert.fail(`${field.key} depends on a ${control.kind} field`);
    }
  });

  it('chain: a field hidden by its condition hides the fields that depend on it', () => {
    const active = activeFields((key) =>
      key === 'tipoPorte' ? ['AUTOMATICHE'] : key === 'pattinoRetrattile' ? 'si' : '',
    );
    assert.ok(active.has('operatoreMarca'));
    assert.ok(!active.has('pattinoRetrattile'));
    assert.ok(!active.has('pattinoRetrattileNumero'), 'the number follows its hidden yes/no');
  });
});

describe('door details', () => {
  it('keep the operator (make, clear opening, voltage) for automatic and semi-automatic doors', () => {
    for (const porte of ['AUTOMATICHE', 'SEMIAUTOMATICHE']) {
      const data = parsedOrFail({ ...minimal, tipoPorte: porte, ...DOORS });
      assert.equal(data.operatoreMarca, 'Selcom', porte);
      assert.equal(data.lucePorte, '800 x 2000', porte);
      assert.equal(data.operatoreTensione, '24 V DC', porte);
    }
    const manual = parsedOrFail({ ...minimal, tipoPorte: 'MANUALI', ...DOORS });
    assert.equal(manual.operatoreMarca, null);
    assert.equal(manual.lucePorte, null);
  });

  it('keep the double entrance with every door type, manual doors included', () => {
    for (const porte of ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI']) {
      const data = parsedOrFail({ ...minimal, tipoPorte: porte, ...DOORS });
      assert.equal(data.doppioAccesso, true, porte);
    }
  });

  it('keep the door blocking, self-levelling and retiring cam for manual doors only', () => {
    const manual = parsedOrFail({ ...minimal, tipoPorte: 'MANUALI', ...DOORS });
    assert.equal(manual.bloccaPortine, true);
    assert.equal(manual.autolivellamento, false);
    assert.equal(manual.pattinoRetrattile, true);
    assert.equal(manual.pattinoRetrattileNumero, 2);
    const semi = parsedOrFail({ ...minimal, tipoPorte: 'SEMIAUTOMATICHE', ...DOORS });
    assert.equal(semi.bloccaPortine, null, 'semi-automatic doors have no door blocking');
    assert.equal(semi.autolivellamento, null);
    assert.equal(semi.pattinoRetrattile, true, 'but they do have the retiring cam');
    assert.equal(semi.pattinoRetrattileNumero, 2);
    const none = parsedOrFail({ ...minimal, ...DOORS });
    for (const key of Object.keys(DOORS)) assert.equal(none[key as keyof typeof none], null, key);
  });

  it('keep the number of retiring cams only with "si"', () => {
    const no = parsedOrFail({
      ...minimal,
      tipoPorte: 'MANUALI',
      pattinoRetrattile: 'no',
      pattinoRetrattileNumero: '2',
    });
    assert.equal(no.pattinoRetrattile, false);
    assert.equal(no.pattinoRetrattileNumero, null);
  });

  it('do not complain about a hidden field: what is not shown is not read', () => {
    const data = parsedOrFail({
      ...minimal,
      tipoPorte: 'AUTOMATICHE',
      pattinoRetrattile: 'si',
      pattinoRetrattileNumero: 'abc',
      serrature: 'no',
      serratureNumero: '-5',
    });
    assert.equal(data.pattinoRetrattileNumero, null);
    assert.equal(data.serratureNumero, null);
    const shown = parseScheda({
      ...minimal,
      tipoPorte: 'MANUALI',
      pattinoRetrattile: 'si',
      pattinoRetrattileNumero: 'abc',
    });
    assert.equal(!shown.ok && shown.errors.pattinoRetrattileNumero, 'integer');
  });
});

describe('alarm and the second brief', () => {
  it('keeps the emergency call state (complete / peripheral missing) only when there is one', () => {
    const yes = parsedOrFail({
      ...minimal,
      telesoccorso: 'si',
      telesoccorsoStato: 'MANCA_PERIFERICA',
      allarmePortineria: 'no',
      displayPortineria: 'si',
    });
    assert.equal(yes.telesoccorso, true);
    assert.equal(yes.telesoccorsoStato, 'MANCA_PERIFERICA');
    assert.equal(yes.allarmePortineria, false);
    assert.equal(yes.displayPortineria, true);
    const no = parsedOrFail({ ...minimal, telesoccorso: 'no', telesoccorsoStato: 'COMPLETO' });
    assert.equal(no.telesoccorsoStato, null);
    const forged = parseScheda({ ...minimal, telesoccorso: 'si', telesoccorsoStato: 'ROTTO' });
    assert.equal(!forged.ok && forged.errors.telesoccorsoStato, 'option');
  });

  it('takes the reference work order as optional free text and the shaft lighting as yes/no', () => {
    const data = parsedOrFail({
      ...minimal,
      buonoLavoro: ' BL 2026/512 ',
      luceVanoSostituire: 'si',
    });
    assert.equal(data.buonoLavoro, 'BL 2026/512');
    assert.equal(data.luceVanoSostituire, true);
    assert.equal(parsedOrFail(minimal).buonoLavoro, null);
  });
});

describe('the sheet page', () => {
  it('shows only the fields whose condition holds', () => {
    const scheda = {
      ...Object.fromEntries(FIELDS.map((f) => [f.key, f.kind === 'checks' ? [] : null])),
      data: new Date('2026-10-12T00:00:00.000Z'),
      tipoPorte: ['MANUALI'],
      pattinoRetrattile: false,
      doppioAccesso: true,
      serrature: true,
      serratureNumero: 4,
      telesoccorso: true,
      telesoccorsoStato: 'COMPLETO',
      misureBottoniere: [],
    } as unknown as SchedaShown;
    const keys = displaySections(scheda, translatorFor('it'), viewHelpers('it')).flatMap((s) =>
      s.fields.map((f) => f.key),
    );
    for (const key of [
      'doppioAccesso',
      'bloccaPortine',
      'pattinoRetrattile',
      'serratureNumero',
      'telesoccorsoStato',
    ]) {
      assert.ok(keys.includes(key), key);
    }
    for (const key of ['operatoreMarca', 'lucePorte', 'pattinoRetrattileNumero']) {
      assert.ok(!keys.includes(key), key);
    }
    const stato = displaySections(scheda, translatorFor('it'), viewHelpers('it'))
      .flatMap((s) => s.fields)
      .find((f) => f.key === 'telesoccorsoStato');
    assert.equal(stato?.value, 'Completo');
    assert.deepEqual(
      stato?.options?.map((o) => [o.label, o.checked]),
      [
        ['Completo', true],
        ['Manca periferica', false],
      ],
    );
  });
});
