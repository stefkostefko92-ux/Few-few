// The October 2026 brief: a hydraulic lift has no argano, governor, tensioner or governor rope but a
// power unit ("Centralina da fare?"), the emergency call is three things to install, the panel section
// asks for a reduced pit and headroom, a kept argano asks for its brake, and the end of the form chooses
// the sections of the print.
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
      ganasceFreno: 'si',
      limitatoreTipo: 'Montanari',
      tenditore: 'a peso',
    });
    assert.equal(data.arganoPreventivo, null);
    assert.equal(data.preventivoArgano, null);
    assert.equal(data.ganasceFreno, null);
    assert.equal(data.limitatoreTipo, null);
    assert.equal(data.tenditore, null);
  });

  it('asks the power unit questions of the "Sì" branch, or those of the "No" branch', () => {
    const unit = {
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      centralinaAzionamento: 'INDIRETTO_2_1',
      centralinaParacadute: 'si',
      centralinaPistoni: '1',
      centralinaVelocita: '0,63',
      centralinaPotenzaKw: '7,5',
      centralinaAvviamento: 'SOFT_STARTER',
      centralinaMarca: 'GMV',
      emendamentoA3: 'si',
      centralinaOlioStato: 'PERDITE',
    };
    const nuova = parsedOrFail({ ...unit, centralinaDaFare: 'si' });
    assert.equal(nuova.centralinaAzionamento, 'INDIRETTO_2_1');
    assert.equal(nuova.centralinaParacadute, true);
    assert.equal(nuova.centralinaPistoni, 1);
    assert.equal(String(nuova.centralinaVelocita), '0.63');
    assert.equal(nuova.centralinaAvviamento, 'SOFT_STARTER');
    assert.equal(nuova.centralinaMarca, null, 'the make of the old unit goes with "No"');
    assert.equal(nuova.emendamentoA3, null);

    const vecchia = parsedOrFail({ ...unit, centralinaDaFare: 'no' });
    assert.equal(vecchia.centralinaAzionamento, 'INDIRETTO_2_1', 'asked in both branches');
    assert.equal(vecchia.centralinaMarca, 'GMV');
    assert.equal(vecchia.emendamentoA3, true);
    assert.equal(vecchia.centralinaOlioStato, 'PERDITE');
    assert.equal(vecchia.centralinaPistoni, null);
    assert.equal(vecchia.centralinaAvviamento, null);

    const traction = parsedOrFail({ ...unit, tipoImpianto: 'ELETTRICO', centralinaDaFare: 'si' });
    assert.equal(traction.centralinaDaFare, null, 'no power unit on a traction lift');
    assert.equal(traction.centralinaPistoni, null);
  });

  it('checks the numbers of the power unit like every other number of the sheet', () => {
    const result = parseScheda({
      ...minimal,
      tipoImpianto: 'IDRAULICO',
      centralinaDaFare: 'si',
      centralinaPistoni: '9',
      centralinaPressioneBar: 'molta',
    });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.errors.centralinaPistoni, 'range');
    assert.equal(!result.ok && result.errors.centralinaPressioneBar, 'decimal');
  });
});

describe('the panel, the brake and the emergency call', () => {
  it('keeps a reduced pit and headroom with every make of panel', () => {
    const data = parsedOrFail({ ...minimal, fossaRidotta: 'si', testataRidotta: 'no' });
    assert.equal(data.fossaRidotta, true);
    assert.equal(data.testataRidotta, false);
  });

  it('asks the kind of an argano that stays and its brake shoes, no longer the brake contacts', () => {
    const brake = { arganoTipo: 'Montanari M83', ganasceFreno: 'si', contattiFreno: 'no' };
    const kept = parsedOrFail({ ...minimal, arganoPreventivo: 'no', ...brake });
    assert.equal(kept.arganoTipo, 'Montanari M83');
    assert.equal(kept.ganasceFreno, true);
    assert.ok(
      !('contattiFreno' in kept),
      'taken off the sheet: the old answers stay in the database',
    );
    const replaced = parsedOrFail({ ...minimal, arganoPreventivo: 'si', ...brake });
    assert.equal(replaced.ganasceFreno, null, 'a new argano comes with its own brake');
    assert.equal(replaced.arganoTipo, null, 'the new one is in the argano sheet');
    const unanswered = parsedOrFail({ ...minimal, ...brake });
    assert.equal(unanswered.ganasceFreno, null);
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
    assert.ok(none.success && none.data.length === 11, 'nothing ticked: only the plate is printed');
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
    assert.equal(stampaFromBody({}).length, 11, 'an old page without the list: all of them');
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
