// A failed sign-in answers in the same time whether the e-mail has an account or not: a known e-mail
// with a wrong password did a few more database round trips than an unknown one — milliseconds above
// Argon2, enough for a patient guesser to tell which e-mails exist (audit, 4 November 2026).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeUser, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const { ESITO_NEGATIVO_MS } = await import('../../src/services/login.js');

async function timed(email: string): Promise<number> {
  const browser = new Browser();
  const start = performance.now();
  const reply = await browser.login(email, 'Password-Sbagliata-2026');
  assert.equal(reply.status, 401);
  return performance.now() - start;
}

describe('a failed sign-in', () => {
  it('takes at least the same floor for a known and an unknown e-mail', async () => {
    const user = await makeUser('TECNICO');
    const known = await timed(user.email);
    const unknown = await timed('nessuno.qui@rilievi.test');
    for (const ms of [known, unknown]) assert.ok(ms >= ESITO_NEGATIVO_MS, `${Math.round(ms)} ms`);
  });
});
