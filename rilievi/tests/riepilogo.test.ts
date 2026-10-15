import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARGANI, nomeModulo, PELAZZA, SG } from '../src/ordini/moduli.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';

describe('the orders in the sheet print', () => {
  const ordine = {
    modulo: PELAZZA.id,
    valori: { ordine: true, velocita: '1,0', nFermate: '5', note: 'Consegna in cantiere' },
  };
  const scheda = {
    riepilogoOrdini: true,
    quadroMarca: 'PELAZZA' as const,
    quadroModello: null,
    quadroOrdine: true,
    ordineQuadro: ordine,
    arganoPreventivo: false,
    preventivoArgano: { modulo: ARGANI.id, valori: { taglia12: true } },
    sospensioni: null,
    ordineSospensioni: null,
  };

  it('come in only when the sheet asks for them, with what is filled in', () => {
    assert.deepEqual(riepilogoModuli({ ...scheda, riepilogoOrdini: false }), []);
    assert.deepEqual(riepilogoModuli(scheda), [
      {
        nome: nomeModulo(PELAZZA),
        gruppi: [
          { titolo: 'Intestazione', spunte: ['ORDINE'], testi: [] },
          {
            titolo: 'Porte',
            spunte: [],
            testi: [
              { label: 'Velocità m/s', value: '1,0' },
              { label: 'N° Fermate', value: '5' },
            ],
          },
          {
            titolo: 'Consegna e note',
            spunte: [],
            testi: [{ label: 'NOTE', value: 'Consegna in cantiere' }],
          },
        ],
      },
    ]);
  });

  it('bring the argano sheet by its title alone and the 2SG sheet with its supplier', () => {
    const tutti = {
      ...scheda,
      quadroOrdine: false,
      arganoPreventivo: true,
      sospensioni: true,
      ordineSospensioni: { modulo: SG.id, valori: { automatico: true, ordNo: '77' } },
    };
    assert.deepEqual(riepilogoModuli(tutti), [
      {
        nome: 'Modulo rilievi dati argani',
        gruppi: [{ titolo: 'Cabina e corsa', spunte: ['Taglia 1:2'], testi: [] }],
      },
      {
        nome: 'Modulo ordine operatori e sospensioni · 2SG S.r.l.',
        gruppi: [
          { titolo: 'Intestazione', spunte: [], testi: [{ label: 'ORD No', value: '77' }] },
          { titolo: 'Porte di cabina (operatore)', spunte: ['AUTOMATICO'], testi: [] },
        ],
      },
    ]);
  });
});
