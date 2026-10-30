import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARGANI, nomeModulo, PELAZZA, SG } from '../src/ordini/moduli.js';
import { moduliStampatiDi, riepilogoModuli } from '../src/ordini/riepilogo.js';
import { riepilogoFromBody, riepilogoSchema } from '../src/schede/stampa.js';

describe('the orders in the sheet print', () => {
  const ordine = {
    modulo: PELAZZA.id,
    valori: { ordine: true, velocita: '1,0', nFermate: '5', note: 'Consegna in cantiere' },
  };
  const scheda = {
    riepilogoOrdini: true,
    moduliStampati: [] as string[],
    quadroMarca: 'PELAZZA' as const,
    quadroModello: null,
    tipoImpianto: [],
    quadroOrdine: true,
    ordineQuadro: ordine,
    arganoPreventivo: false,
    preventivoArgano: { modulo: ARGANI.id, valori: { taglia12: true } },
    sospensioni: null,
    operatore: null,
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

describe('each order chosen for the sheet print on its own', () => {
  const tutti = {
    riepilogoOrdini: true,
    moduliStampati: [] as string[],
    quadroMarca: 'PELAZZA' as const,
    quadroModello: null,
    tipoImpianto: [],
    quadroOrdine: true,
    ordineQuadro: { modulo: PELAZZA.id, valori: { ordine: true } },
    arganoPreventivo: true,
    preventivoArgano: { modulo: ARGANI.id, valori: { taglia12: true } },
    sospensioni: true as boolean | null,
    operatore: null as boolean | null,
    ordineSospensioni: { modulo: SG.id, valori: { automatico: true } },
  };
  const nomi = (scheda: typeof tutti) => riepilogoModuli(scheda).map((modulo) => modulo.nome);

  it('prints only the ticked ones, in the order of the sheet', () => {
    assert.deepEqual(nomi({ ...tutti, moduliStampati: ['preventivoArgano'] }), [
      'Modulo rilievi dati argani',
    ]);
    assert.deepEqual(nomi({ ...tutti, moduliStampati: ['ordineSospensioni', 'ordineQuadro'] }), [
      nomeModulo(PELAZZA),
      nomeModulo(SG),
    ]);
    assert.deepEqual(
      nomi({ ...tutti, riepilogoOrdini: false, moduliStampati: ['ordineQuadro'] }),
      [],
    );
  });

  it('prints the 2SG sheet of a semi-automatic lift (the operator) once', () => {
    const semi = { ...tutti, sospensioni: null, operatore: true };
    assert.deepEqual(nomi({ ...semi, moduliStampati: ['ordineSospensioni'] }), [nomeModulo(SG)]);
    assert.deepEqual(
      nomi({ ...tutti, operatore: true, moduliStampati: ['ordineSospensioni'] }),
      [nomeModulo(SG)],
      'one column, one sheet',
    );
  });

  it('keeps all three for a sheet saved with the one box of before', () => {
    assert.deepEqual(moduliStampatiDi(tutti), [
      'ordineQuadro',
      'preventivoArgano',
      'ordineSospensioni',
    ]);
    assert.equal(nomi(tutti).length, 3);
  });

  it('reads the ticked boxes of the form, the one box of an old page, and nothing forged', () => {
    const parse = (value: unknown) => riepilogoSchema.safeParse(value);
    assert.deepEqual(parse(['ordineSospensioni', 'ordineQuadro']).data, [
      'ordineQuadro',
      'ordineSospensioni',
    ]);
    assert.deepEqual(parse('preventivoArgano').data, ['preventivoArgano']);
    assert.deepEqual(parse(undefined).data, []);
    assert.deepEqual(parse('1').data, ['ordineQuadro', 'preventivoArgano', 'ordineSospensioni']);
    for (const forged of ['yes', 'constructor', ['ordineQuadro', 'note'], { a: 1 }]) {
      assert.equal(parse(forged).success, false, JSON.stringify(forged));
    }
    assert.deepEqual(riepilogoFromBody({ riepilogoOrdini: ['ordineSospensioni', 'x'] }), [
      'ordineSospensioni',
    ]);
  });
});
