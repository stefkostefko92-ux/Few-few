// Brute force against the real app (the owner, 31 October 2026 — "максимална защита срещу brute
// force"): parallel guesses never get more than five checks before the lock, each lock in a row is
// longer, a finished sign-in clears the counters, a network that keeps failing is stopped before any
// password is checked, and a stolen session cannot guess the current password either.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeUser, PASSWORD, prisma, signedIn, startApp, stopApp } from './harness.js';

const { hmacRete } = await import('../../src/auth/chiavi.js');
const { ipNetwork } = await import('../../src/http/ip.js');
const { MAX_FAILED_LOGINS } = await import('../../src/auth/lockout.js');

before(startApp);
after(stopApp);

const WRONG = 'Wrong-Password-000';
const MINUTE = 60_000;
const message = (body: string) => /<div class="errors"[^>]*><h2>([^<]+)</.exec(body)?.[1] ?? '';

describe('the lock of an account', () => {
  it('gives parallel guesses at most five checks, then locks for 15 minutes', async () => {
    const user = await makeUser('TECNICO');
    const replies = await Promise.all(
      Array.from({ length: 12 }, () => new Browser().login(user.email, WRONG)),
    );
    const statuses = replies.map((r) => r.status).sort();
    assert.ok(
      statuses.filter((s) => s === 401).length <= MAX_FAILED_LOGINS - 1,
      `checked passwords: ${statuses.join(' ')}`,
    );
    assert.ok(
      statuses.every((s) => s === 401 || s === 429),
      statuses.join(' '),
    );
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.lockouts, 1);
    const left = row.lockedUntil!.getTime() - Date.now();
    assert.ok(left > 14 * MINUTE && left <= 15 * MINUTE, String(left));
    const right = await new Browser().login(user.email, PASSWORD);
    assert.equal(right.status, 429, 'the right password waits too');
    assert.match(message(right.body), /Riprova tra 15 minuti/);
  });

  it('locks each time longer — an hour after the second lock — and says how long', async () => {
    const user = await makeUser('TECNICO');
    await prisma.user.update({
      where: { id: user.id },
      data: { lockouts: 1, lockedUntil: new Date(Date.now() - 1000) },
    });
    const browser = new Browser();
    let last = await browser.login(user.email, WRONG);
    for (let i = 1; i < MAX_FAILED_LOGINS; i += 1) last = await browser.login(user.email, WRONG);
    assert.equal(last.status, 429);
    assert.match(message(last.body), /Riprova tra 1 ora/);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.lockouts, 2);
    const left = row.lockedUntil!.getTime() - Date.now();
    assert.ok(left > 59 * MINUTE && left <= 60 * MINUTE, String(left));
  });

  it('clears the counters only when the sign-in is finished', async () => {
    const user = await makeUser('TECNICO');
    await prisma.user.update({ where: { id: user.id }, data: { lockouts: 2, failedLogins: 3 } });
    assert.equal((await new Browser().login(user.email, PASSWORD)).status, 302);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([row.failedLogins, row.lockouts, row.lockedUntil], [0, 0, null]);
  });
});

describe('the cap of a network', () => {
  it('stops a network with 30 failures in 15 minutes before any password is checked', async () => {
    const user = await makeUser('TECNICO');
    const noisy = new Browser();
    const rete = hmacRete(ipNetwork(noisy.ip)!);
    await prisma.loginFailure.createMany({ data: Array.from({ length: 30 }, () => ({ rete })) });
    const stopped = await noisy.login(user.email, PASSWORD);
    assert.equal(stopped.status, 429);
    assert.match(message(stopped.body), /da questa rete/);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLogins,
      0,
      'the account is not touched',
    );
    assert.equal((await new Browser().login(user.email, PASSWORD)).status, 302, 'other networks');
    // Old failures do not count, and only a keyed hash of the network is kept — never the address.
    await prisma.loginFailure.updateMany({
      where: { rete },
      data: { createdAt: new Date(Date.now() - 16 * MINUTE) },
    });
    assert.equal((await noisy.login(user.email, PASSWORD)).status, 302);
    assert.equal(await prisma.loginFailure.count({ where: { rete: noisy.ip } }), 0);
  });

  it('counts unknown e-mails and wrong passwords of the network', async () => {
    const user = await makeUser('TECNICO');
    const browser = new Browser();
    await browser.login('nessuno@rilievi.test', WRONG);
    await browser.login(user.email, WRONG);
    const rete = hmacRete(ipNetwork(browser.ip)!);
    assert.equal(await prisma.loginFailure.count({ where: { rete } }), 2);
  });
});

describe('a stolen session', () => {
  it('cannot guess the current password: five wrong ones close every session and lock', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const other = new Browser();
    assert.equal((await other.login(user.email)).status, 302);
    let last = await browser.submit('/account', '/account/password', {
      current: WRONG,
      password: 'Nuova-Password-Lunga-1',
      confirm: 'Nuova-Password-Lunga-1',
    });
    assert.equal(last.status, 400);
    for (let i = 1; i < MAX_FAILED_LOGINS; i += 1) {
      last = await browser.submit('/account', '/account/password', {
        current: WRONG,
        password: 'Nuova-Password-Lunga-1',
        confirm: 'Nuova-Password-Lunga-1',
      });
    }
    assert.equal(last.status, 303);
    assert.equal(last.location, '/accesso');
    assert.equal(await prisma.session.count({ where: { userId: user.id } }), 0);
    assert.equal((await other.get('/schede')).status, 302, 'the other session is gone too');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(row.lockedUntil && row.lockedUntil.getTime() > Date.now());
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'LOGIN_LOCKED', targetId: user.id } }),
      1,
    );
  });
});
