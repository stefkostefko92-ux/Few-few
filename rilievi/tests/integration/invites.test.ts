import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Browser,
  makeAzienda,
  makeUser,
  outbox,
  prisma,
  signedIn,
  startApp,
  stopApp,
} from './harness.js';

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
  return manager.submit('/utenti/invita', '/utenti/invita', {
    name: 'Persona Invitata',
    ...form,
  });
}

describe('invitations', () => {
  it('lets a company ADMIN invite a technician into their own company, link shown once without mail', async () => {
    const { user: admin, browser } = await signedIn('ADMIN');
    const reply = await invite(browser, {
      email: 'Nuovo.Tecnico@Rilievi.test',
      name: 'Nuovo Tecnico',
      role: 'TECNICO',
    });
    assert.equal(reply.status, 200);
    assert.match(reply.body, /L&#39;invio di email non è attivo|L'invio di email non è attivo/);
    const path = linkFrom(reply.body);
    assert.match(path, /^\/invito\/[A-Za-z0-9_-]{43}$/);
    const stored = await prisma.invite.findFirst({
      where: { email: 'nuovo.tecnico@rilievi.test' },
    });
    assert.ok(stored, 'email stored in lower case');
    assert.equal(stored.role, 'TECNICO');
    assert.equal(stored.aziendaId, admin.aziendaId, 'the invite goes to the admin’s company');
    assert.equal(stored.name, 'Nuovo Tecnico');
    assert.notEqual(stored.tokenHash, path.split('/').pop(), 'only the hash is stored');
    assert.ok(
      outbox.some((mail) => mail.to === 'nuovo.tecnico@rilievi.test' && mail.result === 'disabled'),
    );
  });

  it('asks for the full name of the person', async () => {
    const { browser } = await signedIn('ADMIN');
    const reply = await invite(browser, {
      email: 'senza.nome@rilievi.test',
      name: ' ',
      role: 'TECNICO',
    });
    assert.equal(reply.status, 400);
    assert.equal(await prisma.invite.count({ where: { email: 'senza.nome@rilievi.test' } }), 0);
  });

  it('ignores a company smuggled into the form by a company ADMIN', async () => {
    const other = await makeAzienda('Altra Azienda Invito');
    const { user: admin, browser } = await signedIn('ADMIN');
    const reply = await invite(browser, {
      email: 'furbo@rilievi.test',
      role: 'TECNICO',
      azienda: other.id,
    });
    assert.equal(reply.status, 200);
    const stored = await prisma.invite.findFirstOrThrow({ where: { email: 'furbo@rilievi.test' } });
    assert.equal(stored.aziendaId, admin.aziendaId);
  });

  it('lets the MASTER pick the company — an active one — and invite its ADMIN', async () => {
    const azienda = await makeAzienda('Ascensori Nord');
    const closed = await makeAzienda('Ascensori Chiusi');
    await prisma.azienda.update({ where: { id: closed.id }, data: { deactivatedAt: new Date() } });
    const { browser } = await signedIn('MASTER');
    const page = await browser.get('/utenti/invita');
    assert.match(page.body, /Ascensori Nord/);
    assert.doesNotMatch(page.body, /Ascensori Chiusi/);
    const missing = await invite(browser, { email: 'senza.azienda@rilievi.test', role: 'ADMIN' });
    assert.equal(missing.status, 400);
    const toClosed = await invite(browser, {
      email: 'chiusa@rilievi.test',
      role: 'ADMIN',
      azienda: closed.id,
    });
    assert.equal(toClosed.status, 400);
    const ok = await invite(browser, {
      email: 'admin.nord@rilievi.test',
      role: 'ADMIN',
      azienda: azienda.id,
    });
    assert.equal(ok.status, 200);
    const stored = await prisma.invite.findFirstOrThrow({
      where: { email: 'admin.nord@rilievi.test' },
    });
    assert.equal(stored.aziendaId, azienda.id);
    assert.equal(stored.role, 'ADMIN');
  });

  it('never lets anyone hand out their own rank or a higher one', async () => {
    const { browser } = await signedIn('ADMIN');
    const page = await browser.get('/utenti/invita');
    assert.doesNotMatch(page.body, /value="ADMIN"|value="MASTER"/);
    for (const role of ['ADMIN', 'MASTER']) {
      const reply = await invite(browser, { email: `x.${role}@rilievi.test`, role });
      assert.equal(reply.status, 403, role);
    }
    assert.equal(await prisma.invite.count({ where: { email: { startsWith: 'x.' } } }), 0);
  });

  it('keeps everyone below the company ADMIN out of user management', async () => {
    for (const role of ['DIREZIONE', 'RESPONSABILE', 'TECNICO', 'OPERATORE', 'CLIENTE'] as const) {
      const { browser } = await signedIn(role);
      assert.equal((await browser.get('/utenti')).status, 403, role);
      assert.equal((await browser.get('/utenti/invita')).status, 403, role);
    }
  });

  it('turns the link into an account in the invite’s company, with its role, exactly once', async () => {
    const { user: admin, browser: manager } = await signedIn('ADMIN');
    const path = linkFrom(
      (await invite(manager, { email: 'tecnico.due@rilievi.test', role: 'TECNICO' })).body,
    );
    const guest = new Browser();
    const page = await guest.get(path);
    assert.equal(page.status, 200);
    assert.match(page.body, /tecnico.due@rilievi.test/);
    assert.match(page.body, /Ascensori Prova/, 'the page names the company');
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
    // Role and company in a forged form field are ignored: the account gets the invite's.
    const done = await guest.post(path, {
      _csrf,
      name: 'Mario Bianchi',
      password: NEW_PASSWORD,
      confirm: NEW_PASSWORD,
      role: 'MASTER',
      azienda: '',
    });
    assert.equal(done.status, 302);
    assert.equal(done.location, '/schede');
    assert.equal((await guest.get('/schede')).status, 200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'tecnico.due@rilievi.test' },
      include: { memberships: true },
    });
    assert.equal(user.master, false);
    assert.equal(user.name, 'Mario Bianchi');
    assert.deepEqual(
      user.memberships.map((m) => [m.aziendaId, m.role]),
      [[admin.aziendaId, 'TECNICO']],
      'one membership: the invite’s company with the invite’s role',
    );
    assert.equal((await new Browser().get(path)).status, 410, 'the link works once');
  });

  it('stops the invites of a deactivated company', async () => {
    const azienda = await makeAzienda('Azienda Che Chiude');
    const { browser } = await signedIn('ADMIN', azienda.id);
    const path = linkFrom(
      (await invite(browser, { email: 'dopo@rilievi.test', role: 'TECNICO' })).body,
    );
    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    assert.equal((await new Browser().get(path)).status, 410);
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

  it('writes every invitation to the audit log, tagged with the company', async () => {
    const entries = await prisma.auditLog.findMany({ select: { action: true, aziendaId: true } });
    const actions = entries.map((a) => a.action);
    for (const action of ['INVITE_CREATE', 'INVITE_ACCEPT', 'INVITE_REVOKE', 'LOGIN']) {
      assert.ok(actions.includes(action), action);
    }
    assert.ok(
      entries.filter((e) => e.action.startsWith('INVITE_')).every((e) => e.aziendaId !== null),
      'company events carry their company',
    );
  });
});
