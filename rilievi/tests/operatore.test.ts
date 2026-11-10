import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { SG } from '../src/ordini/moduli.js';
import { slotAperto, SLOTS } from '../src/ordini/registry.js';
import { activeFields, FIELDS } from '../src/schede/fields.js';
import { parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-12', matricola: '33871' };
/** Both 2SG forms on the page, as the browser sends them: the suspensions' (`sg-`), the operator's. */
const sg = { 'sg-_': '1', 'sg-ordNo': '77', 'sg-sogliaH90': 'si' };
const so = { 'so-_': '1', 'so-ordNo': '78', 'so-semiautomatico': 'si' };
/**
 * The owner, 10 November 2026: "Vuoi cambiare operatore? Si/no. Vuoi compilare modulo d'ordine? Se si fai
 * scegliere modulo 2sg o altro." — the 2SG sheet opens on the third answer, not on the first.
 */
const con2sg = { operatore: 'si', operatoreOrdine: 'si', operatoreModulo: 'MODULO_2SG' };

describe('the operator of the car (the owner, 22 and 24 October, 10 November 2026)', () => {
  it('asks to change it, then to fill in an order form, then which: 2SG or another', () => {
    const keys = FIELDS.map((f) => f.key);
    const i = keys.indexOf('operatore');
    assert.deepEqual(keys.slice(i, i + 4), [
      'operatore',
      'operatoreOrdine',
      'operatoreModulo',
      'operatoreModuloAltro',
    ]);
    const t = translatorFor('it');
    assert.equal(t('scheda.question.operatore'), 'Vuoi cambiare operatore?');
    assert.equal(t('scheda.question.operatoreOrdine'), "Vuoi compilare modulo d'ordine?");
    assert.equal(t('scheda.option.operatoreModulo.MODULO_2SG'), '2SG');
    assert.equal(t('scheda.option.operatoreModulo.ALTRO'), 'Altro');
    const shown = (values: Record<string, unknown>) =>
      activeFields((key) => ({ tipoPorte: ['SEMIAUTOMATICHE'], ...values })[key]);
    assert.ok(!shown({ operatore: 'no' }).has('operatoreOrdine'));
    assert.ok(shown({ operatore: 'si' }).has('operatoreOrdine'));
    assert.ok(!shown({ operatore: 'si', operatoreOrdine: 'no' }).has('operatoreModulo'));
    assert.ok(shown({ operatore: 'si', operatoreOrdine: 'si' }).has('operatoreModulo'));
    assert.ok(!shown(con2sg).has('operatoreModuloAltro'));
    assert.ok(shown({ ...con2sg, operatoreModulo: 'ALTRO' }).has('operatoreModuloAltro'));
  });

  it('opens the 2SG sheet only on "2SG", from its own form, never the suspensions’ one', () => {
    const semi = { ...minimal, ...sg, ...so, tipoPorte: 'SEMIAUTOMATICHE', sospensioni: 'si' };
    const operatore = parseScheda({ ...semi, ...con2sg });
    assert.ok(operatore.ok);
    assert.deepEqual(
      operatore.ok && [
        operatore.data.operatore,
        operatore.data.operatoreOrdine,
        operatore.data.operatoreModulo,
      ],
      [true, true, 'MODULO_2SG'],
    );
    assert.equal(operatore.ok && operatore.data.sospensioni, null, 'no suspensions asked');
    assert.deepEqual(operatore.ok && operatore.data.ordineSospensioni, {
      modulo: SG.id,
      valori: { ordNo: '78', semiautomatico: true },
    });
    // "Sì" to change it but no order form, or another form: no 2SG sheet.
    for (const altro of [
      { operatore: 'si' },
      { operatore: 'si', operatoreOrdine: 'no' },
      { ...con2sg, operatoreModulo: 'ALTRO', operatoreModuloAltro: 'Wittur' },
    ]) {
      const r = parseScheda({ ...semi, ...altro });
      assert.equal(r.ok && r.data.ordineSospensioni, null, JSON.stringify(altro));
    }
    const altro = parseScheda({
      ...semi,
      ...con2sg,
      operatoreModulo: 'ALTRO',
      operatoreModuloAltro: ' Wittur ',
    });
    assert.deepEqual(altro.ok && [altro.data.operatoreModulo, altro.data.operatoreModuloAltro], [
      'ALTRO',
      'Wittur',
    ]);
    const kept = parseScheda({ ...semi, ...con2sg, operatore: 'no' });
    assert.deepEqual(
      kept.ok && [
        kept.data.operatoreOrdine,
        kept.data.operatoreModulo,
        kept.data.ordineSospensioni,
      ],
      [null, null, null],
    );
    // Manual doors: none of it.
    const manual = parseScheda({ ...semi, ...con2sg, tipoPorte: 'MANUALI' });
    assert.deepEqual(manual.ok && [manual.data.operatore, manual.data.ordineSospensioni], [
      null,
      null,
    ]);
    const forged = parseScheda({ ...semi, ...con2sg, operatoreModulo: 'OTIS' });
    assert.equal(!forged.ok && forged.errors.operatoreModulo, 'option');
  });

  it('is asked with automatic doors too (24 October 2026): one 2SG sheet, the suspensions’ when both are “Sì”', () => {
    const auto = { ...minimal, ...sg, ...so, tipoPorte: 'AUTOMATICHE' };
    const both = parseScheda({ ...auto, sospensioni: 'si', ...con2sg });
    assert.deepEqual(both.ok && [both.data.sospensioni, both.data.operatore], [true, true]);
    assert.deepEqual(both.ok && both.data.ordineSospensioni, {
      modulo: SG.id,
      valori: { ordNo: '77', sogliaH90: true },
    });
    // Only the operator: the sheet from the operator's form.
    for (const sospensioni of ['no', '']) {
      const only = parseScheda({ ...auto, sospensioni, ...con2sg });
      assert.equal(only.ok && only.data.operatore, true, sospensioni);
      assert.deepEqual(only.ok && only.data.ordineSospensioni, {
        modulo: SG.id,
        valori: { ordNo: '78', semiautomatico: true },
      });
    }
    const neither = parseScheda({ ...auto, sospensioni: 'no', operatore: 'no' });
    assert.equal(neither.ok && neither.data.ordineSospensioni, null);
  });

  it('a saved sheet: the 2SG slot of the operator is open on "2SG" only', () => {
    const slot = SLOTS.find((s) => s.prefix === 'so')!;
    const saved = (values: Record<string, unknown>) => {
      const all = { tipoPorte: ['SEMIAUTOMATICHE'], ...values };
      return slotAperto(
        slot,
        activeFields((k) => all[k as keyof typeof all]),
        (k) => all[k as keyof typeof all],
      );
    };
    assert.equal(
      saved({ operatore: true, operatoreOrdine: true, operatoreModulo: 'MODULO_2SG' }),
      true,
    );
    assert.equal(
      saved({ operatore: true, operatoreOrdine: true, operatoreModulo: 'ALTRO' }),
      false,
    );
    assert.equal(saved({ operatore: true }), false);
  });
});
