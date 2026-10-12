// Rilievi — the suppliers' modules (Pelazza's order form for control panels, Montanari's quotation request for
// machines), ported from rilievi's tests/ordini.test.ts (commit 174a1e3aa), the pure part: the maps (fields, boxes on
// the page), the values (a tick only "si", text cleaned and bounded, only the module's keys read back), the prefill from
// the survey, the questions that open them. The official PDFs, their SHA-256 and the filled PDFs:
// src/server/__tests__/rilievi-moduli.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fieldsOf, MONTANARI, PELAZZA } from '@/lib/rilievi/ordini/moduli';
import { moduloFieldOf, moduloSpec, withPrefill } from '@/lib/rilievi/ordini/form';
import { prefillValori, rifImpianto } from '@/lib/rilievi/ordini/prefill';
import { SLOTS, slotByPath } from '@/lib/rilievi/ordini/registry';
import { moduloFormValues, moduloFromBody, parseModulo, storedValori } from '@/lib/rilievi/ordini/valori';
import { parseScheda } from '@/lib/rilievi/validation';

const A4 = { width: 595.32, height: 841.92 };

describe('the supplier forms', () => {
  it('map every field of the official PDFs they were measured on', () => {
    assert.equal(PELAZZA.sha256, '974721c0160453193bb54ee4966cf91602eb2916080235675d56ff66cbc62598');
    assert.equal(MONTANARI.sha256, '698bb1ea3e4edef2c9ed21e04aa9e0398a25d2e4d503e60fab80acf69445b131');
    assert.equal(fieldsOf(PELAZZA).length, 152);
    assert.equal(fieldsOf(MONTANARI).length, 75);
    assert.deepEqual(SLOTS.map((s) => [s.column, s.question, s.prefix, s.path, s.modulo.id]), [
      ['ordineQuadro', 'quadroOrdine', 'oq', 'ordine-quadro', 'pelazza-ordine-quadri-032026'],
      ['preventivoArgano', 'arganoPreventivo', 'pa', 'preventivo-argano', 'montanari-richiesta-preventivo-argani-ita'],
    ]);
    assert.equal(slotByPath('ordine-quadro')?.modulo.id, PELAZZA.id);
    assert.equal(slotByPath('pdf'), undefined);
  });

  it('place every Pelazza box and line on the page, boxes at the size of the printed squares', () => {
    for (const field of fieldsOf(PELAZZA)) {
      if ('box' in field) {
        const [x0, y0, x1, y1] = field.box;
        assert.ok(x1 - x0 > 7 && x1 - x0 < 13, `${field.key} width ${x1 - x0}`);
        assert.ok(y1 - y0 > 6 && y1 - y0 < 12, `${field.key} height ${y1 - y0}`);
        assert.ok(x0 > 0 && x1 < A4.width && y0 > 0 && y1 < A4.height, field.key);
      } else if ('line' in field) {
        const [x0, x1, y] = field.line;
        assert.ok(x0 < x1 && x0 > 0 && x1 < A4.width && y > 0 && y < A4.height, field.key);
      }
    }
  });

  it('describe each module for the form in the order of the paper, the labels verbatim', () => {
    const slot = SLOTS[0];
    assert.ok(slot);
    const spec = moduloSpec(slot);
    assert.equal(spec.shownName, 'oq-_');
    assert.equal(spec.gruppi[0]?.titolo, 'Intestazione');
    assert.deepEqual(spec.gruppi[0]?.righe[0]?.campi.map((c) => [c.name, c.kind, c.label, c.prefill]), [
      ['oq-offerta', 'check', 'OFFERTA', null],
      ['oq-ordine', 'check', 'ORDINE', null],
      ['oq-data', 'text', 'Data:', 'data'],
    ]);
    assert.equal(spec.gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).length, 152);
    assert.ok(spec.gruppi.flatMap((g) => g.righe).some((r) => r.freccia === 1));
    assert.equal(moduloFieldOf('oq-quantita')?.field.label, 'Quantità:');
    assert.equal(moduloFieldOf('pa-cap')?.slot.modulo.fornitore, 'Montanari Group');
    assert.equal(moduloFieldOf('oq-nonEsiste'), null);
  });
});

describe('the values of a supplier form', () => {
  it('take a tick only as "si", and clean and bound the text', () => {
    const { dati, errors } = parseModulo(PELAZZA, 'oq', {
      'oq-ordine': 'si', 'oq-offerta': '', 'oq-cliente': '  Ascensori   Rossi  ', 'oq-nFermate': '6', 'oq-quantita': '1234567', 'oq-porteManuali': 'on', 'oq-nonEsiste': 'x',
    });
    assert.deepEqual(dati.valori, { ordine: true, cliente: 'Ascensori Rossi', nFermate: '6' });
    assert.equal(dati.modulo, PELAZZA.id);
    assert.equal(errors['oq-quantita'], 'tooLong');
    assert.equal(errors['oq-porteManuali'], 'invalid');
  });

  it('read back only the keys of the form, of the right kind', () => {
    const valori = storedValori(PELAZZA, { modulo: PELAZZA.id, valori: { ordine: true, cliente: 'Rossi', nFermate: true, altro: 'x', offerta: 'si' } });
    assert.deepEqual(valori, { ordine: true, cliente: 'Rossi' });
    assert.equal(storedValori(PELAZZA, null), null);
    assert.equal(storedValori(PELAZZA, ['x']), null);
    assert.deepEqual(storedValori(PELAZZA, { modulo: PELAZZA.id, valori: {} }), {}, 'an empty module is still a module');
  });

  it('come back to the form with the mark that they were shown, and keep what was typed after an error', () => {
    const values = moduloFormValues(PELAZZA, 'oq', { ordine: true, cliente: 'Rossi' });
    assert.equal(values['oq-_'], '1');
    assert.equal(values['oq-ordine'], 'si');
    assert.equal(values['oq-offerta'], '');
    assert.equal(values['oq-cliente'], 'Rossi');
    const sent = moduloFromBody(PELAZZA, 'oq', { 'oq-_': '1', 'oq-cliente': ['a', 'b'], 'oq-data': 'x'.repeat(6000) });
    assert.equal(sent['oq-_'], '1');
    assert.equal(sent['oq-cliente'], '');
    assert.equal(String(sent['oq-data']).length, 5000);
    assert.equal(moduloFromBody(PELAZZA, 'oq', { 'oq-_': 'x' })['oq-_'], undefined);
  });
});

describe('prefilling from the survey', () => {
  const ctx = {
    values: {
      data: '2026-10-12', numeroImpianto: '104552', matricola: '', indirizzo: 'Via Verdi 14, Milano', fermate: '6', doppioAccesso: 'si',
      tipoPorte: ['AUTOMATICHE'], ubicazioneMacchina: ['ALTO'], portataKg: '630', funiNumero: '4', funiDiametroMm: '10,5',
    },
    azienda: 'Ascensori Rossi Srl',
    utente: 'Mario Bianchi',
    ruolo: 'Tecnico',
    email: 'mario@example.it',
  };

  it('fills the Pelazza order with the date, the lift, the stops, the entrances and the doors', () => {
    assert.equal(rifImpianto(ctx.values), 'N° 104552 — Via Verdi 14, Milano');
    assert.deepEqual(prefillValori(PELAZZA, ctx), {
      data: '12/10/2026',
      cliente: 'Ascensori Rossi Srl',
      rifImpianto: 'N° 104552 — Via Verdi 14, Milano',
      porteAutomatiche: true,
      nFermate: '6',
      nAccessi: '2',
    });
  });

  it('fills the Montanari request with the company, the person, the load and the ropes', () => {
    const valori = prefillValori(MONTANARI, ctx);
    assert.equal(valori.ragioneSociale, 'Ascensori Rossi Srl');
    assert.equal(valori.nomeCognome, 'Mario Bianchi');
    assert.equal(valori.ruolo, 'Tecnico');
    assert.equal(valori.email, 'mario@example.it');
    assert.equal(valori.portata, '630');
    assert.equal(valori.fermate, '6');
    assert.equal(valori.macchinaAlto, true);
    assert.equal(valori.macchinaBasso, undefined);
    assert.equal(valori.funiN, '4');
    assert.equal(valori.funiDiam, '10,5');
    assert.ok(String(valori.riferimentoImpianto).length <= 37, 'cut to the width of the field');
  });

  it('prefills a module only at its first opening (no `<prefix>-_` mark yet)', () => {
    const first = withPrefill(ctx.values, ctx);
    assert.equal(first['oq-_'], '1');
    assert.equal(first['oq-nFermate'], '6');
    assert.equal(first['pa-portata'], '630');
    const again = withPrefill({ ...ctx.values, 'oq-_': '1', 'oq-nFermate': '' }, ctx);
    assert.equal(again['oq-nFermate'], '', 'what the person emptied stays empty');
    assert.equal(again['pa-portata'], '630', 'the other module was never shown');
  });
});

describe('the questions that open the supplier forms', () => {
  const minimal = { data: '2026-10-12', matricola: '33871' };

  it('read the Pelazza order only for a Pelazza panel and only with "si"', () => {
    const order = { 'oq-ordine': 'si', 'oq-nFermate': '6', 'oq-_': '1' };
    const yes = parseScheda({ ...minimal, quadroMarca: 'PELAZZA', quadroOrdine: 'si', ...order });
    assert.ok(yes.ok);
    assert.deepEqual(yes.ok && yes.data.ordineQuadro?.valori, { ordine: true, nFermate: '6' });
    const other = parseScheda({ ...minimal, quadroMarca: 'DMG', quadroOrdine: 'si', ...order });
    assert.ok(other.ok);
    assert.equal(other.ok && other.data.quadroOrdine, null, 'the question is not asked for DMG');
    assert.equal(other.ok && other.data.ordineQuadro, null);
    const no = parseScheda({ ...minimal, quadroMarca: 'PELAZZA', quadroOrdine: 'no', ...order });
    assert.equal(no.ok && no.data.ordineQuadro, null);
  });

  it('keep the other make only with "Altro", and report errors in a form under its own name', () => {
    const altro = parseScheda({ ...minimal, arganoMarca: 'ALTRO', arganoMarcaAltro: 'Sassi' });
    assert.equal(altro.ok && altro.data.arganoMarcaAltro, 'Sassi');
    const montanari = parseScheda({ ...minimal, arganoMarca: 'MONTANARI', arganoMarcaAltro: 'Sassi', arganoPreventivo: 'si', 'pa-cap': 'x'.repeat(40) });
    assert.equal(montanari.ok, false);
    assert.equal(!montanari.ok && montanari.errors['pa-cap'], 'tooLong');
    const valid = parseScheda({ ...minimal, arganoMarca: 'MONTANARI', arganoMarcaAltro: 'Sassi' });
    assert.equal(valid.ok && valid.data.arganoMarcaAltro, null);
  });
});
