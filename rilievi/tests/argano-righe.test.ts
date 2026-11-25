// What the machine calculation shows, as on the owner's sheet (4 November 2026): the hand-typed size of a
// compensation rope or chain is its diameter; with the car at the top T'1 is the car side and T'2 the
// counterweight side, as in the "Funi" sheet, and the ratio is T'2 / T'1; the speed after the change has
// two decimals. The numbers themselves do not change.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { calcolaArgano } from '../src/argano/calcolo.js';
import type { DatiArgano } from '../src/argano/dati.js';
import { numero } from '../src/argano/formato.js';
import { righeRisultato } from '../src/argano/righe.js';
import { translatorFor } from '../src/i18n.js';

const RT = JSON.parse(readFileSync(join(import.meta.dirname, 'argano-rt.json'), 'utf8')) as {
  casi: Record<string, { dati: DatiArgano }>;
};
const BASE = RT.casi.A_2v_11_cuneo!.dati;
const t = translatorFor('it');
const sezione = (key: string) =>
  righeRisultato(calcolaArgano(BASE), BASE, t).find((s) => s.key === key)!.righe;

describe('the machine calculation as on the owner sheet', () => {
  it('names the hand-typed compensation size a diameter', () => {
    assert.equal(t('argano.campo.compAltroD'), 'Diametro fune o catena (mm)');
  });

  it("puts the car side in T'1 and the counterweight side in T'2, and the ratio is T'2 / T'1", () => {
    for (const [nome, caso] of Object.entries(RT.casi)) {
      const r = calcolaArgano(caso.dati).aderenza;
      // Empty car at the top: the counterweight side is the heavier one, as T1 is at the bottom.
      assert.ok(r.t1Alto < r.t2Alto, nome);
      assert.equal(r.rapportoAlto, (r.c1 * r.c2 * r.t2Alto) / r.t1Alto, nome);
    }
    const r = calcolaArgano(BASE).aderenza;
    const righe = sezione('aderenza');
    const valore = (etichetta: string) => righe.find((x) => x.etichetta === etichetta)?.valore;
    assert.equal(valore("T'1 — lato cabina, cabina in alto vuota"), numero(r.t1Alto, 0));
    assert.equal(valore("T'2 — lato contrappeso, cabina in alto vuota"), numero(r.t2Alto, 0));
    assert.equal(valore("(T'2 / T'1) × C1 × C2, al massimo e^(f·α)"), numero(r.rapportoAlto, 3));
  });

  it('shows the speed after the change with two decimals', () => {
    const v = sezione('velocita').find((x) => x.etichetta === 'Velocità dopo la modifica')!;
    assert.match(v.valore, /^\d+,\d{2}$/);
  });
});
