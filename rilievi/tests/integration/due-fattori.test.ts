// Two-step sign-in, opt-in for everyone (the owner, 31 October 2026): off by default; switched on with the
// password, a QR/key and a code from the app; ten recovery codes shown once; then the password alone
// gives no session — the code does, once; wrong codes count in the account lock (and mail the owner);
// off again only with the password AND a code; a manager of the account can switch it off for a lost
// phone. The secret is stored encrypted and the set-up draft only works in the session that started it.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, outbox, PASSWORD, prisma, signedIn, startApp, stopApp } from './harness.js';

const { totpCodeAt, totpStep } = await import('../../src/auth/totp.js');

before(startApp);
after(stopApp);

const step = () => totpStep(Math.floor(Date.now() / 1000));
const message = (body: string) => /<div class="errors"[^>]*><h2>([^<]+)</.exec(body)?.[1] ?? '';
const secretOf = (body: string) =>
  /class="due-fattori__chiave"><strong>([A-Z2-7 ]+)</.exec(body)?.[1]?.replace(/ /g, '') ?? '';
const draftOf = (body: string) => /name="bozza" value="([^"]+)"/.exec(body)?.[1] ?? '';
const codesOf = (body: string) =>
  [...body.matchAll(/<li>([a-z2-9]{5}-[a-z2-9]{5})<\/li>/g)].map((m) => m[1]!);

/** Switches 2FA on through the pages; the confirm code takes the current step. */
async function enable(browser: Browser) {
  const setup = await browser.submit('/account/2fa', '/account/2fa/avvia', { password: PASSWORD });
  assert.equal(setup.status, 200, message(setup.body));
  const secret = secretOf(setup.body);
  const bozza = draftOf(setup.body);
  const done = await browser.submit('/account/2fa', '/account/2fa/conferma', {
    bozza,
    codice: totpCodeAt(secret, step()),
  });
  assert.equal(done.status, 200, message(done.body));
  return { secret, codes: codesOf(done.body) };
}

/** Lets the next code of the app pass again (the tests do not wait 30 seconds). */
const forgetStep = (userId: string) =>
  prisma.user.update({ where: { id: userId }, data: { totpLastStep: null } });

async function passwordStep(email: string) {
  const browser = new Browser();
  const reply = await browser.login(email);
  assert.equal(reply.status, 303, `password step: ${reply.status}`);
  assert.equal(reply.location, '/accesso/codice');
  return browser;
}

// The pre-sign-in CSRF cookie is the same on every form before sign-in: the login page gives it even
// when the challenge is already gone.
const sendCode = (browser: Browser, codice: string) =>
  browser.submit('/accesso', '/accesso/codice', { codice });

describe('switching two-step sign-in on', () => {
  it('is off by default, wants the password, stores the secret encrypted and shows ten codes once', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const other = new Browser();
    assert.equal((await other.login(user.email)).status, 302);
    assert.match((await browser.get('/account/2fa')).body, /Disattivata/);
    const wrong = await browser.submit('/account/2fa', '/account/2fa/avvia', { password: 'nope' });
    assert.equal(wrong.status, 400);
    assert.match(message(wrong.body), /Password o codice non corretti/);

    const setup = await browser.submit('/account/2fa', '/account/2fa/avvia', {
      password: PASSWORD,
    });
    assert.match(setup.body, /<svg[^>]*viewBox/);
    assert.match(setup.body, /href="otpauth:\/\/totp\/Rilievi%20Impianti%3A/);
    const secret = secretOf(setup.body);
    assert.match(secret, /^[A-Z2-7]{32}$/);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).totpSecretEnc,
      null,
      'nothing is stored before the code',
    );
    // The draft belongs to the session that asked for it: the other session cannot finish it.
    const stolen = await other.submit('/account', '/account/2fa/conferma', {
      bozza: draftOf(setup.body),
      codice: totpCodeAt(secret, step()),
    });
    assert.equal(stolen.status, 303);
    const typo = await browser.submit('/account/2fa', '/account/2fa/conferma', {
      bozza: draftOf(setup.body),
      codice: '000000',
    });
    assert.equal(typo.status, 400);
    assert.equal(secretOf(typo.body), secret, 'same key after a typo');

    const done = await browser.submit('/account/2fa', '/account/2fa/conferma', {
      bozza: draftOf(setup.body),
      codice: totpCodeAt(secret, step()),
    });
    const codes = codesOf(done.body);
    assert.equal(codes.length, 10);
    assert.equal(done.headers.get('cache-control'), 'no-store');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(row.totpEnabledAt);
    assert.ok(row.totpSecretEnc && !row.totpSecretEnc.includes(secret), 'encrypted');
    assert.equal(await prisma.recoveryCode.count({ where: { userId: user.id } }), 10);
    const stored = await prisma.recoveryCode.findMany({ where: { userId: user.id } });
    assert.ok(
      stored.every((c) => !codes.includes(c.codeHash)),
      'only hashes are stored',
    );
    assert.equal((await other.get('/schede')).status, 302, 'other sessions are closed');
    assert.equal((await browser.get('/schede')).status, 200, 'this one stays');
    assert.ok(outbox.some((m) => m.to === user.email && /attivata/.test(m.subject)));
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'TOTP_ON', targetId: user.id } }),
      1,
    );
  });
});

describe('signing in with two steps', () => {
  it('gives no session for the password alone; the code gives it, once', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const { secret } = await enable(browser);
    await forgetStep(user.id);
    const second = await passwordStep(user.email);
    assert.ok(!second.cookies.has('rilievi_sid'), 'no session yet');
    assert.equal((await second.get('/schede')).status, 302);
    assert.equal((await second.get('/accesso/codice')).status, 200);
    const wrong = await sendCode(second, '123456');
    assert.equal(wrong.status, 401);
    assert.match(message(wrong.body), /Ti restano 4 tentativi/);
    const code = totpCodeAt(secret, step());
    const ok = await sendCode(second, code);
    assert.equal(ok.status, 303);
    assert.equal(ok.location, '/schede');
    assert.equal((await second.get('/schede')).status, 200);
    const login = await prisma.auditLog.findFirst({
      where: { action: 'LOGIN', targetId: user.id },
      orderBy: { at: 'desc' },
    });
    assert.deepEqual(login?.meta, { secondoFattore: 'totp' });
    // The same code, caught on the way, does not open a second door.
    const replay = await passwordStep(user.email);
    assert.equal((await sendCode(replay, code)).status, 401);
    assert.equal((await new Browser().get('/accesso/codice')).status, 302, 'no challenge, no page');
  });

  it('takes a recovery code once and says how many are left', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const { codes } = await enable(browser);
    const first = await passwordStep(user.email);
    const ok = await sendCode(first, codes[0]!.toUpperCase().replace('-', ' '));
    assert.equal(ok.status, 303);
    assert.match(decodeURIComponent(first.cookies.get('rilievi_flash') ?? ''), /codiceRecupero/);
    assert.equal(await prisma.recoveryCode.count({ where: { userId: user.id, usedAt: null } }), 9);
    const again = await passwordStep(user.email);
    assert.equal((await sendCode(again, codes[0]!)).status, 401);
  });

  it('counts wrong codes in the account lock and mails the owner: the password is known', async () => {
    const { user, browser } = await signedIn('TECNICO');
    await enable(browser);
    const thief = await passwordStep(user.email);
    for (let i = 0; i < 4; i += 1) assert.equal((await sendCode(thief, '000000')).status, 401);
    const locked = await sendCode(thief, '000000');
    assert.equal(locked.status, 429);
    assert.match(message(locked.body), /Riprova tra 15 minuti/);
    assert.ok(outbox.some((m) => m.to === user.email && /codici errati/.test(m.subject)));
    assert.equal(await prisma.loginChallenge.count({ where: { userId: user.id } }), 0);
    assert.equal((await new Browser().login(user.email)).status, 429, 'a new password step waits');
  });

  it('ends a challenge that is expired', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const { secret } = await enable(browser);
    await forgetStep(user.id);
    const late = await passwordStep(user.email);
    await prisma.loginChallenge.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const reply = await sendCode(late, totpCodeAt(secret, step()));
    assert.equal(reply.status, 400);
    assert.match(message(reply.body), /La verifica è scaduta/);
  });
});

describe('switching two-step sign-in off', () => {
  it('wants the password and a code; new codes replace the old ones', async () => {
    const { user, browser } = await signedIn('TECNICO');
    const { secret, codes } = await enable(browser);
    await forgetStep(user.id);
    const renewed = await browser.submit('/account/2fa', '/account/2fa/codici', {
      password: PASSWORD,
      codice: totpCodeAt(secret, step()),
    });
    const fresh = codesOf(renewed.body);
    assert.equal(fresh.length, 10);
    assert.ok(!fresh.includes(codes[1]!));
    const noCode = await browser.submit('/account/2fa', '/account/2fa/disattiva', {
      password: PASSWORD,
      codice: codes[1]!,
    });
    assert.equal(noCode.status, 400, 'an old code no longer works');
    const off = await browser.submit('/account/2fa', '/account/2fa/disattiva', {
      password: PASSWORD,
      codice: fresh[0]!,
    });
    assert.equal(off.status, 303);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.deepEqual([row.totpEnabledAt, row.totpSecretEnc], [null, null]);
    assert.equal(await prisma.recoveryCode.count({ where: { userId: user.id } }), 0);
    assert.equal(
      (await new Browser().login(user.email)).status,
      302,
      'the password is enough again',
    );
    assert.equal(
      await prisma.auditLog.count({ where: { action: 'TOTP_OFF', targetId: user.id } }),
      1,
    );
  });

  it('can be switched off by the manager of the account for a lost phone — never by others', async () => {
    const { user, browser } = await signedIn('TECNICO');
    await enable(browser);
    const collega = await signedIn('TECNICO', user.aziendaId!);
    const denied = await collega.browser.submit('/account', `/utenti/${user.id}/due-fattori`, {});
    assert.equal(denied.status, 403);
    const admin = await signedIn('ADMIN', user.aziendaId!);
    assert.match((await admin.browser.get(`/utenti/${user.id}`)).body, /Disattiva la verifica/);
    const reset = await admin.browser.submit(
      `/utenti/${user.id}`,
      `/utenti/${user.id}/due-fattori`,
      {},
    );
    assert.equal(reset.status, 302);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(row.totpEnabledAt, null);
    assert.ok(outbox.some((m) => m.to === user.email && /amministratore/.test(m.subject)));
    assert.equal(
      await prisma.auditLog.count({
        where: { action: 'TOTP_RESET', targetId: user.id, actorId: admin.user.id },
      }),
      1,
    );
  });

  it('cannot be on without a secret (the database says no too)', async () => {
    const { user } = await signedIn('TECNICO');
    await assert.rejects(
      prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } }),
      /User_totp_check/,
    );
  });
});
