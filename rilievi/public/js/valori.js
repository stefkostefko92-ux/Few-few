// Values in the sheet form, shared by moduli.js and collegati.js (loaded before both): numbers the
// Italian way, the option of a list for a text, what a field of the sheet takes. Same rules as
// numeriDi() and stessoValore() in src/ordini/collegati.ts and opzioneDi() in src/ordini/opzioni.ts.
(() => {
  'use strict';

  // "1.000" is a thousand, "1,6" and "1.6" are the same, units do not count ("400 V" is 400).
  const NUMBER = /[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/g;
  const THOUSANDS = /^[1-9]\d{0,2}(?:\.\d{3})+(?:,\d+)?$/;
  const numberOf = (token) =>
    Number(
      THOUSANDS.test(token) ? token.replace(/\./g, '').replace(',', '.') : token.replace(',', '.'),
    );
  const numbersOf = (text) => Array.from(text.matchAll(NUMBER), ([token]) => numberOf(token));
  const plain = (text) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  // The same value: the same numbers in the same order; a text without numbers — the same text.
  const same = (a, b) => {
    const na = numbersOf(a);
    const nb = numbersOf(b);
    if (na.length || nb.length) {
      return na.length === nb.length && na.every((n, i) => Math.abs(n - nb[i]) < 1e-9);
    }
    return plain(a) === plain(b);
  };

  // The option of a list for a text: the same word ("Selcom" → "SELCOM"), otherwise the only option
  // with the same numbers ("24 V DC" → "24Vcc"; "220 V" is both "220mono" and "220tri" — none).
  const compact = (value) =>
    value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '');
  const looseNumbers = (value) =>
    (value.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => Number(n.replace(',', '.')));
  const optionFor = (select, value) => {
    const options = Array.from(select.options, (option) => option.value).filter(Boolean);
    const wanted = compact(value);
    if (!wanted) return '';
    const word = options.find((option) => compact(option) === wanted);
    if (word) return word;
    const target = looseNumbers(value);
    const matching = options.filter((option) => {
      const own = looseNumbers(option);
      return target.length && own.length === target.length && own.every((n, i) => n === target[i]);
    });
    return matching.length === 1 ? matching[0] : '';
  };

  // A value goes into a field of the sheet only as the field would take it (src/schede/fields.ts): a
  // whole number in its range, a decimal with two digits at most, digits only (a leading zero stays),
  // or text up to its length. Anything else — nothing.
  const forSheet = (field, text) => {
    const numbers = numbersOf(text);
    if (field.kind === 'int' || field.kind === 'decimal') {
      const n = numbers[0];
      const ok = numbers.length === 1 && n >= field.min && n <= field.max;
      if (field.kind === 'int') return ok && Number.isInteger(n) ? String(n) : '';
      const out = String(n).replace('.', ',');
      return ok && /^\d+(?:,\d{1,2})?$/.test(out) ? out : '';
    }
    if (field.kind === 'digits') {
      const runs = text.match(/\d+/g) || [];
      return runs.length === 1 && runs[0].length <= field.maxLength ? runs[0] : '';
    }
    return field.maxLength ? text.slice(0, field.maxLength) : text;
  };

  // Two lines for one thing ("LUCE PORTA: [800] x [2000]") and back: the numbers of the value in the
  // two lines; more than two — nothing. Same as coppiaDi() and dividiCoppia() in collegati.ts.
  const pairOf = (width, height) => (width ? (height ? `${width} x ${height}` : width) : '');
  const splitPair = (value) => {
    const parts = value.match(NUMBER) || [];
    return parts.length <= 2 ? [parts[0] || '', parts[1] || ''] : ['', ''];
  };

  window.rilieviValori = Object.freeze({ same, optionFor, forSheet, pairOf, splitPair });
})();
