import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SG } from '../src/ordini/moduli.js';
import { parseScheda } from '../src/schede/validation.js';

const minimal = { data: '2026-10-12', matricola: '33871' };
/** Both 2SG forms on the page, as the browser sends them: the suspensions' (`sg-`), the operator's. */
const sg = { 'sg-_': '1', 'sg-ordNo': '77', 'sg-sogliaH90': 'si' };
const so = { 'so-_': '1', 'so-ordNo': '78', 'so-semiautomatico': 'si' };

describe('the operator of a semi-automatic lift (the owner, 22 October 2026)', () => {
  it('opens the 2SG sheet in the same column from its own form, never the suspensions’ one', () => {
    const semi = { ...minimal, ...sg, ...so, tipoPorte: 'SEMIAUTOMATICHE', sospensioni: 'si' };
    const operatore = parseScheda({ ...semi, operatore: 'si' });
    assert.ok(operatore.ok);
    assert.equal(operatore.ok && operatore.data.operatore, true);
    assert.equal(operatore.ok && operatore.data.sospensioni, null, 'no suspensions asked');
    assert.deepEqual(operatore.ok && operatore.data.ordineSospensioni, {
      modulo: SG.id,
      valori: { ordNo: '78', semiautomatico: true },
    });
    const kept = parseScheda({ ...semi, operatore: 'no' });
    assert.equal(kept.ok && kept.data.ordineSospensioni, null);
    // With automatic doors the operator is not asked: its form is not read, the suspensions' one is.
    const auto = parseScheda({ ...semi, tipoPorte: 'AUTOMATICHE', operatore: 'si' });
    assert.equal(auto.ok && auto.data.operatore, null);
    assert.deepEqual(auto.ok && auto.data.ordineSospensioni, {
      modulo: SG.id,
      valori: { ordNo: '77', sogliaH90: true },
    });
    // Manual doors: neither.
    const manual = parseScheda({ ...semi, tipoPorte: 'MANUALI', operatore: 'si' });
    assert.deepEqual(manual.ok && [manual.data.operatore, manual.data.ordineSospensioni], [
      null,
      null,
    ]);
  });
});
