import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { SchedaShown } from '../src/schede/format.js';
import { displaySections } from '../src/schede/format.js';
import {
  activeFields,
  FIELDS,
  fieldByKey,
  SECTIONS,
  type Condition,
  type SectionDef,
} from '../src/schede/fields.js';
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
  pattinoRetrattile: 'si',
};

/** A condition points at an earlier field and at answers that field really has. */
function checkCondition(when: Condition, at: number, who: string) {
  const control = fieldByKey(when.field);
  assert.ok(control, `${who} depends on a field that does not exist`);
  assert.ok(FIELDS.indexOf(control) < at, `${who} must come after ${control.key}`);
  const answers =
    control.kind === 'yesno'
      ? ['si', 'no']
      : control.kind === 'checks' || control.kind === 'choice'
        ? control.options
        : null;
  assert.ok(answers, `${who} depends on a ${control.kind} field`);
  assert.ok(when.values.length > 0, who);
  for (const value of when.values) assert.ok(answers.includes(value), `${who}: ${value}`);
}

describe('conditions', () => {
  it('point at an earlier field and at its own answers (fields and whole sections)', () => {
    for (const [index, field] of FIELDS.entries()) {
      if (field.when) checkCondition(field.when, index, field.key);
    }
    for (const section of SECTIONS as readonly SectionDef[]) {
      if (section.when) {
        checkCondition(section.when, FIELDS.indexOf(section.fields[0]!), section.key);
      }
    }
  });

  it('show a field only while its condition holds, whatever the hidden field was sent with', () => {
    const active = activeFields((key) =>
      key === 'tipoPorte' ? ['AUTOMATICHE'] : key === 'pattinoRetrattile' ? 'si' : '',
    );
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
    const no = parsedOrFail({
      ...minimal,
      serrature: 'no',
      serratureNumero: '4',
      serratureTipo: 'Fermator',
      sospensioni: 'no',
      sospensioniNumero: '6',
    });
    assert.equal(no.serratureNumero, null);
    assert.equal(no.serratureTipo, null);
    assert.equal(no.sospensioniNumero, null);
    const yes = parsedOrFail({
      ...minimal,
      serrature: 'si',
      serratureNumero: '4',
      serratureTipo: 'Fermator',
      sospensioni: 'si',
      sospensioniNumero: '6',
    });
    assert.deepEqual(
      [
        yes.serrature,
        yes.serratureNumero,
        yes.serratureTipo,
        yes.sospensioni,
        yes.sospensioniNumero,
      ],
      [true, 4, 'Fermator', true, 6],
    );
  });

  it('do not complain about a hidden field: what is not shown is not read', () => {
    const data = parsedOrFail({
      ...minimal,
      sospensioni: 'no',
      sospensioniNumero: 'abc',
      serrature: 'no',
      serratureNumero: '-5',
    });
    assert.equal(data.sospensioniNumero, null);
    assert.equal(data.serratureNumero, null);
    const shown = parseScheda({ ...minimal, sospensioni: 'si', sospensioniNumero: 'abc' });
    assert.equal(!shown.ok && shown.errors.sospensioniNumero, 'integer');
  });

  it('no longer read the fields taken off the sheet (their old answers stay in the database)', () => {
    const data = parsedOrFail({
      ...minimal,
      tipoPorte: 'MANUALI',
      bloccaPortine: 'si',
      autolivellamento: 'si',
      pattinoRetrattileNumero: '2',
      arganoMarca: 'MONTANARI',
    });
    for (const key of [
      'bloccaPortine',
      'autolivellamento',
      'pattinoRetrattileNumero',
      'arganoMarca',
    ]) {
      assert.ok(!(key in data), key);
    }
  });
});

describe('alarm and the second brief', () => {
  it('asks what of the emergency call is to install, no longer the old state', () => {
    const data = parsedOrFail({
      ...minimal,
      telesoccorsoInstallare: 'si',
      perifericaInstallare: 'no',
      cornettaInstallare: 'si',
      allarmePortineria: 'no',
      displayPortineria: 'si',
      // The questions taken off the sheet (October 2026): their old answers stay in the database.
      telesoccorso: 'si',
      telesoccorsoStato: 'MANCA_PERIFERICA',
    });
    assert.deepEqual(
      [data.telesoccorsoInstallare, data.perifericaInstallare, data.cornettaInstallare],
      [true, false, true],
    );
    assert.equal(data.allarmePortineria, false);
    assert.equal(data.displayPortineria, true);
    assert.ok(!('telesoccorso' in data) && !('telesoccorsoStato' in data));
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
      tipoImpianto: ['IDRAULICO'],
      centralinaDaFare: false,
      centralinaOlioStato: 'PERDITE',
      sezioniEscluse: [],
      misureBottoniere: [],
    } as unknown as SchedaShown;
    const sections = displaySections(scheda, translatorFor('it'), viewHelpers('it'));
    const keys = sections.flatMap((s) => s.fields.map((f) => f.key));
    for (const key of [
      'doppioAccesso',
      'pattinoRetrattile',
      'serratureNumero',
      'centralinaOlioStato',
    ]) {
      assert.ok(keys.includes(key), key);
    }
    for (const key of ['operatoreMarca', 'lucePorte', 'sospensioniNumero', 'bloccaPortine']) {
      assert.ok(!keys.includes(key), key);
    }
    // A hydraulic lift: no machine, no governor — the power unit instead.
    const titles = sections.map((s) => s.key);
    assert.ok(titles.includes('centralina'));
    assert.ok(!titles.includes('argano') && !titles.includes('limitatore'));
    const stato = sections.flatMap((s) => s.fields).find((f) => f.key === 'centralinaOlioStato');
    assert.equal(stato?.value, 'Perdite visibili');
    assert.deepEqual(
      stato?.options?.map((o) => [o.label, o.checked]),
      [
        ['Buono', false],
        ['Da sostituire', false],
        ['Perdite visibili', true],
      ],
    );
  });
});
