import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiaveAccesso, RegistroTentativi } from '../rate-limit';

const MAX = 3;
const FINESTRA = 60_000;

function registro() {
  return new RegistroTentativi(MAX, FINESTRA);
}

test('senza tentativi si passa', () => {
  const r = registro();
  const esito = r.controlla('a|1.2.3.4');
  assert.equal(esito.consentito, true);
  assert.equal(esito.rimanenti, MAX);
});

test('dopo il massimo di fallimenti si blocca', () => {
  const r = registro();
  const k = 'a|1.2.3.4';
  assert.equal(r.fallito(k, 0).rimanenti, 2);
  assert.equal(r.fallito(k, 100).rimanenti, 1);
  const terzo = r.fallito(k, 200);
  assert.equal(terzo.consentito, false);
  assert.ok(terzo.attesaSecondi > 0);
  assert.equal(r.controlla(k, 300).consentito, false);
});

test('un accesso riuscito azzera il conteggio', () => {
  const r = registro();
  const k = 'a|1.2.3.4';
  r.fallito(k, 0);
  r.fallito(k, 100);
  r.riuscito(k);
  assert.equal(r.controlla(k, 200).rimanenti, MAX);
});

test('passata la finestra si riparte da zero', () => {
  const r = registro();
  const k = 'a|1.2.3.4';
  r.fallito(k, 0);
  r.fallito(k, 100);
  // Oltre la finestra: i vecchi tentativi non contano più.
  assert.equal(r.fallito(k, FINESTRA + 1_000).rimanenti, MAX - 1);
});

test('il blocco dura tutta la finestra e poi si apre', () => {
  const r = registro();
  const k = 'a|1.2.3.4';
  r.fallito(k, 0);
  r.fallito(k, 1);
  r.fallito(k, 2); // blocco fino a 2 + FINESTRA
  assert.equal(r.controlla(k, FINESTRA).consentito, false);
  assert.equal(r.controlla(k, 2 + FINESTRA + 1).consentito, true);
});

test('due utenti diversi non si bloccano a vicenda', () => {
  const r = registro();
  r.fallito('anna|1.2.3.4', 0);
  r.fallito('anna|1.2.3.4', 1);
  r.fallito('anna|1.2.3.4', 2);
  // L'istante va passato: con `Date.now()` la finestra risulterebbe già scaduta
  // rispetto ai timestamp finti usati sopra, e il test proverebbe altro.
  assert.equal(r.controlla('anna|1.2.3.4', 3).consentito, false);
  // Un estraneo non deve poter chiudere fuori un collega sbagliando apposta
  // la sua password: la chiave contiene anche l'IP.
  assert.equal(r.controlla('bruno|1.2.3.4', 3).consentito, true);
  assert.equal(r.controlla('anna|9.9.9.9', 3).consentito, true);
});

test('la pulizia toglie solo le voci scadute', () => {
  const r = registro();
  r.fallito('anna|1.2.3.4', 0);
  r.fallito('bruno|1.2.3.4', FINESTRA * 10);
  r.pulisci(FINESTRA * 10 + 1);
  assert.equal(r.dimensione, 1);
});

test('la chiave normalizza l’indirizzo e legge l’IP inoltrato', () => {
  const req = new Request('https://staffe.test/api/auth/login', {
    headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
  });
  assert.equal(chiaveAccesso('  Anna@Staffe.IT ', req), 'anna@staffe.it|203.0.113.7');
});

test('senza IP inoltrato la chiave resta utilizzabile', () => {
  const req = new Request('https://staffe.test/api/auth/login');
  assert.equal(chiaveAccesso('anna@staffe.it', req), 'anna@staffe.it|sconosciuto');
});
