import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  escapeLike,
  highlight,
  normalizeSearch,
  queryTokens,
  searchTextOf,
} from '../src/schede/search.js';

describe('search normalisation', () => {
  it('folds case and accents and turns everything but letters and digits into spaces', () => {
    assert.equal(normalizeSearch('Viale della Città, 12/B'), 'viale della citta 12 b');
    assert.equal(normalizeSearch('ПЕРНИК — ул. Христо Ботев'), 'перник ул христо ботев');
  });

  it('never lets a LIKE wildcard reach the pattern', () => {
    assert.deepEqual(queryTokens('50% _x\\'), ['50', 'x']);
  });

  it('keeps at most 8 distinct words of a query of at most 100 characters', () => {
    assert.deepEqual(queryTokens('via via VIA roma'), ['via', 'roma']);
    assert.equal(queryTokens('a b c d e f g h i j k').length, 8);
    assert.equal(queryTokens('x'.repeat(500))[0]?.length, 100);
  });

  it('builds the search text from the identifiers, the address and the notes', () => {
    const text = searchTextOf({
      numeroImpianto: '104552',
      matricola: '0033871',
      indirizzo: 'Via Verdi 14',
      noteImpianto: 'Fune usurata',
    });
    assert.equal(text, '104552 0033871 via verdi 14 fune usurata');
  });

  it('escapes the LIKE wildcards of the raw query for the prefix match', () => {
    assert.equal(escapeLike('10%_\\'), '10\\%\\_\\\\');
  });
});

describe('highlight', () => {
  it('marks the query words in the shown text, ignoring accents and case', () => {
    const segments = highlight('Piazza Città 3', ['citta']);
    assert.deepEqual(segments, [
      { text: 'Piazza ', hit: false },
      { text: 'Città', hit: true },
      { text: ' 3', hit: false },
    ]);
  });

  it('marks partial numbers and leaves one-letter words alone', () => {
    assert.deepEqual(highlight('0033871', ['3387', 'a']), [
      { text: '00', hit: false },
      { text: '3387', hit: true },
      { text: '1', hit: false },
    ]);
  });

  it('returns nothing for an empty value and the plain text without useful words', () => {
    assert.deepEqual(highlight(null, ['x']), []);
    assert.deepEqual(highlight('Via Roma', []), [{ text: 'Via Roma', hit: false }]);
  });
});
