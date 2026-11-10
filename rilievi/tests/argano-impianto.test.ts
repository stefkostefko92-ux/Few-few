// The lift of a calculation without a scheda: the address is required, the plate number and the number
// are digits only (the leading zero stays), what the search did not find becomes the first guess, and
// the search text is normalised like the one of the schede.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  impiantoDaRicerca,
  parseImpianto,
  searchTextImpianto,
  valoriImpianto,
} from '../src/argano/impianto.js';

describe('the lift of a calculation without a scheda', () => {
  it('trims the address and keeps the leading zero of the plate number', () => {
    assert.deepEqual(
      parseImpianto({
        indirizzo: '  Via Dante 2, Milano ',
        matricola: ' 0071234',
        numeroImpianto: '',
      }),
      {
        impianto: { indirizzo: 'Via Dante 2, Milano', matricola: '0071234', numeroImpianto: null },
        errori: {},
      },
    );
  });

  it('wants the address, digits only and at most 20 of them, and text — never a guess', () => {
    assert.deepEqual(
      parseImpianto({ indirizzo: '   ', matricola: '12A', numeroImpianto: '1'.repeat(21) }).errori,
      { indirizzo: 'required', matricola: 'digitsOnly', numeroImpianto: 'tooLong' },
    );
    assert.deepEqual(parseImpianto({}).errori, { indirizzo: 'required' });
    assert.deepEqual(parseImpianto({ indirizzo: 'x'.repeat(201) }).errori, {
      indirizzo: 'tooLong',
    });
    // A field sent twice arrives as an array: an error, not the first value.
    const doppio = parseImpianto({ indirizzo: ['Via A', 'Via B'], matricola: ['1', '2'] });
    assert.equal(doppio.impianto, null);
    assert.deepEqual(Object.keys(doppio.errori).sort(), ['indirizzo', 'matricola']);
  });

  it('goes back into the form as it was saved', () => {
    assert.deepEqual(
      valoriImpianto({ indirizzo: 'Via Po 1', matricola: null, numeroImpianto: '7' }),
      {
        indirizzo: 'Via Po 1',
        matricola: '',
        numeroImpianto: '7',
      },
    );
  });

  it('takes digits from the search as a plate number and anything else as the address', () => {
    assert.deepEqual(impiantoDaRicerca(' 0012345 '), { matricola: '0012345' });
    assert.deepEqual(impiantoDaRicerca('Via Dante 2'), { indirizzo: 'Via Dante 2' });
    assert.deepEqual(impiantoDaRicerca('1'.repeat(21)), { indirizzo: '1'.repeat(21) });
    assert.deepEqual(impiantoDaRicerca('   '), {});
  });

  it('is searched like a scheda: lower case, no accents, only letters and digits', () => {
    assert.equal(
      searchTextImpianto({
        indirizzo: 'Piazza Città, 3 – Cantù',
        matricola: '0071234',
        numeroImpianto: null,
      }),
      'piazza citta 3 cantu 0071234',
    );
  });
});
