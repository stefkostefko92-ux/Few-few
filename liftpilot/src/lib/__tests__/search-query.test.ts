// The search boxes' `?q=` (review ux7): a NUL byte or another control character never reaches Prisma (PostgreSQL refuses
// a string with NUL: the page answered 500) — each becomes a space, for the top bar's installations, the Rilievi list and
// its trash, and the search of an installation to link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchQuery } from '@/lib/search-query';
import { searchWords } from '@/lib/dashboard';
import { listParamsSchema } from '@/lib/rilievi/inputs';

test('i caratteri di controllo diventano spazi; il resto resta com’è scritto', () => {
  assert.equal(searchQuery('\u0000'), ' ');
  assert.equal(searchQuery('MI\u0000_2291\u001f50%\u007fx\u0085y'), 'MI _2291 50% x y');
  assert.equal(searchQuery('Città «Bobov» – 7'), 'Città «Bobov» – 7', 'letters, quotes and dashes stay');
  assert.equal(searchQuery(['a', 'b']), '', 'a repeated ?q= searches nothing');
  assert.equal(searchQuery(undefined), '');
});

test('ogni pagina di ricerca la legge così: impianti (barra in alto, collegamento) e lista dei rilievi', () => {
  assert.deepEqual(searchWords('\u0000'), []);
  assert.deepEqual(searchWords('via\u0000verdi\t14'), ['via', 'verdi', '14']);
  assert.equal(listParamsSchema.parse({ q: 'via\u0000verdi', p: '1' }).q, 'via verdi');
  assert.equal(listParamsSchema.parse({ q: '\u0000', p: undefined }).q, ' ');
});
