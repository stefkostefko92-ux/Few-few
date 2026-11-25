// The "Personalizzato" theme (the owner, 30 October 2026): six colours per person, refused when a pair
// cannot be read, and every derived colour of the portal still readable (WCAG 2.1 AA).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coloriSalvati,
  contrasto,
  cssColori,
  parseColori,
  schemaDi,
  versioneColori,
} from '../src/http/colori.js';

const NAVY = {
  sfondo: '#0f1b2d',
  testo: '#f2f2f2',
  menu: '#1b2a41',
  menuTesto: '#ffffff',
  accento: '#ffb000',
  linee: '#3a4a63',
};

const token = (css: string, name: string) =>
  new RegExp(`${name}: (#[0-9a-f]{6});`).exec(css)?.[1] ?? '';

describe('the custom colours', () => {
  it('measure contrast as WCAG does', () => {
    assert.equal(Math.round(contrasto('#000000', '#ffffff')), 21);
    assert.equal(contrasto('#777777', '#777777'), 1);
  });

  it('are refused when the text, the menu or the main buttons cannot be told apart', () => {
    assert.ok(parseColori(NAVY).ok);
    const bad = parseColori({
      ...NAVY,
      testo: '#1a2a3d',
      menuTesto: '#1c2b42',
      accento: '#0f1b2e',
    });
    assert.ok(!bad.ok);
    assert.deepEqual(bad.errors, {
      testo: 'contrasto',
      menuTesto: 'contrasto',
      accento: 'contrasto',
    });
    const forged = parseColori({ ...NAVY, sfondo: 'red;}body{x', linee: ['#000000'] });
    assert.ok(!forged.ok);
    assert.deepEqual(forged.errors, { sfondo: 'colore', linee: 'colore' });
  });

  it('are read back only whole and readable', () => {
    assert.deepEqual(
      coloriSalvati({ ...NAVY, extra: '#ffffff' }),
      NAVY,
      'an unknown key is dropped',
    );
    assert.equal(coloriSalvati({ ...NAVY, linee: undefined }), null, 'a missing colour');
    assert.equal(coloriSalvati({ ...NAVY, testo: '#0f1b2e' }), null, 'unreadable');
    assert.deepEqual(coloriSalvati({ ...NAVY, sfondo: '#0F1B2D' }), NAVY);
  });

  it('derive the rest of the portal readable on both a dark and a light choice', () => {
    for (const colori of [
      NAVY,
      { ...NAVY, sfondo: '#fff7e6', testo: '#2b1d0e', accento: '#8a4b00', linee: '#e0d4bf' },
    ]) {
      const css = cssColori(colori);
      const bg = colori.sfondo;
      assert.ok(contrasto(token(css, '--muted'), bg) >= 4.5, 'secondary text');
      assert.ok(contrasto(token(css, '--field-line'), bg) >= 3, 'field borders');
      assert.ok(contrasto(token(css, '--bar-muted'), colori.menu) >= 4.5, 'menu items');
      assert.ok(contrasto(token(css, '--primary-fg'), colori.accento) >= 4.5, 'button text');
      assert.ok(contrasto(token(css, '--danger'), bg) >= 4.5, 'errors');
      assert.match(css, /^html:root\.tema-personale \{/m);
    }
    assert.equal(schemaDi(NAVY), 'dark');
    assert.notEqual(versioneColori(NAVY), versioneColori({ ...NAVY, linee: '#3a4a64' }));
  });
});
