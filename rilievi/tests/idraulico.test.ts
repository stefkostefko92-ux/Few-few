// The October 2026 brief: a hydraulic lift has no argano, governor, tensioner or governor rope but a
// power unit ("Centralina da sostituire?" since October 21: its make and model, the A3 amendment and a
// flexible hose to install), the emergency call is three things to install, the panel section asks for a
// reduced pit and headroom, a kept argano asks for its brake, and the end of the form chooses the
// sections of the print.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { activeParts, type SectionKey } from '../src/schede/fields.js';
import { sezioniStampate } from '../src/schede/ordine.js';
import { sezioniEscluseDi, stampaFromBody } from '../src/schede/stampa.js';
import { parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-14', matricola: '33871' };

function parsedOrFail(body: Record<string, unknown>) {
  const result = parseScheda(body);
  if (!result.ok) assert.fail(`expected a valid sheet, got ${JSON.stringify(result.errors)}`);
  return result.data;
}

const sectionsFor = (values: Record<string, unknown>) =>
  [...activeParts((key) => values[key]).sections].sort();

describe('the kind of lift', () => {
  it('shows the power unit instead of the argano and the governor for a hydraulic lift', () => {
    const hydraulic = sectionsFor({ tipoImpianto: ['IDRAULICO'] });
    assert.ok(hydraulic.includes('centralina'));
    assert.ok(!hydraulic.includes('argano') && !hydraulic.includes('limitatore'));
    for (const other of [{}, { tipoImpianto: ['ELETTRICO'] }, { tipoImpianto: ['GEARLESS'] }]) {
      const sections = sectionsFor(other);
      assert.ok(sections.includes('argano') && sections.includes('limitatore'), String(other));
      assert.ok(!sections.includes('centralina'), JSON.stringify(other));
    }
  });

  it('drops what a hydraulic lift sent for the argano: the answer, the brake and the argano sheet', () => {
    const data = parsedOrFail({
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      arganoPreventivo: 'si',
      'pa-_': '1',
      'pa-pesoCabina': '650',
      kitControlloGanasce: 'si',
      stopArgano: 'si',
      limitatoreTipo: 'Montanari',
      tenditore: 'a peso',
    });
    assert.equal(data.arganoPreventivo, null);
    assert.equal(data.preventivoArgano, null);
    assert.equal(data.kitControlloGanasce, null);
    assert.equal(data.stopArgano, null);
    assert.equal(data.limitatoreTipo, null);
    assert.equal(data.tenditore, null);
  });

  it('asks the make and model of the power unit with either answer, the A3 amendment with "No"', () => {
    const unit = {
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      centralinaMarca: 'GMV 3010',
      emendamentoA3: 'si',
      tuboFlessibile: 'si',
      tuboFlessibileDiametroMm: '25,4',
      tuboFlessibileLunghezzaM: '6',
      tuboFlessibileNote: 'Raccordi da 1"',
      centralinaNote: 'Perdita alla valvola',
    };
    const vecchia = parsedOrFail({ ...unit, centralinaDaFare: 'no' });
    assert.equal(vecchia.centralinaMarca, 'GMV 3010');
    assert.equal(vecchia.emendamentoA3, true);
    assert.equal(vecchia.tuboFlessibile, true);
    assert.equal(Number(vecchia.tuboFlessibileDiametroMm), 25.4);
    assert.equal(Number(vecchia.tuboFlessibileLunghezzaM), 6);
    assert.equal(vecchia.tuboFlessibileNote, 'Raccordi da 1"');
    assert.equal(vecchia.centralinaNote, 'Perdita alla valvola');

    const nuova = parsedOrFail({ ...unit, centralinaDaFare: 'si' });
    assert.equal(nuova.centralinaMarca, 'GMV 3010', 'the make and model of the new unit');
    assert.equal(nuova.emendamentoA3, null, 'a new unit comes with the amendment');
    assert.equal(nuova.tuboFlessibile, null);
    assert.equal(nuova.tuboFlessibileDiametroMm, null);
    assert.equal(nuova.tuboFlessibileNote, null);
    assert.equal(nuova.centralinaNote, 'Perdita alla valvola', 'the notes are always asked');

    const unanswered = parsedOrFail(unit);
    assert.equal(unanswered.centralinaMarca, null);
    assert.equal(unanswered.emendamentoA3, null);
    assert.equal(unanswered.centralinaNote, 'Perdita alla valvola');

    const traction = parsedOrFail({ ...unit, tipoImpianto: 'ELETTRICO', centralinaDaFare: 'no' });
    assert.equal(traction.centralinaDaFare, null, 'no power unit on a traction lift');
    assert.equal(traction.centralinaMarca, null);
    assert.equal(traction.centralinaNote, null);
  });

  it('asks the size of the flexible hose only when it is to install', () => {
    const hose = {
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      centralinaDaFare: 'no',
      emendamentoA3: 'si',
      tuboFlessibileDiametroMm: '25',
      tuboFlessibileLunghezzaM: '6',
      tuboFlessibileNote: 'Sotto il pavimento',
    };
    const no = parsedOrFail({ ...hose, tuboFlessibile: 'no' });
    assert.equal(no.tuboFlessibile, false);
    assert.deepEqual(
      [no.tuboFlessibileDiametroMm, no.tuboFlessibileLunghezzaM, no.tuboFlessibileNote],
      [null, null, null],
    );
    const noAmendment = parsedOrFail({ ...hose, emendamentoA3: 'no', tuboFlessibile: 'si' });
    assert.equal(noAmendment.tuboFlessibile, null, 'the hose comes with the A3 amendment');
    assert.equal(noAmendment.tuboFlessibileLunghezzaM, null);
  });

  it('no longer asks the data of the power unit taken off the sheet', () => {
    const data = parsedOrFail({
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      centralinaDaFare: 'si',
      centralinaAzionamento: 'INDIRETTO_2_1',
      centralinaPistoni: '9',
      centralinaPressioneBar: 'molta',
      centralinaOlioStato: 'PERDITE',
    });
    for (const key of [
      'centralinaAzionamento',
      'centralinaPistoni',
      'centralinaPressioneBar',
      'centralinaOlioStato',
    ]) {
      assert.ok(!(key in data), `${key}: the old answers stay in the database`);
    }
  });

  it('checks the size of the flexible hose like every other number of the sheet', () => {
    const result = parseScheda({
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      centralinaDaFare: 'no',
      emendamentoA3: 'si',
      tuboFlessibile: 'si',
      tuboFlessibileDiametroMm: 'largo',
      tuboFlessibileLunghezzaM: '5000',
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.errors.tuboFlessibileDiametroMm, 'decimal');
    assert.equal(!result.ok && result.errors.tuboFlessibileLunghezzaM, 'range');
  });
});

describe('the panel, the brake and the emergency call', () => {
  it('keeps a reduced pit and headroom with every make of panel, never for a hydraulic lift', () => {
    const reduced = { fossaRidotta: 'si', testataRidotta: 'no' };
    const data = parsedOrFail({ ...minimal, ...reduced });
    assert.equal(data.fossaRidotta, true);
    assert.equal(data.testataRidotta, false);
    // The owner, 24 October 2026: not with a hydraulic lift.
    const hydraulic = parsedOrFail({ ...minimal, tipoImpianto: 'IDRAULICO', ...reduced });
    assert.equal(hydraulic.fossaRidotta, null);
    assert.equal(hydraulic.testataRidotta, null);
  });

  it('asks the kind of an argano that stays, no longer its brake shoes nor the brake contacts', () => {
    const brake = { arganoTipo: 'Montanari M83', ganasceFreno: 'si', contattiFreno: 'no' };
    const kept = parsedOrFail({ ...minimal, arganoPreventivo: 'no', ...brake });
    assert.equal(kept.arganoTipo, 'Montanari M83');
    for (const key of ['ganasceFreno', 'contattiFreno'])
      assert.ok(!(key in kept), `${key} off the sheet: the old answers stay in the database`);
    const replaced = parsedOrFail({ ...minimal, arganoPreventivo: 'si', ...brake });
    assert.equal(replaced.arganoTipo, null, 'the new one is in the argano sheet');
  });

  it('asks the tie rods of the counterweight, or in the pit for a hydraulic lift', () => {
    const rods = {
      tirantiContrappesoNumero: '4',
      tirantiContrappesoTipo: 'Tiranti M10',
      tirantiFossaNumero: '2',
      tirantiFossaTipo: 'Ancoraggio in fossa M16',
    };
    const electric = parsedOrFail({ ...minimal, tipoImpianto: 'ELETTRICO', ...rods });
    assert.deepEqual(
      [electric.tirantiContrappesoNumero, electric.tirantiFossaNumero, electric.tirantiFossaTipo],
      [4, null, null],
    );
    const unticked = parsedOrFail({ ...minimal, ...rods });
    assert.equal(unticked.tirantiContrappesoTipo, 'Tiranti M10', 'no kind ticked: a counterweight');
    const hydraulic = parsedOrFail({ ...minimal, tipoImpianto: 'IDRAULICO', ...rods });
    assert.deepEqual(
      [
        hydraulic.tirantiContrappesoNumero,
        hydraulic.tirantiFossaNumero,
        hydraulic.tirantiFossaTipo,
      ],
      [null, 2, 'Ancoraggio in fossa M16'],
    );
  });

  it('asks what of the emergency call is to install, three yes/no', () => {
    const data = parsedOrFail({
      ...minimal,
      telesoccorsoInstallare: 'si',
      perifericaInstallare: 'no',
      cornettaInstallare: 'si',
    });
    assert.equal(data.telesoccorsoInstallare, true);
    assert.equal(data.perifericaInstallare, false);
    assert.equal(data.cornettaInstallare, true);
  });
});

describe('the sections of the print', () => {
  it('keeps the unticked sections as left out, and every section when the form has no list', () => {
    const ticked = { 'stampa-_': '1', stampa: ['quadro', 'allarme', 'note'] };
    const parsed = sezioniEscluseDi(ticked);
    assert.ok(parsed.success);
    assert.ok(parsed.success && parsed.data.includes('argano') && parsed.data.includes('funi'));
    assert.ok(parsed.success && !parsed.data.includes('quadro') && !parsed.data.includes('note'));
    assert.deepEqual(sezioniEscluseDi({ stampa: 'note' }), { success: true, data: [] });
    const none = sezioniEscluseDi({ 'stampa-_': '1' });
    assert.ok(none.success && none.data.length === 12, 'nothing ticked: only the plate is printed');
  });

  it('refuses a section the form does not have, and the fixed identification', () => {
    for (const forged of ['impianto', 'constructor', ['note', 'nonEsiste'], { a: 1 }]) {
      const parsed = sezioniEscluseDi({ 'stampa-_': '1', stampa: forged });
      assert.equal(parsed.success, false, JSON.stringify(forged));
    }
    const result = parseScheda({ ...minimal, 'stampa-_': '1', stampa: 'impianto' });
    assert.equal(!result.ok && result.errors.stampa, 'option');
  });

  it('saves the choice with the sheet and gives it back when the form returns', () => {
    const data = parsedOrFail({ ...minimal, 'stampa-_': '1', stampa: ['quadro', 'note'] });
    assert.ok(data.sezioniEscluse.includes('allarme'));
    assert.deepEqual(stampaFromBody({ 'stampa-_': '1', stampa: 'note' }), ['note']);
    assert.equal(stampaFromBody({}).length, 12, 'an old page without the list: all of them');
  });

  it('prints neither the identification (it is in the header) nor the sections left out', () => {
    const keys: SectionKey[] = ['impianto', 'quadro', 'argano', 'note'];
    const sections = keys.map((key) => ({ key }));
    assert.deepEqual(
      sezioniStampate(sections, ['argano']).map((s) => s.key),
      ['quadro', 'note'],
    );
  });
});
