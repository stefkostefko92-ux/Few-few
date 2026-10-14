// Rilievi — the conditional fields, ported from rilievi's tests/conditions.test.ts (commit ae6329cb6): every condition
// points at an earlier field, a field is shown only while its condition holds, what is not shown is not read (nor
// stored, nor checked), the fields taken off the sheet are not read any more, and the sheet's page shows only the fields
// whose condition holds.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { displaySections, type SchedaShown } from '@/lib/rilievi/format';
import { activeFields, FIELDS, fieldByKey } from '@/lib/rilievi/fields';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { parseScheda } from '@/lib/rilievi/validation';

const t = rilieviTranslator();
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
  pattinoRetrattile: 'si',
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

  it('show a field only while its condition holds, whatever the hidden field was sent with', () => {
    const active = activeFields((key) => (key === 'tipoPorte' ? ['AUTOMATICHE'] : key === 'pattinoRetrattile' ? 'si' : ''));
    assert.ok(active.has('operatoreMarca'));
    assert.ok(active.has('doppioAccesso'));
    assert.ok(!active.has('pattinoRetrattile'), 'no retiring cam with automatic doors');
    assert.ok(!active.has('sospensioniNumero'), 'the number follows its yes/no');
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

  it('keep the retiring cam to change for manual and semi-automatic doors only', () => {
    const manual = parsedOrFail({ ...minimal, tipoPorte: 'MANUALI', ...DOORS });
    assert.equal(manual.pattinoRetrattile, true);
    const semi = parsedOrFail({ ...minimal, tipoPorte: 'SEMIAUTOMATICHE', ...DOORS });
    assert.equal(semi.pattinoRetrattile, true);
    const automatic = parsedOrFail({ ...minimal, tipoPorte: 'AUTOMATICHE', ...DOORS });
    assert.equal(automatic.pattinoRetrattile, null);
    const none = parsedOrFail({ ...minimal, ...DOORS });
    for (const key of Object.keys(DOORS)) assert.equal(none[key as keyof typeof none], null, key);
  });

  it('keep the number and type of the locks, and the number of suspensions, only with "si"', () => {
    const no = parsedOrFail({ ...minimal, serrature: 'no', serratureNumero: '4', serratureTipo: 'Fermator', sospensioni: 'no', sospensioniNumero: '6' });
    assert.equal(no.serratureNumero, null);
    assert.equal(no.serratureTipo, null);
    assert.equal(no.sospensioniNumero, null);
    const yes = parsedOrFail({ ...minimal, serrature: 'si', serratureNumero: '4', serratureTipo: 'Fermator', sospensioni: 'si', sospensioniNumero: '6' });
    assert.deepEqual([yes.serrature, yes.serratureNumero, yes.serratureTipo, yes.sospensioni, yes.sospensioniNumero], [true, 4, 'Fermator', true, 6]);
  });

  it('do not complain about a hidden field: what is not shown is not read', () => {
    const data = parsedOrFail({ ...minimal, sospensioni: 'no', sospensioniNumero: 'abc', serrature: 'no', serratureNumero: '-5' });
    assert.equal(data.sospensioniNumero, null);
    assert.equal(data.serratureNumero, null);
    const shown = parseScheda({ ...minimal, sospensioni: 'si', sospensioniNumero: 'abc' });
    assert.equal(!shown.ok && shown.errors.sospensioniNumero, 'integer');
  });

  it('no longer read the fields taken off the sheet (their old answers stay in the database)', () => {
    const data = parsedOrFail({ ...minimal, tipoPorte: 'MANUALI', bloccaPortine: 'si', autolivellamento: 'si', pattinoRetrattileNumero: '2', arganoMarca: 'MONTANARI' });
    for (const key of ['bloccaPortine', 'autolivellamento', 'pattinoRetrattileNumero', 'arganoMarca', 'arganoMarcaAltro']) assert.ok(!(key in data), key);
  });
});

describe('alarm and the second brief', () => {
  it('keeps the emergency call state (complete / peripheral missing) only when there is one', () => {
    const yes = parsedOrFail({ ...minimal, telesoccorso: 'si', telesoccorsoStato: 'MANCA_PERIFERICA', allarmePortineria: 'no', displayPortineria: 'si' });
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
    const data = parsedOrFail({ ...minimal, buonoLavoro: ' BL 2026/512 ', luceVanoSostituire: 'si' });
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
    const fields = displaySections(scheda, t).flatMap((s) => s.fields);
    const keys = fields.map((f) => f.key);
    for (const key of ['doppioAccesso', 'pattinoRetrattile', 'serratureNumero', 'telesoccorsoStato']) assert.ok(keys.includes(key), key);
    for (const key of ['operatoreMarca', 'lucePorte', 'sospensioniNumero', 'bloccaPortine']) assert.ok(!keys.includes(key), key);
    // «Accessi: 2» — the double access with its own words
    const accessi = fields.find((f) => f.key === 'doppioAccesso');
    assert.equal(accessi?.value, '2');
    assert.deepEqual(accessi?.options?.map((o) => [o.label, o.checked]), [['1', false], ['2', true]]);
    const stato = fields.find((f) => f.key === 'telesoccorsoStato');
    assert.equal(stato?.value, 'Completo');
    assert.deepEqual(stato?.options?.map((o) => [o.label, o.checked]), [['Completo', true], ['Manca periferica', false]]);
  });
});
