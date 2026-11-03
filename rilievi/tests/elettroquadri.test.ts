// The Elettroquadri panel orders (Bisuschio): three official forms — geared, gearless and hydraulic —
// and no second question: the form follows the kind of lift the sheet ticks (the owner, 30 October 2026:
// electric → geared, MRL → gearless, hydraulic → oleodinamico).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prefillCollegati } from '../src/ordini/collegati.js';
import { EQ_GEARED, EQ_GEARLESS, EQ_OLEO, nomeModulo } from '../src/ordini/moduli.js';
import { impiantoMancante, sceltoNellaScheda, SLOTS } from '../src/ordini/registry.js';
import { riepilogoModuli } from '../src/ordini/riepilogo.js';
import { activeFields } from '../src/schede/fields.js';
import { parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-30', matricola: '33871' };
const slotOf = (prefix: string) => SLOTS.find((slot) => slot.prefix === prefix)!;

describe('the form of the Elettroquadri make follows the kind of lift', () => {
  // Every form was opened on the page before (its marker sent) — only the one of the kind is kept.
  const order = (tipoImpianto: string | string[]) => ({
    ...minimal,
    quadroMarca: 'ELETTROQUADRI',
    quadroOrdine: 'si',
    tipoImpianto,
    'eg-_': '1',
    'eg-nFermate': '5',
    'el-_': '1',
    'el-nFermate': '6',
    'eo-_': '1',
    'eo-nFermate': '7',
  });

  it('opens geared for electric, gearless for MRL and oleodinamico for hydraulic — one of them', () => {
    const cases = [
      ['ELETTRICO', EQ_GEARED, '5'],
      ['GEARLESS', EQ_GEARLESS, '6'],
      ['IDRAULICO', EQ_OLEO, '7'],
    ] as const;
    for (const [tipo, modulo, fermate] of cases) {
      // The radio sends one value; a list (a forged or older body) reads the same.
      for (const sent of [tipo, [tipo]]) {
        const parsed = parseScheda(order(sent));
        assert.ok(parsed.ok, tipo);
        assert.deepEqual(parsed.ok && parsed.data.ordineQuadro, {
          modulo: modulo.id,
          valori: { nFermate: fermate },
        });
      }
    }
  });

  it('asks the kind of lift before the order: "Sì" without it is an error on the kind', () => {
    const { tipoImpianto: _, ...senza } = order('ELETTRICO');
    const missing = parseScheda(senza);
    assert.equal(missing.ok, false);
    assert.equal(!missing.ok && missing.errors.tipoImpianto, 'impiantoNeeded');
    const no = parseScheda({ ...minimal, quadroMarca: 'ELETTROQUADRI', quadroOrdine: 'no' });
    assert.ok(no.ok, 'no order, no kind needed');
    assert.equal(no.ok && no.data.ordineQuadro, null);
    // Another make: the kind of lift opens nothing of Elettroquadri and is never asked for.
    const shown = activeFields((key) => ({ quadroMarca: 'PELAZZA' })[key]);
    assert.equal(
      impiantoMancante(shown, () => 'si'),
      null,
    );
    const pelazza = parseScheda({
      ...order('ELETTRICO'),
      quadroMarca: 'PELAZZA',
      'oq-_': '1',
      'oq-nFermate': '4',
    });
    assert.ok(pelazza.ok);
    assert.equal(pelazza.ok && pelazza.data.ordineQuadro?.modulo, 'pelazza-ordine-quadri-032026');
  });

  it('serves each PDF only for the make and the kind the saved sheet chose', () => {
    const saved = { quadroMarca: 'ELETTROQUADRI', tipoImpianto: ['IDRAULICO'] } as Record<
      string,
      unknown
    >;
    const scelto = (prefix: string) => sceltoNellaScheda(slotOf(prefix), (key) => saved[key]);
    assert.equal(scelto('eo'), true);
    assert.equal(scelto('eg'), false);
    assert.equal(scelto('el'), false);
    assert.equal(scelto('oq'), false);
    assert.equal(scelto('pa'), true, 'no make, any make');
    saved.tipoImpianto = [];
    assert.equal(scelto('eg') || scelto('el') || scelto('eo'), false, 'no kind, no form');
  });
});

describe('the Elettroquadri orders and the sheet', () => {
  const values = {
    ...minimal,
    fermate: '6',
    tipoPorte: ['AUTOMATICHE'],
    doppioAccesso: 'si',
    ubicazioneMacchina: ['ALTO'],
    quadroMarca: 'ELETTROQUADRI',
    quadroOrdine: 'si',
    arganoPreventivo: 'si',
    'pa-motoreInverter': 'si',
    'pa-velocita': '1,0',
    'pa-corsa': '15',
    'pa-tensioneFreno': '180',
    'pa-potenzaKw': '5,5',
    'pa-ampere': '12',
  };

  it('take the stops, the accesses, the machine room and the argano data', () => {
    assert.deepEqual(prefillCollegati('eg', { ...values, tipoImpianto: ['ELETTRICO'] }), {
      nFermate: '6',
      velocita: '1,0',
      conVvvf: true,
      corsa: '15',
      frenoV: '180',
      accessi2: true,
      motoreIn: '12',
      motoreKw: '5,5',
    });
    assert.deepEqual(prefillCollegati('el', { ...values, tipoImpianto: ['GEARLESS'] }), {
      nFermate: '6',
      velocita: '1,0',
      corsa: '15',
      frenoVcc: '180',
      accessi2: true,
      // MRL: the kind of lift, not "Con Locale macchina: Alto" — the machine is in the shaft.
      mrlGearless: true,
      motoreAmp: '12',
      motoreKw: '5,5',
    });
    // Hydraulic: no argano sheet — the power unit of the sheet instead.
    assert.deepEqual(
      prefillCollegati('eo', {
        ...values,
        tipoImpianto: ['IDRAULICO'],
        centralinaDaFare: 'si',
        centralinaMarca: 'GMV',
      }),
      { nFermate: '6', accessi2: true, centralinaAlto: true, centralinaMarca: 'GMV' },
    );
  });

  it('come into the sheet print only under their kind of lift', () => {
    const scheda = {
      riepilogoOrdini: true,
      moduliStampati: ['ordineQuadro'],
      quadroMarca: 'ELETTROQUADRI' as const,
      quadroModello: null,
      tipoImpianto: ['IDRAULICO' as const],
      quadroOrdine: true,
      ordineQuadro: { modulo: EQ_OLEO.id, valori: { nFermate: '7', softStarter: true } },
      arganoPreventivo: null,
      preventivoArgano: null,
      sospensioni: null,
      operatore: null,
      ordineSospensioni: null,
      ami100: null,
      ami100Tipo: null,
      ordineAmi: null,
    };
    const [summary] = riepilogoModuli(scheda);
    assert.equal(summary?.nome, nomeModulo(EQ_OLEO));
    assert.deepEqual(
      summary?.gruppi.flatMap((g) => g.testi),
      [{ label: 'N° fermate', value: '7' }],
    );
    assert.deepEqual(riepilogoModuli({ ...scheda, tipoImpianto: ['ELETTRICO'] }), []);
  });
});
