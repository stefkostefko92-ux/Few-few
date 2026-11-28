// The notice next to every supplier's form (owner, 26 November 2026 — „Направи всичко възможно да няма бъдещи
// спорове“; the text — the legal reviewer; Condizioni 2026-11-29, art. 6.8): the form belongs to its supplier and is
// used only to ask that supplier for a quote or to order. Our own sheets (AMI 100, the hoist data) carry none;
// the 2SG sheet is ours, redrawn on their form, and says so. Nothing is written on the supplier's PDF itself.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { translatorFor } from '../src/i18n.js';
import { AMI_RTBS, ARGANI, avvisoModulo, MODULI_TUTTI, SG } from '../src/ordini/moduli.js';

const t = translatorFor('it');
const VIEWS = join(import.meta.dirname, '..', 'views');

describe('the notice of a supplier form', () => {
  it('names the supplier of every form that has one, and the article of the conditions', () => {
    for (const modulo of MODULI_TUTTI) {
      const avviso = avvisoModulo(modulo);
      if (!modulo.fornitore) {
        assert.equal(avviso, null, `${modulo.id}: our own sheet`);
        continue;
      }
      assert.ok(avviso, modulo.id);
      const testo = t(avviso.chiave, { fornitore: avviso.fornitore });
      assert.ok(testo.includes(modulo.fornitore), `${modulo.id}: ${testo}`);
      assert.match(testo, /art\. 6\.8/);
      assert.doesNotMatch(testo, /\{|\}/, 'no placeholder left');
    }
  });

  it('says that the 2SG sheet is ours, redrawn on their form, and that the others are theirs', () => {
    assert.equal(avvisoModulo(SG)?.chiave, 'ordini.avviso.ridisegnato');
    assert.match(t('ordini.avviso.ridisegnato', { fornitore: 'X' }), /ridisegnato/);
    const terzi = MODULI_TUTTI.filter((m) => m.fornitore && m.id !== SG.id);
    assert.ok(terzi.length >= 10);
    for (const m of terzi) assert.equal(avvisoModulo(m)?.chiave, 'ordini.avviso.terzo', m.id);
    assert.equal(avvisoModulo(AMI_RTBS), null);
    assert.equal(avvisoModulo(ARGANI), null);
  });

  it('is shown in the form under the title of the module and on the page that sends it', () => {
    assert.match(
      readFileSync(join(VIEWS, 'schede', '_modulo.ejs'), 'utf8'),
      /avvisoModulo\(slot\.modulo\)/,
    );
    const invio = readFileSync(join(VIEWS, 'schede', 'invio-ordine.ejs'), 'utf8');
    assert.match(invio, /flusso\.invio\.avviso/);
    assert.match(t('flusso.invio.avviso'), /art\. 6\.8/);
  });
});
