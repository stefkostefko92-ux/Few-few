// The linked data of 3 November 2026 (owner: every datum entered once fills every field that asks the
// same thing): the hydraulic sections of Pitagora and MoviLift, the doors of the landing and of the car,
// "Portata (kg/pers.)" of Pitagora as "630/8", and what the panel orders share among themselves.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { COLLEGAMENTI } from '../src/ordini/collegamenti.js';
import { discrepanzeDi, prefillCollegati } from '../src/ordini/collegati.js';
import { DMG_PITAGORA } from '../src/ordini/moduli.js';
import { prefillValori } from '../src/ordini/prefill.js';

const t = translatorFor('it');
const base = { data: '2026-11-03', matricola: '33871', quadroOrdine: 'si' };

describe('the motor of a hydraulic lift', () => {
  const idraulico = {
    ...base,
    tipoImpianto: ['IDRAULICO'],
    centralinaDaFare: 'si',
    centralinaMotoreV: '400',
    centralinaMotoreHp: '7,5',
    centralinaCorsaImpianto: '12,4',
    centralinaAvvio: 'STELLA_TRIANGOLO',
    centralinaTensioneValvole: '48 Vcc',
  };

  it('goes to the power unit section of Pitagora, not to its VVVF section', () => {
    const dp = prefillCollegati('dp', { ...idraulico, quadroMarca: 'DMG' });
    assert.equal(dp.centralinaV, '400');
    assert.equal(dp.motoreV, undefined);
    assert.equal(dp.avviamento, 'stellaTriangolo');
    assert.equal(dp.valvoleTensione, '48 Vcc');
    // The same sheet electric: the VVVF section (the power unit is not asked).
    const elettrico = prefillCollegati('dp', {
      ...base,
      quadroMarca: 'DMG',
      tipoImpianto: ['ELETTRICO'],
      'pa-potenzaKw': '5,5',
      arganoPreventivo: 'si',
    });
    assert.equal(elettrico.motoreKw, '5,5');
    assert.equal(elettrico.centralinaKw, undefined);
  });

  it('goes to "Idraulico" of MoviLift, and to the motor of Pelazza and Elettroquadri', () => {
    const om = prefillCollegati('om', { ...idraulico, quadroMarca: 'MOVILIFT' });
    assert.equal(om.tensCentralina, '400');
    assert.equal(om.tensFune, undefined);
    assert.equal(om.avviamento, 'stellaTriangolo');
    assert.equal(om.corsa, '12,4');
    const oq = prefillCollegati('oq', { ...idraulico, quadroMarca: 'PELAZZA' });
    assert.deepEqual(
      [oq.motVca, oq.motHp, oq.avvStellaTriangolo, oq.elettrovalvoleVcc, oq.corsa],
      ['400', '7,5', true, '48 Vcc', '12,4'],
    );
    const eo = prefillCollegati('eo', { ...idraulico, quadroMarca: 'ELETTROQUADRI' });
    assert.deepEqual(
      [eo.motoreHp, eo.avviamentoStellaTriangolo, eo.elettrovalvoleV, eo.corsa],
      ['7,5', true, '48 Vcc', '12,4'],
    );
  });

  it('asks the A3 kit as the panel orders do: "Emendamento A3"', () => {
    const kit = {
      ...base,
      tipoImpianto: ['IDRAULICO'],
      centralinaDaFare: 'no',
      emendamentoA3: 'si',
    };
    assert.equal(prefillCollegati('dp', { ...kit, quadroMarca: 'DMG' }).emendamentoA3, true);
    assert.equal(prefillCollegati('oq', { ...kit, quadroMarca: 'PELAZZA' }).normaEmendA3, true);
    assert.equal(
      prefillCollegati('eo', { ...kit, quadroMarca: 'ELETTROQUADRI' }).emendamentoA3,
      true,
    );
  });
});

describe('the doors of the landing and of the car', () => {
  const semi = { ...base, tipoImpianto: ['ELETTRICO'], tipoPorte: ['SEMIAUTOMATICHE'] };

  it('semi-automatic: manual landing doors, automatic car doors', () => {
    const dp = prefillCollegati('dp', { ...semi, quadroMarca: 'DMG' });
    assert.equal(dp.portePiano, 'manuali');
    // Pitagora tells the automatic car doors by their operator: nothing is guessed.
    assert.equal(dp.porteCabina, undefined);
    const eg = prefillCollegati('eg', { ...semi, quadroMarca: 'ELETTROQUADRI' });
    assert.equal(eg.pianoManuali, true);
    assert.equal(eg.cabinaAutomatiche, true);
    assert.equal(eg.pianoAutomatiche, undefined);
  });

  it('never lists manual landing doors against a semi-automatic sheet', () => {
    const values = { ...semi, quadroMarca: 'DMG', 'dp-portePiano': 'manuali' };
    const keys = discrepanzeDi(values, t).map((d) => d.key);
    assert.deepEqual(
      keys.filter((k) => k.startsWith('porte')),
      [],
    );
    const sbagliato = { ...semi, quadroMarca: 'DMG', 'dp-portePiano': 'automatiche' };
    assert.ok(discrepanzeDi(sbagliato, t).some((d) => d.key === 'portePiano'));
  });

  it('keeps Pitagora out of the doors of the sheet: its landing doors are their own datum', () => {
    const porte = COLLEGAMENTI.find((link) => link.key === 'porte')!;
    assert.ok(!porte.membri.some((m) => m.luogo === 'dp'));
  });
});

describe('what Pitagora takes from the sheet with no linked field', () => {
  const ctx = {
    azienda: 'Ascensori Rossi Srl',
    utente: 'Mario Rossi',
    ruolo: 'Tecnico',
    email: 'mario@example.it',
    etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
  };

  it('writes the load and the persons as "630/8", the load alone without the persons', () => {
    const values = { ...base, quadroMarca: 'DMG', portataKg: '630', capienzaPersone: '8' };
    assert.equal(prefillValori(DMG_PITAGORA, { ...ctx, values }).portata, '630/8');
    const soloKg = { ...values, capienzaPersone: '' };
    assert.equal(prefillValori(DMG_PITAGORA, { ...ctx, values: soloKg }).portata, '630');
  });

  it('ticks the electronic skate as MoviLift does, with the retractable skate to change', () => {
    const values = {
      ...base,
      quadroMarca: 'DMG',
      tipoPorte: ['MANUALI'],
      pattinoRetrattile: 'si',
    };
    assert.equal(prefillValori(DMG_PITAGORA, { ...ctx, values }).pattino, true);
    const no = { ...values, pattinoRetrattile: 'no' };
    assert.equal(prefillValori(DMG_PITAGORA, { ...ctx, values: no }).pattino, undefined);
  });
});
