import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateTime } from '../labels';
import { formatoGiornoIt } from '../report';
import { avere, essere, parola, plurale } from '../plurale';

const GIORNO = new Date(2026, 6, 31, 14, 5); // 31 luglio 2026, 14:05

test('le date hanno sempre l’anno a quattro cifre', () => {
  // `dateStyle: 'short'` in italiano darebbe 31/07/26: ambiguo su documenti
  // che restano in archivio per anni.
  assert.equal(formatDate(GIORNO), '31/07/2026');
  assert.match(formatDateTime(GIORNO), /^31\/07\/2026/);
});

test('la stessa data si scrive uguale nelle tabelle e nei report', () => {
  // Erano due formatter diversi: uno con l’anno a due cifre, l’altro a quattro.
  assert.equal(formatDate(GIORNO), formatoGiornoIt(GIORNO));
});

test('una data assente si mostra come trattino, non come «Invalid Date»', () => {
  assert.equal(formatDate(null), '—');
  assert.equal(formatDate(undefined), '—');
  assert.equal(formatDateTime(null), '—');
});

test('accordo singolare e plurale', () => {
  assert.equal(plurale(1, 'articolo', 'articoli'), '1 articolo');
  assert.equal(plurale(0, 'articolo', 'articoli'), '0 articoli');
  assert.equal(plurale(3, 'articolo', 'articoli'), '3 articoli');
  assert.equal(parola(1, 'riga', 'righe'), 'riga');
  assert.equal(essere(1), 'è');
  assert.equal(essere(2), 'sono');
  assert.equal(avere(1), 'ha');
  assert.equal(avere(0), 'hanno');
});
