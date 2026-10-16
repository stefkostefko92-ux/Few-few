// The survey sheet's save in a shaft without signal (round 48): an action that gets no answer is turned into a refusal
// the form shows — the network ('offline': fetch's TypeError) or anything else ('failed') —, never thrown into the error
// boundary that would unmount the form; Next's redirect after a good save is thrown on as before. `settle` sees every
// answer with the state it followed (the form keeps there the version it stood on).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirect } from 'next/navigation';
import { keepOnFailure, noAnswerOf } from '@/components/keep-on-failure';

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
