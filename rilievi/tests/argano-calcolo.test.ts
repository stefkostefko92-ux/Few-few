// The machine calculation against the owner's workbook "RT-E MOD 10411-1": five cases recalculated in the
// workbook itself (tests/argano-rt.json — 1:1, 1:2 and 1:4, two speeds and VVVF, V and semicircular grooves,
// chains and ropes for compensation, machine above and below) must give the same numbers and the same
// OK/NO; then the form: Italian decimals, required fields by drive, forged choices.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { calcolaArgano } from '../src/argano/calcolo.js';
import { datiSalvati, parseDatiArgano, type DatiArgano } from '../src/argano/dati.js';

type Caso = { dati: DatiArgano; attesi: Record<string, number | boolean | null> };
const RT = JSON.parse(readFileSync(join(import.meta.dirname, 'argano-rt.json'), 'utf8')) as {
  casi: Record<string, Caso>;
};

const at = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], obj);

describe('the machine calculation gives the numbers of the RT workbook', () => {
  for (const [nome, caso] of Object.entries(RT.casi)) {
    it(nome, () => {
      assert.ok(datiSalvati(caso.dati), 'the case is a valid input');
      const r = calcolaArgano(caso.dati);
      for (const [chiave, atteso] of Object.entries(caso.attesi)) {
        const path = chiave.split(' ')[1]!;
        const valore = at(r, path);
        if (typeof atteso === 'number') {
          assert.equal(typeof valore, 'number', `${chiave}: ${String(valore)}`);
          const tolleranza = Math.max(1e-9, Math.abs(atteso) * 1e-9);
          assert.ok(
            Math.abs((valore as number) - atteso) <= tolleranza,
            `${chiave}: ${valore} ≠ ${atteso}`,
          );
        } else assert.equal(valore, atteso, chiave);
      }
    });
  }
});

const FORM: Record<string, string> = {
  portata: '480',
  massaCabina: '600',
  massaContrappeso: '840',
  velocita: '1,0',
  corsa: '20',
  sospensione: '1:1',
  macchina: 'alto',
  azionamento: '2V',
  giriMotore: '1400',
  velocitaVvvf: '',
  motoreVvvf: '1500',
  rapportoA: '1',
  rapportoB: '50',
  diametroPuleggia: '500',
  gola: 'cuneo',
  angoloGola: '40',
  angoloAvvolgimento: '180',
  funiSostituzione: 'si',
  funiNumero: '4',
  fune: 'telcal-10-114',
  compensazione: 'nessuna',
};

describe('the form of the machine calculation', () => {
  it('reads Italian decimals and gives the same input as the first case', () => {
    const { dati, errori } = parseDatiArgano(FORM);
    assert.deepEqual(errori, {});
    assert.deepEqual(dati, RT.casi.A_2v_11_cuneo!.dati);
  });

  it('asks the motor speed for one or two speeds, the target speed for VVVF', () => {
    assert.equal(parseDatiArgano({ ...FORM, giriMotore: '' }).errori.giriMotore, 'required');
    const vvvf = parseDatiArgano({ ...FORM, azionamento: 'VVVF', giriMotore: '' });
    assert.equal(vvvf.errori.velocitaVvvf, 'required');
    assert.equal(vvvf.errori.giriMotore, undefined);
  });

  it('refuses forged choices, numbers out of range and a compensation size not in the tables', () => {
    const { errori } = parseDatiArgano({
      ...FORM,
      sospensione: '1:3',
      fune: 'telcal-99-114',
      velocita: '12',
      funiNumero: '3,5',
      corsa: 'venti',
      compensazione: 'catene',
      compNumero: '2',
      compMisura: '7',
    });
    assert.deepEqual(errori, {
      sospensione: 'option',
      fune: 'option',
      velocita: 'range',
      funiNumero: 'integer',
      corsa: 'decimal',
      compMisura: 'option',
    });
  });

  it('wants the data of another rope when the rope is not in the tables', () => {
    const { errori } = parseDatiArgano({ ...FORM, fune: 'altro', altroD: '10', altroSezione: '' });
    assert.deepEqual(Object.keys(errori).sort(), ['altroMassa', 'altroRottura', 'altroSezione']);
  });

  it('reads a stored calculation with distrust', () => {
    assert.equal(datiSalvati({ ...RT.casi.A_2v_11_cuneo!.dati, fune: 'nessuna' }), null);
    assert.equal(datiSalvati({ ...RT.casi.A_2v_11_cuneo!.dati, extra: 1 }), null);
    assert.equal(datiSalvati('x'), null);
  });
});
