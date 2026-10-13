import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { SECTIONS } from '../src/schede/fields.js';
import { displaySections, type SchedaShown } from '../src/schede/format.js';
import {
  FISSE,
  ORDINABILI,
  ordineEffettivo,
  parseMossa,
  parseOrdine,
  sezioniOrdinate,
  sposta,
} from '../src/schede/ordine.js';

const keys = (list: ReadonlyArray<{ key: string }>) => list.map((item) => item.key);

describe('the order of the sheet sections in a company', () => {
  it('keeps the plant identification first; every other section can move', () => {
    assert.deepEqual(FISSE, ['impianto', 'targa']);
    assert.deepEqual(ORDINABILI, keys(SECTIONS).slice(2));
  });

  it('reads a saved order without trusting it: unknown or repeated keys go, missing ones come last', () => {
    assert.deepEqual(ordineEffettivo([]), ORDINABILI);
    const saved = ['note', 'impianto', 'nonEsiste', 'note', 'funi'];
    const order = ordineEffettivo(saved);
    assert.deepEqual(order.slice(0, 2), ['note', 'funi']);
    assert.deepEqual(
      order.slice(2),
      ORDINABILI.filter((key) => key !== 'note' && key !== 'funi'),
    );
  });

  it('sorts the sections of the form, the page, the print and the PDF the same way', () => {
    const ordered = sezioniOrdinate(SECTIONS, ['note', 'allarme']);
    assert.deepEqual(keys(ordered).slice(0, 4), ['impianto', 'targa', 'note', 'allarme']);
    assert.equal(ordered.length, SECTIONS.length);
    assert.deepEqual(keys(sezioniOrdinate(SECTIONS, [])), keys(SECTIONS), 'empty is the default');

    const scheda = { misureBottoniere: [], data: new Date('2026-10-12T00:00:00.000Z') };
    const shown = displaySections(
      scheda as unknown as SchedaShown,
      translatorFor('it'),
      viewHelpers('it'),
      ['note'],
    );
    assert.deepEqual(keys(shown).slice(0, 3), ['impianto', 'targa', 'note']);
  });

  it('takes a sent order only when it holds every movable section exactly once', () => {
    const reversed = [...ORDINABILI].reverse();
    assert.deepEqual(parseOrdine(reversed), reversed);
    assert.equal(parseOrdine(ORDINABILI.slice(1)), null, 'one missing');
    assert.equal(parseOrdine([...ORDINABILI.slice(1), ORDINABILI[1]]), null, 'one twice');
    assert.equal(parseOrdine(['impianto', ...ORDINABILI.slice(1)]), null, 'a fixed one');
    assert.equal(parseOrdine('note'), null);
    assert.equal(parseOrdine(undefined), null);
  });

  it('moves one section one step, and nothing at the edges', () => {
    const order = [...ORDINABILI];
    assert.deepEqual(parseMossa('funi:su'), { key: 'funi', verso: 'su' });
    assert.equal(parseMossa('impianto:su'), null, 'the identification does not move');
    assert.equal(parseMossa('funi:lato'), null);
    assert.equal(parseMossa(['funi:su']), null);
    const up = sposta(order, 'argano', 'su');
    assert.deepEqual(up.slice(0, 4), ['ubicazione', 'tipologia', 'argano', 'quadro']);
    assert.deepEqual(sposta(order, order[0]!, 'su'), order);
    assert.deepEqual(sposta(order, order.at(-1)!, 'giu'), order);
    assert.deepEqual(order, ORDINABILI, 'the order it is given is not touched');
  });
});
