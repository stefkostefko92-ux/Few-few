// Rilievi — the suppliers' modules (Pelazza's and MoviLift's order forms for control panels, the argano data sheet,
// 2SG's sheet for the suspensions and the car operator), ported from rilievi's tests/ordini.test.ts (commit ae6329cb6),
// the pure part: the maps (fields, boxes and lines on the page), the values (a tick only "si", text cleaned and bounded,
// only the module's keys read back), the prefill from the survey, the questions that open them. The official PDFs, their
// SHA-256 and the filled PDFs: src/server/__tests__/rilievi-moduli.test.ts; MoviLift: rilievi-movilift.test.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ARGANI, fieldsOf, MODULI, MOVILIFT, nomeModulo, PELAZZA, SG } from '@/lib/rilievi/ordini/moduli';
import { moduloFieldOf, moduloSpec, moduloSpecs, withPrefill } from '@/lib/rilievi/ordini/form';
import { prefillValori, rifImpianto } from '@/lib/rilievi/ordini/prefill';
import { SLOTS, slotByPath } from '@/lib/rilievi/ordini/registry';
import { moduloFormValues, moduloFromBody, parseModulo, storedValori } from '@/lib/rilievi/ordini/valori';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { parseScheda } from '@/lib/rilievi/validation';

const t = rilieviTranslator();
const A4 = { width: 595.32, height: 841.92 };

describe('the supplier forms', () => {
  it('map every field of the official PDFs they were measured on', () => {
    assert.equal(PELAZZA.sha256, '974721c0160453193bb54ee4966cf91602eb2916080235675d56ff66cbc62598');
    assert.equal(MOVILIFT.sha256, '13f698745c72bd52e5ae912ae6e552507b3a639d33b33db6ac6392c47c2a6c55');
    assert.equal(ARGANI.sha256, 'a724e51afca123545b5ff2e2f55e5ef743ef0b913a5d2fe0678c4a0f0062fa05');
    assert.equal(SG.sha256, 'c199143b61c7a1fac02dc81083a40f2243fff089d6fc0808cc32b2ff7a605bc6');
    assert.equal(fieldsOf(PELAZZA).length, 152);
    assert.equal(fieldsOf(MOVILIFT).length, 128);
    assert.equal(fieldsOf(ARGANI).length, 36);
    assert.equal(fieldsOf(SG).length, 89);
    assert.deepEqual(MODULI.map((m) => m.id), ['pelazza-ordine-quadri-032026', 'movilift-modulo-ordine-scelta-v2-6', 'rilievo-dati-argani', '2sg-ordine-porte']);
    assert.deepEqual(SLOTS.map((s) => [s.column, s.question, s.prefix, s.path, s.modulo.id, s.marca?.value ?? null]), [
      ['ordineQuadro', 'quadroOrdine', 'oq', 'ordine-quadro', 'pelazza-ordine-quadri-032026', 'PELAZZA'],
      ['ordineQuadro', 'quadroOrdine', 'om', 'ordine-quadro-movilift', 'movilift-modulo-ordine-scelta-v2-6', 'MOVILIFT'],
      ['preventivoArgano', 'arganoPreventivo', 'pa', 'dati-argano', 'rilievo-dati-argani', null],
      ['ordineSospensioni', 'sospensioni', 'sg', 'sospensioni-2sg', '2sg-ordine-porte', null],
    ]);
    assert.equal(slotByPath('ordine-quadro')?.modulo.id, PELAZZA.id);
    assert.equal(slotByPath('preventivo-argano'), undefined, 'the Montanari request is gone');
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

  it('place every box and line of the argano sheet and of the 2SG sheet on the page', () => {
    for (const modulo of [ARGANI, SG]) {
      for (const field of fieldsOf(modulo)) {
        const where = `${modulo.id} ${field.key}`;
        if ('box' in field) {
          const [x0, y0, x1, y1] = field.box;
          assert.ok(x1 - x0 > 5 && x1 - x0 < 14 && y1 - y0 > 4 && y1 - y0 < 18, where);
          assert.ok(x0 > 0 && x1 < A4.width && y0 > 0 && y1 < A4.height, where);
        } else if ('line' in field) {
          const [x0, x1, y] = field.line;
          assert.ok(x1 - x0 >= 25 && x0 > 0 && x1 < A4.width && y > 0 && y < A4.height, where);
        } else if ('area' in field) {
          const [x0, top, x1, bottom] = field.area;
          assert.ok(x0 < x1 && top < bottom && x1 < A4.width && bottom < A4.height, where);
          // the written lines of a box with lines of its own (2SG's NOTE) are inside it, top down
          const righe = field.righe ?? [];
          for (const [i, y] of righe.entries()) assert.ok(y > top && y < bottom && (i === 0 || y > (righe[i - 1] ?? 0)), where);
        }
      }
    }
  });

  it('are named with the supplier, or by the title alone when the sheet has none', () => {
    assert.equal(nomeModulo(SG), 'Modulo ordine operatori e sospensioni · 2SG S.r.l.');
    assert.equal(nomeModulo(ARGANI), 'Modulo rilievi dati argani');
    assert.equal(SG.ruota, 180, 'the scanned 2SG sheet is upside down');
  });

  it('describe each module for the form in the order of the paper, the labels verbatim', () => {
    const slot = SLOTS[0];
    assert.ok(slot);
    const spec = moduloSpec(slot);
    assert.equal(spec.shownName, 'oq-_');
    assert.deepEqual(spec.marca, { field: 'quadroMarca', value: 'PELAZZA' });
    assert.equal(spec.gruppi[0]?.titolo, 'Intestazione');
    assert.deepEqual(spec.gruppi[0]?.righe[0]?.campi.map((c) => [c.name, c.kind, c.label, c.prefill]), [
      ['oq-offerta', 'check', 'OFFERTA', null],
      ['oq-ordine', 'check', 'ORDINE', null],
      ['oq-data', 'text', 'Data:', 'data'],
    ]);
    assert.equal(spec.gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).length, 152);
    assert.ok(spec.gruppi.flatMap((g) => g.righe).some((r) => r.freccia === 1));
    assert.deepEqual(spec.gruppi.find((g) => g.titolo === 'Porte')?.diff, ['fermate', 'velocita', 'corsa', 'porte', 'accessi'], 'the discrepancies listed under the group');
    const [, movilift, argani] = moduloSpecs();
    assert.equal(argani?.fornitore, null);
    assert.equal(argani?.nome, 'Modulo rilievi dati argani');
    const controllo = movilift?.gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).find((c) => c.key === 'controllo');
    assert.deepEqual([controllo?.kind, controllo?.predefinito, controllo?.opzioni?.map((o) => o.valore)], ['radio', 'scheda', ['plc', 'scheda']]);
    const voltA = movilift?.gruppi.flatMap((g) => g.righe.flatMap((r) => r.campi)).find((c) => c.key === 'voltA');
    assert.equal(voltA?.kind, 'select');
    assert.ok(voltA?.opzioni?.some((o) => o.valore === '24Vcc' && o.label === '24Vcc'));
    assert.equal(moduloFieldOf('oq-quantita')?.field.label, 'Quantità:');
    assert.equal(moduloFieldOf('pa-pesoCabina')?.slot.modulo.fornitore, undefined);
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

  it('read back only the keys of the form, of the right kind, and only of this module', () => {
    const valori = storedValori(PELAZZA, { modulo: PELAZZA.id, valori: { ordine: true, cliente: 'Rossi', nFermate: true, altro: 'x', offerta: 'si' } });
    assert.deepEqual(valori, { ordine: true, cliente: 'Rossi' });
    assert.equal(storedValori(PELAZZA, null), null);
    assert.equal(storedValori(PELAZZA, ['x']), null);
    assert.deepEqual(storedValori(PELAZZA, { modulo: PELAZZA.id, valori: {} }), {}, 'an empty module is still a module');
    assert.equal(storedValori(PELAZZA, { modulo: MOVILIFT.id, valori: { note: 'x' } }), null, 'the column of the other make');
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
    etichetta: (campo: string, valore: string) => t(`scheda.option.${campo}.${valore}`),
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

  it('fills the argano sheet with the address, the plate, the machine room and the ropes', () => {
    assert.deepEqual(prefillValori(ARGANI, { ...ctx, values: { ...ctx.values, marca: 'Schindler' } }), {
      indirizzo: 'Via Verdi 14, Milano', marca: 'Schindler', macchina: 'Alto', piani: '6', portata: '630', nImpianto: '104552', funiN: '4', funiDiametro: '10,5',
    });
  });

  it('fills the 2SG sheet with the sender, the date, the reference and the doors', () => {
    assert.deepEqual(prefillValori(SG, ctx), { mittente: 'Ascensori Rossi Srl', data: '12/10/2026', riferimento: 'N° 104552 — Via Verdi 14, Milano', automatico: true });
  });

  it('prefills a module only at its first opening (no `<prefix>-_` mark yet), and says which fields follow', () => {
    const first = withPrefill(ctx.values, ctx);
    assert.equal(first.values['oq-_'], '1');
    assert.equal(first.values['oq-nFermate'], '6');
    assert.equal(first.values['pa-portata'], '630');
    assert.ok(first.auto.has('oq-nFermate') && first.auto.has('oq-data') && first.auto.has('pa-portata'));
    assert.ok(first.auto.has('om-locMacc'), 'a linked field with the blank module\'s value follows too');
    assert.ok(!first.auto.has('oq-note'), 'nothing to take: not following');
    const again = withPrefill({ ...ctx.values, 'oq-_': '1', 'oq-nFermate': '' }, ctx);
    assert.equal(again.values['oq-nFermate'], '', 'what the person emptied stays empty');
    assert.ok(!again.auto.has('oq-nFermate'));
    assert.equal(again.values['pa-portata'], '630', 'the other module was never shown');
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

  it('open the argano sheet for every machine and the 2SG sheet with the suspensions to change', () => {
    const argano = { 'pa-_': '1', 'pa-pesoCabina': '650', 'pa-taglia12': 'si' };
    const yes = parseScheda({ ...minimal, arganoPreventivo: 'si', ...argano });
    assert.ok(yes.ok);
    assert.deepEqual(yes.ok && yes.data.preventivoArgano, { modulo: ARGANI.id, valori: { pesoCabina: '650', taglia12: true } });
    const no = parseScheda({ ...minimal, arganoPreventivo: 'no', ...argano });
    assert.equal(no.ok && no.data.preventivoArgano, null);

    const sg = { 'sg-_': '1', 'sg-ordNo': '77', 'sg-sogliaH90': 'si' };
    const sospensioni = parseScheda({ ...minimal, sospensioni: 'si', sospensioniNumero: '6', ...sg });
    assert.ok(sospensioni.ok);
    assert.equal(sospensioni.ok && sospensioni.data.sospensioniNumero, 6);
    assert.deepEqual(sospensioni.ok && sospensioni.data.ordineSospensioni, { modulo: SG.id, valori: { ordNo: '77', sogliaH90: true } });
    const none = parseScheda({ ...minimal, sospensioni: 'no', sospensioniNumero: '6', ...sg });
    assert.equal(none.ok && none.data.sospensioniNumero, null, 'the number goes with "si"');
    assert.equal(none.ok && none.data.ordineSospensioni, null);
  });

  it('report the errors of a sheet under its own names', () => {
    const long = parseScheda({ ...minimal, arganoPreventivo: 'si', 'pa-_': '1', 'pa-pesoCabina': 'x'.repeat(40) });
    assert.equal(long.ok, false);
    assert.equal(!long.ok && long.errors['pa-pesoCabina'], 'tooLong');
  });

  it('never read the old Montanari request as the argano sheet', () => {
    assert.equal(storedValori(ARGANI, { modulo: 'montanari-richiesta-preventivo-argani-ita', valori: { mrl: true } }), null);
  });
});
