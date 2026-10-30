// The survey sheet's save in a shaft without signal (round 48): an action that gets no answer is turned into a refusal
// the form shows — the network ('offline': fetch's TypeError) or anything else ('failed') —, never thrown into the error
// boundary that would unmount the form; Next's redirect after a good save is thrown on as before. `settle` sees every
// answer with the state it followed (the form keeps there the version it stood on). `prepare` completes every attempt's
// data — the survey sheet's write key, the same on each attempt of one form (review code1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirect } from 'next/navigation';
import { keepOnFailure, newWriteKey, noAnswerOf } from '@/components/keep-on-failure';

type S = { n: number; why?: string };
const failure = (why: 'offline' | 'failed', prev: S): S => ({ n: prev.n, why });

test('nessuna risposta: la rete è «offline», il resto «failed»; il redirect di Next passa', async () => {
  assert.equal(noAnswerOf(new TypeError('Failed to fetch')), 'offline');
  assert.equal(noAnswerOf(new Error('An unexpected response was received from the server.')), 'failed');
  const offline = keepOnFailure<S>(async () => { throw new TypeError('Failed to fetch'); }, failure);
  assert.deepEqual(await offline({ n: 1 }, new FormData()), { n: 1, why: 'offline' });
  const broken = keepOnFailure<S>(async () => { throw new Error('boom'); }, failure);
  assert.deepEqual(await broken({ n: 2 }, new FormData()), { n: 2, why: 'failed' });
  const saved = keepOnFailure<S>(async () => redirect('/it/app/rilievi/x?ok=schedaCreated'), failure);
  await assert.rejects(saved({ n: 3 }, new FormData()), (e: unknown) => e instanceof Error && e.message === 'NEXT_REDIRECT');
});

test('una risposta passa com’è, e «settle» la vede con lo stato precedente', async () => {
  const ok = keepOnFailure<S>(async (prev) => ({ n: prev.n + 1 }), failure, (out, prev) => ({ ...out, why: `da ${prev.n}` }));
  assert.deepEqual(await ok({ n: 4 }, new FormData()), { n: 5, why: 'da 4' });
  const off = keepOnFailure<S>(async () => { throw new TypeError('x'); }, failure, (out) => ({ ...out, n: 0 }));
  assert.deepEqual(await off({ n: 6 }, new FormData()), { n: 0, why: 'offline' }, 'settle sees the browser’s own refusals too');
});

test('«prepare» completa ogni tentativo: la stessa chiave al secondo invio dopo una risposta persa', async () => {
  const key = newWriteKey();
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'a v4 UUID, lower case (inputs.ts writeKeySchema)');
  assert.notEqual(newWriteKey(), key);
  const seen: string[] = [];
  let lost = true;
  const save = keepOnFailure<S>(async (prev, fd) => {
    seen.push(String(fd.get('writeKey')));
    if (lost) { lost = false; throw new TypeError('Failed to fetch'); }
    return { n: prev.n + 1 };
  }, failure, undefined, (fd) => fd.set('writeKey', key));
  assert.deepEqual(await save({ n: 0 }, new FormData()), { n: 0, why: 'offline' });
  assert.deepEqual(await save({ n: 0 }, new FormData()), { n: 1 });
  assert.deepEqual(seen, [key, key], 'the second attempt carries the key of the first');
});

test('la chiave anche senza crypto.randomUUID (pagina non sicura): stessa forma da getRandomValues', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    assert.match(newWriteKey(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    if (original) Object.defineProperty(globalThis.crypto, 'randomUUID', original);
    else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
  }
});
