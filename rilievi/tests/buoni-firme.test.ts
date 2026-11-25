// "Buono di lavoro": every signature is optional and bound to what it signs — a row signature to its row, a
// check signature to its outcome, the bottom ones to the whole sheet (rows and their signatures included);
// a signed place does not change silently, the same strokes twice are a copy, and a signature counts only
// with its seal, its strokes and the same signed content.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  improntaBuono,
  improntaControllo,
  improntaRiga,
  pianoFirme,
  sigilloFirma,
  statoFirme,
  type FirmaDelBuono,
} from '../src/buoni/firme.js';
import type { BuonoData } from '../src/buoni/form.js';
import { postoControllo, postoFinale, postoRiga, tipoPosto } from '../src/buoni/posti.js';
import { FIRME_FINALI } from '../src/buoni/voci.js';
import { improntaFirma } from '../src/interventi/sigillo.js';
import { firma, FULL, parsed } from './buoni-dati.js';

function sheet(): BuonoData {
  return parsed(FULL).data;
}

const KEY = Buffer.alloc(32, 7);

describe('buono di lavoro: signatures bound to what they sign', () => {
  it('names every place of a signature', () => {
    assert.equal(tipoPosto(postoRiga('0a1b2c3d')), 'riga');
    assert.equal(tipoPosto(postoControllo('porteEsterne')), 'controllo');
    for (const f of FIRME_FINALI) assert.equal(tipoPosto(postoFinale(f)), 'finale');
    for (const bad of ['s-XYZ', 'c-nope', 'f-cliente', 's-0a1b2c3d ', 42])
      assert.equal(tipoPosto(bad), null);
  });

  it('a new row signature signs its row', () => {
    const data = sheet();
    const plan = pianoFirme({
      ambito: 'lavoro',
      salvate: [],
      data,
      nuove: new Map([['s-aaaaaaaa', firma(1)]]),
      togli: new Set(),
    });
    assert.ok(plan.ok);
    assert.equal(plan.aggiungi[0]!.impronta, improntaRiga(data.sequenze[0]!));
    assert.equal(plan.aggiungi[0]!.hash, improntaFirma(firma(1)));
  });

  it('a signed row does not change silently; "Togli la firma" lets it change', () => {
    const data = sheet();
    const salvata = {
      posto: 's-aaaaaaaa',
      hash: improntaFirma(firma(1)),
      impronta: improntaRiga(data.sequenze[0]!),
    };
    const changed = structuredClone(data);
    changed.sequenze[0]!.esito = 'nonOk';
    const blocked = pianoFirme({
      ambito: 'lavoro',
      salvate: [salvata],
      data: changed,
      nuove: new Map(),
      togli: new Set(),
    });
    assert.deepEqual(blocked, { ok: false, errori: { 's-aaaaaaaa': 'modificata' } });
    const freed = pianoFirme({
      ambito: 'lavoro',
      salvate: [salvata],
      data: changed,
      nuove: new Map(),
      togli: new Set(['s-aaaaaaaa']),
    });
    assert.deepEqual(freed, { ok: true, togli: ['s-aaaaaaaa'], aggiungi: [] });
    // Unchanged: nothing to do.
    assert.deepEqual(
      pianoFirme({
        ambito: 'lavoro',
        salvate: [salvata],
        data,
        nuove: new Map(),
        togli: new Set(),
      }),
      { ok: true, togli: [], aggiungi: [] },
    );
  });

  it('a signed row cannot be removed, a signed check cannot change its outcome', () => {
    const data = sheet();
    const riga = { posto: 's-aaaaaaaa', hash: 'h1', impronta: improntaRiga(data.sequenze[0]!) };
    const ctl = {
      posto: 'c-limitatore',
      hash: 'h2',
      impronta: improntaControllo('limitatore', data.controlli.limitatore),
    };
    const changed = structuredClone(data);
    changed.sequenze.shift();
    changed.controlli.limitatore.data = '2026-11-21';
    const plan = pianoFirme({
      ambito: 'lavoro',
      salvate: [riga, ctl],
      data: changed,
      nuove: new Map(),
      togli: new Set(),
    });
    assert.deepEqual(plan, {
      ok: false,
      errori: { 's-aaaaaaaa': 'tolta', 'c-limitatore': 'modificata' },
    });
  });

  it('the same strokes on two places are a copied signature', () => {
    const data = sheet();
    const twice = pianoFirme({
      ambito: 'lavoro',
      salvate: [],
      data,
      nuove: new Map([
        ['s-aaaaaaaa', firma(1)],
        ['s-00000000', firma(1)],
      ]),
      togli: new Set(),
    });
    assert.deepEqual(twice, { ok: false, errori: { 's-00000000': 'uguale' } });
    const again = pianoFirme({
      ambito: 'lavoro',
      salvate: [
        {
          posto: 's-aaaaaaaa',
          hash: improntaFirma(firma(1)),
          impronta: improntaRiga(data.sequenze[0]!),
        },
      ],
      data,
      nuove: new Map([['s-00000000', firma(1)]]),
      togli: new Set(),
    });
    assert.deepEqual(again, { ok: false, errori: { 's-00000000': 'uguale' } });
  });

  it('each form touches only its own places', () => {
    const data = sheet();
    const lavoro = pianoFirme({
      ambito: 'lavoro',
      salvate: [],
      data,
      nuove: new Map([['f-custode', firma(1)]]),
      togli: new Set(),
    });
    assert.deepEqual(lavoro, { ok: true, togli: [], aggiungi: [] });
    const finali = pianoFirme({
      ambito: 'finali',
      salvate: [],
      data,
      nuove: new Map([
        ['s-aaaaaaaa', firma(1)],
        ['f-custode', firma(2)],
      ]),
      togli: new Set(),
    });
    assert.ok(finali.ok);
    assert.deepEqual(
      finali.aggiungi.map((f) => f.posto),
      ['f-custode'],
    );
  });

  it('the bottom signatures sign the whole sheet, row signatures included', () => {
    const data = sheet();
    const rowSig = {
      posto: 's-aaaaaaaa',
      hash: improntaFirma(firma(1)),
      impronta: improntaRiga(data.sequenze[0]!),
    };
    const plan = pianoFirme({
      ambito: 'finali',
      salvate: [rowSig],
      data,
      nuove: new Map([['f-capoTecnico', firma(2)]]),
      togli: new Set(),
    });
    assert.ok(plan.ok);
    const whole = improntaBuono(data, [rowSig]);
    assert.equal(plan.aggiungi[0]!.impronta, whole);
    // Anything written, and any row signature, changes what the bottom signatures signed.
    const other = structuredClone(data);
    other.tecnici = 'Bianchi';
    assert.notEqual(improntaBuono(other, [rowSig]), whole);
    assert.notEqual(improntaBuono(data, []), whole);
    // The bottom signatures themselves are not part of it.
    assert.equal(improntaBuono(data, [rowSig, { posto: 'f-geometra', hash: 'x' }]), whole);
  });

  it('a signature is valid only with its seal, its strokes and the same signed content', () => {
    const data = sheet();
    const firmatoAt = new Date('2026-11-16T09:00:00.000Z');
    const base = {
      buonoId: 'cbuono00000000000000000001',
      posto: 's-aaaaaaaa',
      hash: improntaFirma(firma(1)),
      impronta: improntaRiga(data.sequenze[0]!),
      firmatoAt,
      firmatoDaId: 'cuser',
      tratti: firma(1),
    };
    const ok: FirmaDelBuono = { ...base, sigillo: sigilloFirma(KEY, base) };
    assert.equal(statoFirme(KEY, data, [ok]).get('s-aaaaaaaa')!.valida, true);

    const otherKey = statoFirme(Buffer.alloc(32, 8), data, [ok]).get('s-aaaaaaaa')!;
    assert.equal(otherKey.valida, false);
    const moved = statoFirme(KEY, data, [{ ...ok, buonoId: 'cbuono00000000000000000002' }]);
    assert.equal(moved.get('s-aaaaaaaa')!.valida, false);
    const strokes = statoFirme(KEY, data, [{ ...ok, tratti: firma(9) }]);
    assert.equal(strokes.get('s-aaaaaaaa')!.valida, false);
    const changed = structuredClone(data);
    changed.sequenze[0]!.fornitore = 'Altro';
    assert.equal(statoFirme(KEY, changed, [ok]).get('s-aaaaaaaa')!.valida, false);
    const garbage = statoFirme(KEY, data, [{ ...ok, sigillo: 'zz' }]);
    assert.equal(garbage.get('s-aaaaaaaa')!.valida, false);
  });
});
