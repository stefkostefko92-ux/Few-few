import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeUser, outbox, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const NEW_PASSWORD = 'Bottoniera-Al-Piano-Due';

/** The one-time link shown after an invite or a reset — as a path on the test server. */
function linkFrom(body: string): string {
  const value = /<input class="input" id="link" type="text" readonly value="([^"]+)"/.exec(
    body,
  )?.[1];
  assert.ok(value, 'the page shows the link once');
  return new URL(value).pathname;
}

async function invite(manager: Browser, form: Record<string, string>) {
  return manager.submit('/utenti/invita', '/utenti/invita', { locale: 'it', name: '', ...form });
}

describe('invitations', () => {
  it('lets a RESPONSABILE invite a technician and shows the one-time link when mail is off', async () => {
    const { browser } = await signedIn('RESPONSABILE');
    const reply = await invite(browser, { email: 'Nuovo.Tecnico@Rilievi.test', role: 'TECNICO' });
    assert.equal(reply.status, 200);
    assert.match(reply.body, /L&#39;invio di email non è attivo|L'invio di email non è attivo/);
    const path = linkFrom(reply.body);
    assert.match(path, /^\/invito\/[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.invite.findFirst({
      where: { email: 'nuovo.tecnico@rilievi.test' },
    });
    assert.ok(stored, 'email stored in lower case');
    assert.equal(stored.role, 'TECNICO');
    assert.notEqual(stored.tokenHash, path.split('/').pop(), 'only the hash is stored');
    assert.ok(
      outbox.some((mail) => mail.to === 'nuovo.tecnico@rilievi.test' && mail.result === 'disabled'),
    );
  });

  it('never lets anyone hand out their own rank or a higher one', async () => {
    const { browser } = await signedIn('RESPONSABILE');
    const page = await browser.get('/utenti/invita');
    assert.doesNotMatch(page.body, /value="RESPONSABILE"|value="DIREZIONE"|value="MASTER"/);
    for (const role of ['RESPONSABILE', 'DIREZIONE', 'ADMIN', 'MASTER']) {
      const reply = await invite(browser, { email: `x.${role}@rilievi.test`, role });
      assert.equal(reply.status, 403, role);
    }
    assert.equal(await prisma.invite.count({ where: { email: { startsWith: 'x.' } } }), 0);
  });

  it('keeps technicians and clients out of user management', async () => {
    for (const role of ['TECNICO', 'OPERATORE', 'CLIENTE'] as const) {
      const { browser } = await signedIn(role);
      assert.equal((await browser.get('/utenti')).status, 403, role);
      assert.equal((await browser.get('/utenti/invita')).status, 403, role);
    }
  });

  it('turns the link into an account with the role of the invite, signed in, exactly once', async () => {
    const { browser: manager } = await signedIn('DIREZIONE');
    const path = linkFrom(
      (await invite(manager, { email: 'tecnico.due@rilievi.test', role: 'TECNICO' })).body,
    );
    const guest = new Browser();
    const page = await guest.get(path);
    assert.equal(page.status, 200);
    assert.match(page.body, /tecnico.due@rilievi.test/);
    const _csrf = /name="_csrf" value="([^"]+)"/.exec(page.body)![1]!;
    const weak = await guest.post(path, {
      _csrf,
      name: 'Mario Bianchi',
      password: 'corta',
      confirm: 'corta',
    });
    assert.equal(weak.status, 400);
    const mismatch = await guest.post(path, {
      _csrf,
      name: 'Mario Bianchi',
      password: NEW_PASSWORD,
      confirm: `${NEW_PASSWORD}!`,
    });
    assert.equal(mismatch.status, 400);
    // The role in a forged form field is ignored: the account gets the invite's role.
    const done = await guest.post(path, {
      _csrf,
      name: 'Mario Bianchi',
      password: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
      role: 'MASTER',
    });
    assert.equal(done.status, 302);
    assert.equal(done.location, '/schede');
    assert.equal((await guest.get('/schede')).status, 200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'tecnico.due@rilievi.test' },
    });
    assert.equal(user.role, 'TECNICO');
    assert.equal(user.name, 'Mario Bianchi');
    assert.equal((await new Browser().get(path)).status, 410, 'the link works once');
  });

  it('refuses revoked and expired invites and an email that already has an account', async () => {
    const { browser: manager } = await signedIn('ADMIN');
    const revoked = linkFrom(
      (await invite(manager, { email: 'revocato@rilievi.test', role: 'OPERATORE' })).body,
    );
    const pending = await prisma.invite.findFirstOrThrow({
      where: { email: 'revocato@rilievi.test' },
    });
    const revoke = await manager.submit('/utenti', `/utenti/inviti/${pending.id}/revoca`, {});
    assert.equal(revoke.status, 302);
    assert.equal((await new Browser().get(revoked)).status, 410);

    const expired = linkFrom(
      (await invite(manager, { email: 'scaduto@rilievi.test', role: 'OPERATORE' })).body,
    );
    await prisma.invite.updateMany({
      where: { email: 'scaduto@rilievi.test' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    assert.equal((await new Browser().get(expired)).status, 410);

    const existing = await makeUser('TECNICO');
    const again = await invite(manager, { email: existing.email, role: 'TECNICO' });
    assert.equal(again.status, 409);
  });

  it('gives a reset link from a higher rank that ends the old sessions', async () => {
    const { user, browser: old } = await signedIn('TECNICO');
    const { browser: manager } = await signedIn('RESPONSABILE');
    const reply = await manager.submit(`/utenti/${user.id}`, `/utenti/${user.id}/reimposta`, {});
    assert.equal(reply.status, 200);
    const path = linkFrom(reply.body);
    assert.match(path, /^\/reimposta\//);
    const guest = new Browser();
    const _csrf = await guest.csrf(path);
    const done = await guest.post(path, { _csrf, password: NEW_PASSWORD, confirm: NEW_PASSWORD });
    assert.equal(done.status, 302);
    assert.equal(done.location, '/accesso');
    assert.equal((await old.get('/schede')).status, 302, 'old session ended');
    assert.equal((await new Browser().login(user.email, NEW_PASSWORD)).status, 302);
    assert.equal((await new Browser().get(path)).status, 410, 'the link works once');
  });

  it('lets managers change roles only below their own rank and never their own', async () => {
    const { user: manager, browser } = await signedIn('RESPONSABILE');
    const technician = await makeUser('TECNICO');
    const up = await browser.submit(`/utenti/${technician.id}`, `/utenti/${technician.id}/ruolo`, {
      role: 'DIREZIONE',
    });
    assert.equal(up.status, 302);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: technician.id } })).role,
      'TECNICO',
    );
    await browser.submit(`/utenti/${technician.id}`, `/utenti/${technician.id}/ruolo`, {
      role: 'OPERATORE',
    });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: technician.id } })).role,
      'OPERATORE',
    );
    const _csrf = await browser.csrf('/utenti');
    const self = await browser.post(`/utenti/${manager.id}/ruolo`, { _csrf, role: 'TECNICO' });
    assert.equal(self.status, 302);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: manager.id } })).role,
      'RESPONSABILE',
    );
    const boss = await makeUser('ADMIN');
    await browser.post(`/utenti/${boss.id}/stato`, { _csrf, active: '0' });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: boss.id } })).deactivatedAt,
      null,
    );
  });

  it('writes every user action to the audit log', async () => {
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map(
      (a) => a.action,
    );
    for (const action of [
      'INVITE_CREATE',
      'INVITE_ACCEPT',
      'INVITE_REVOKE',
      'PASSWORD_RESET_LINK',
      'PASSWORD_RESET',
      'USER_ROLE',
      'LOGIN',
    ]) {
      assert.ok(actions.includes(action), action);
    }
  });
});
