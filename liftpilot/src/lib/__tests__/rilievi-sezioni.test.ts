// Rilievi — the order of the sheet's sections in a company, ported from rilievi's tests/sezioni.test.ts (commit
// 988f3cf37): «Impianto» stays first, a stored order is cleaned, the form, the page, the print and the PDF sort alike, a
// sent order is taken only whole, a move is one step.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SECTIONS } from '@/lib/rilievi/fields';
import { displaySections, type SchedaShown } from '@/lib/rilievi/format';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { FISSE, ORDINABILI, ordineEffettivo, ordinePredefinito, parseMossa, parseOrdine, sezioniOrdinate, sposta } from '@/lib/rilievi/ordine';

const keys = (list: ReadonlyArray<{ key: string }>) => list.map((item) => item.key);

describe('the order of the sheet sections in a company', () => {
  it('keeps the plant identification first; every other section can move', () => {
    assert.deepEqual(FISSE, ['impianto']);
    assert.deepEqual(ORDINABILI, keys(SECTIONS).slice(1));
  });

  it('reads a saved order without trusting it: unknown or repeated keys go, missing ones come last', () => {
    assert.deepEqual(ordineEffettivo([]), ORDINABILI);
    const order = ordineEffettivo(['note', 'impianto', 'nonEsiste', 'note', 'funi']);
    assert.deepEqual(order.slice(0, 2), ['note', 'funi']);
    assert.deepEqual(order.slice(2), ORDINABILI.filter((key) => key !== 'note' && key !== 'funi'));
  });

  it('sorts the sections of the form, the page, the print and the PDF the same way', () => {
    const ordered = sezioniOrdinate(SECTIONS, ['note', 'allarme']);
    assert.deepEqual(keys(ordered).slice(0, 3), ['impianto', 'note', 'allarme']);
    assert.equal(ordered.length, SECTIONS.length);
    assert.deepEqual(keys(sezioniOrdinate(SECTIONS, [])), keys(SECTIONS), 'empty is the default');
    const scheda = { misureBottoniere: [], data: new Date('2026-10-12T00:00:00.000Z') } as unknown as SchedaShown;
    assert.deepEqual(keys(displaySections(scheda, rilieviTranslator(), ['note'])).slice(0, 2), ['impianto', 'note']);
  });

  it('takes a sent order only when it holds every movable section exactly once', () => {
    const reversed = [...ORDINABILI].reverse();
    assert.deepEqual(parseOrdine(reversed), reversed);
    assert.equal(parseOrdine(ORDINABILI.slice(1)), null, 'one missing');
    assert.equal(parseOrdine([...ORDINABILI.slice(1), ORDINABILI[1]]), null, 'one twice');
    assert.equal(parseOrdine(['impianto', ...ORDINABILI.slice(1)]), null, 'a fixed one');
    assert.equal(parseOrdine('note'), null);
    assert.equal(parseOrdine(undefined), null);
    assert.equal(parseOrdine([...ORDINABILI.slice(1), new Blob(['x'])]), null, 'a file is no section');
    assert.equal(parseOrdine([...ORDINABILI.slice(1), '__proto__']), null, 'no other name');
    assert.equal(parseOrdine([...ORDINABILI, 'note']), null, 'one more');
  });

  it('moves one section one step, and nothing at the edges', () => {
    const order = [...ORDINABILI];
    assert.deepEqual(parseMossa('funi:su'), { key: 'funi', verso: 'su' });
    assert.equal(parseMossa('impianto:su'), null, 'the identification does not move');
    assert.equal(parseMossa('funi:lato'), null);
    assert.equal(parseMossa(['funi:su']), null);
    // as rilievi (src/schede/ordine.ts, 988f3cf37: `const [key, verso] = raw.split(':')`): the parts after the second are ignored
    assert.deepEqual(parseMossa('funi:su:x'), { key: 'funi', verso: 'su' });
    assert.deepEqual(parseMossa('funi:su:giu'), { key: 'funi', verso: 'su' });
    const extra = parseMossa('funi:su:x');
    assert.ok(extra);
    const moved = sposta(ORDINABILI, extra.key, extra.verso);
    assert.deepEqual(moved, sposta(ORDINABILI, 'funi', 'su'), 'it moves like «funi:su»');
    assert.equal(moved.indexOf('funi'), ORDINABILI.indexOf('funi') - 1, 'one step up');
    assert.equal(parseMossa('funi'), null, 'no way');
    assert.equal(parseMossa('funi::su'), null, 'the way is the second part');
    assert.equal(parseMossa('constructor:su'), null);
    const up = sposta(order, 'argano', 'su');
    assert.deepEqual(up.slice(0, 4), ['ubicazione', 'tipologia', 'argano', 'quadro']);
    assert.deepEqual(sposta(order, order[0] ?? 'funi', 'su'), order);
    assert.deepEqual(sposta(order, order.at(-1) ?? 'funi', 'giu'), order);
    assert.deepEqual(order, ORDINABILI, 'the order it is given is not touched');
  });

  it('keeps the default order empty, so that a future section takes its own place', () => {
    assert.equal(ordinePredefinito(null), true);
    assert.equal(ordinePredefinito([...ORDINABILI]), true);
    assert.equal(ordinePredefinito([...ORDINABILI].reverse()), false);
  });
});
