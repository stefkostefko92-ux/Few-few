import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactPii } from '../src/domain/pii.js';

// Фалшиви данни, сглобени в runtime (secret-scan не бива да вижда реални на вид стойности).
const email = ['mario.rossi', 'esempio.it'].join('@');
const mobile = ['333', '123', '4567'].join(' ');

test('маскира имейл и телефон', () => {
  const out = redactPii(`Chiamare ${email} o ${mobile} per l'accesso`);
  assert.equal(out.includes(email), false);
  assert.equal(out.includes(mobile), false);
  assert.match(out, /\[email\]/);
  assert.match(out, /\[tel\]/);
});

test('не пипа кодове, сериини номера, версии и измервания', () => {
  for (const text of [
    'E37 su LTX500-2026-004821 con FW 4.2.1',
    'ingresso X3 a 24 V, morsetti 11 e 12',
    'tra 3 e 5 secondi, 230 V',
  ]) {
    assert.equal(redactPii(text), text);
  }
});

test('линейно време: дълъг низ без „@“ или с цифри не блокира процеса', () => {
  for (const text of [
    'a'.repeat(64_000),
    '12-'.repeat(21_000),
    '1'.repeat(64_000),
    'a.'.repeat(32_000),
  ]) {
    const t0 = performance.now();
    redactPii(text);
    assert.ok(performance.now() - t0 < 250, `бавно за ${text.slice(0, 6)}…`);
  }
  // Имейлът в поредица от разрешени знаци пак се маскира — от началото на поредицата.
  assert.equal(redactPii(`x_${email}`).includes(email), false);
});
