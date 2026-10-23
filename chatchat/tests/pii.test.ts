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
