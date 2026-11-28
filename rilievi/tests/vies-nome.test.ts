// The name VIES gives for a VAT number, against the name the customer declared (art. 18(1)(a) of Implementing
// Regulation (EU) No 282/2011: the supplier obtains confirmation of the number "and of the associated name and
// address"). Without a database. Acceptance criteria:
//  - the same company written another way is the same name: case, punctuation, accents and the legal form
//    ("S.r.l.", "srl", "S.p.A.", "SNC", "SAS", "ditta" …) do not count;
//  - another company is another name;
//  - VIES that gives no name ("---" or nothing) is "no name", never "the same";
//  - the check is only for a sale with the reverse charge that VIES confirmed — the Bulgarian VAT regimes and the
//    payments from before the check have nothing to compare.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { avvisoNomeVies, confrontaNomeVies, nomeNormalizzato } from '../src/pagamenti/vies-nome.js';

describe('the name in VIES against the declared one', () => {
  it('reads the same company written another way as the same name', () => {
    for (const [dichiarato, vies] of [
      ['Ascensori Verdi S.r.l.', 'ASCENSORI VERDI S.R.L.'],
      ['Ascensori Verdi srl', 'ASCENSORI VERDI'],
      ['Ascensori Verdi S.p.A.', 'ASCENSORI VERDI SPA'],
      ['Rossi & Figli S.n.c.', 'ROSSI E FIGLI SNC'],
      ['Bianchi Sas di Bianchi Mario', 'BIANCHI S.A.S. DI BIANCHI MARIO'],
      ['Ditta Neri Luca', 'NERI LUCA'],
      ['Elevatori Società a responsabilità limitata', 'ELEVATORI SRL'],
      ['Città-Lift S.r.l.s.', 'CITTA LIFT SRLS'],
      ['Ascensori  Verdi,  S.r.l.', 'ascensori verdi'],
    ] as const)
      assert.equal(confrontaNomeVies(dichiarato, vies), 'uguale', `${dichiarato} / ${vies}`);
    assert.equal(nomeNormalizzato('Ascensori Verdi S.r.l.'), 'ascensori verdi');
  });

  it('tells another company apart', () => {
    assert.equal(confrontaNomeVies('Ascensori Verdi S.r.l.', 'ASCENSORI ROSSI S.R.L.'), 'diverso');
    assert.equal(confrontaNomeVies('Vies Valida S.r.l.', 'ASCENSORI VERDI S.R.L.'), 'diverso');
    // The legal form alone is not a name: nothing left on one side is not "the same".
    assert.equal(confrontaNomeVies('S.r.l.', 'ASCENSORI VERDI S.R.L.'), 'diverso');
    // The review of Кодаджията: a two-letter form inside the name is part of the name, and the words keep their
    // spaces — „Ross I“ is not „Rossi“, „Lift AS Service“ is not „Lift Service“.
    assert.equal(confrontaNomeVies('Ross I S.r.l.', 'ROSSI SRL'), 'diverso');
    assert.equal(confrontaNomeVies('Lift AS Service', 'LIFT SERVICE'), 'diverso');
    assert.equal(confrontaNomeVies('Ascensori ET Figli', 'ASCENSORI FIGLI'), 'diverso');
    // At the edges it is still the legal form: „AB Hiss“ (Sweden), „Hiss AS“ (Norway, Denmark).
    assert.equal(confrontaNomeVies('AB Hiss', 'HISS'), 'uguale');
    assert.equal(confrontaNomeVies('Hiss AS', 'HISS'), 'uguale');
  });

  it('says when VIES gives no name', () => {
    for (const vuoto of [null, undefined, '', '   ', '---', '-'])
      assert.equal(confrontaNomeVies('Ascensori Verdi S.r.l.', vuoto), 'assente', String(vuoto));
  });

  it('applies only to a reverse-charge sale that VIES confirmed', () => {
    const base = {
      regimeIva: 'inversione',
      viesAt: new Date('2026-11-20T10:00:00Z'),
      viesNome: 'ASCENSORI ROSSI S.R.L.',
      ragioneSociale: 'Ascensori Verdi S.r.l.',
    };
    assert.equal(avvisoNomeVies(base), 'diverso');
    assert.equal(avvisoNomeVies({ ...base, viesNome: null }), 'assente');
    assert.equal(avvisoNomeVies({ ...base, viesNome: 'ASCENSORI VERDI SRL' }), null);
    // Bulgarian VAT (a Bulgarian number, or a number VIES did not confirm): no name to compare.
    assert.equal(avvisoNomeVies({ ...base, regimeIva: 'iva-bg' }), null);
    assert.equal(avvisoNomeVies({ ...base, regimeIva: 'iva-bg-ue', viesNome: null }), null);
    // A payment from before the check.
    assert.equal(avvisoNomeVies({ ...base, viesAt: null, viesNome: null }), null);
  });
});
