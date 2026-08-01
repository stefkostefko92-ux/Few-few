import { test } from 'node:test';
import assert from 'node:assert/strict';
import { destinazioneSicura, DESTINAZIONE_PREDEFINITA } from '../redirect';

test('un percorso interno normale passa', () => {
  assert.equal(destinazioneSicura('/prodotti'), '/prodotti');
  assert.equal(destinazioneSicura('/prelievi/abc123'), '/prelievi/abc123');
  assert.equal(destinazioneSicura('/giacenze?stato=sotto_scorta'), '/giacenze?stato=sotto_scorta');
});

test('assente o vuoto → cruscotto', () => {
  assert.equal(destinazioneSicura(undefined), DESTINAZIONE_PREDEFINITA);
  assert.equal(destinazioneSicura(''), DESTINAZIONE_PREDEFINITA);
  assert.equal(destinazioneSicura([]), DESTINAZIONE_PREDEFINITA);
});

test('nessun host esterno, in nessuna delle sue forme', () => {
  // Il rischio non è teorico: un link «accedi a Staffe» che dopo il login
  // porta su una copia del gestionale è phishing con il nostro dominio davanti.
  for (const cattivo of [
    'https://evil.example',
    'http://evil.example',
    '//evil.example', // protocol-relative
    '/\\evil.example', // la barra rovesciata vale come barra in molti browser
    '/%2Fevil.example', // barra codificata
    '/%2fevil.example',
    '/%5Cevil.example', // barra rovesciata codificata
    'javascript:alert(1)',
    'data:text/html,<script>',
    '\t//evil.example', // carattere di controllo iniziale
    '/\n/evil.example',
    'prodotti', // relativo: non inizia con «/»
  ]) {
    assert.equal(
      destinazioneSicura(cattivo),
      DESTINAZIONE_PREDEFINITA,
      `doveva essere rifiutato: ${JSON.stringify(cattivo)}`,
    );
  }
});

test('con più valori si guarda il primo', () => {
  assert.equal(destinazioneSicura(['/prodotti', '//evil.example']), '/prodotti');
  assert.equal(destinazioneSicura(['//evil.example', '/prodotti']), DESTINAZIONE_PREDEFINITA);
});

test('la destinazione predefinita è sostituibile', () => {
  assert.equal(destinazioneSicura('//evil.example', '/scanner'), '/scanner');
});
