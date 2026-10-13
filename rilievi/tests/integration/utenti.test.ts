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

/** The one-time link shown after a reset — as a path on the test server. */
function linkFrom(body: string): string {
  const value = /<input class="input" id="link" type="text" readonly value="([^"]+)"/.exec(
    body,
  )?.[1];
  assert.ok(value, 'the page shows the link once');
  return new URL(value).pathname;
}

/** The role of a person in one company, straight from the database. */
async function roleOf(userId: string, aziendaId: string | null) {
  if (!aziendaId) return null;
  const membership = await prisma.membership.findUnique({
    where: { userId_aziendaId: { userId, aziendaId } },
  });
  return membership?.role ?? null;
}

describe('managing the people of a company', () => {
  it('keeps each company ADMIN to their own people and invites', async () => {
    const other = await makeAzienda('Concorrente Spa');
    const stranger = await makeUser('TECNICO', 'Tecnico Altrui', other.id);
    const { browser: otherAdmin } = await signedIn('ADMIN', other.id);
    await otherAdmin.submit('/utenti/invita', '/utenti/invita', {
      name: 'Persona Invitata',
      email: 'invito.altrui@rilievi.test',
      role: 'TECNICO',
    });
    const foreignInvite = await prisma.invite.findFirstOrThrow({
      where: { email: 'invito.altrui@rilievi.test' },
    });

    const { browser } = await signedIn('ADMIN');
    const list = await browser.get('/utenti');
    assert.doesNotMatch(list.body, /Tecnico Altrui|invito\.altrui|Concorrente Spa/);
    assert.equal((await browser.get(`/utenti/${stranger.id}`)).status, 404);
    const _csrf = await browser.csrf('/account');
    await browser.post(`/utenti/${stranger.id}/stato`, { _csrf, active: '0' });
    await browser.post(`/utenti/${stranger.id}/aziende/${other.id}/ruolo`, {
      _csrf,
      role: 'CLIENTE',
    });
    await browser.post(`/utenti/${stranger.id}/account`, {
      _csrf,
      name: 'Rubato',
      email: 'rubato@rilievi.test',
    });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: stranger.id } });
    assert.equal(after.deactivatedAt, null);
    assert.equal(after.name, 'Tecnico Altrui');
    assert.equal(await roleOf(stranger.id, other.id), 'TECNICO');
    await browser.post(`/utenti/inviti/${foreignInvite.id}/revoca`, { _csrf });
    const still = await prisma.invite.findUniqueOrThrow({ where: { id: foreignInvite.id } });
    assert.equal(still.revokedAt, null);
  });

  it('gives a reset link from the company ADMIN that ends the old sessions', async () => {
    const { user, browser: old } = await signedIn('TECNICO');
    const { browser: manager } = await signedIn('ADMIN');
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
    const { user: manager, browser } = await signedIn('ADMIN');
    const technician = await makeUser('TECNICO');
    const azienda = technician.aziendaId!;
    const roleUrl = (id: string) => `/utenti/${id}/aziende/${azienda}/ruolo`;
    const up = await browser.submit(`/utenti/${technician.id}`, roleUrl(technician.id), {
      role: 'ADMIN',
    });
    assert.equal(up.status, 302);
    assert.equal(await roleOf(technician.id, azienda), 'TECNICO');
    await browser.submit(`/utenti/${technician.id}`, roleUrl(technician.id), {
      role: 'DIREZIONE',
    });
    assert.equal(await roleOf(technician.id, azienda), 'DIREZIONE');
    const _csrf = await browser.csrf('/account');
    const self = await browser.post(roleUrl(manager.id), { _csrf, role: 'TECNICO' });
    assert.equal(self.status, 302);
    assert.equal(await roleOf(manager.id, azienda), 'ADMIN');
    const peer = await makeUser('ADMIN');
    await browser.post(`/utenti/${peer.id}/stato`, { _csrf, active: '0' });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: peer.id } })).deactivatedAt,
      null,
    );
  });

  it('lets the company ADMIN correct the name and the email of their people', async () => {
    const person = await makeUser('TECNICO', 'Mario Rosi');
    const taken = await makeUser('OPERATORE');
    const { browser } = await signedIn('ADMIN');
    const page = await browser.get(`/utenti/${person.id}`);
    assert.match(page.body, /action="\/utenti\/[a-z0-9]+\/account"/);

    const clash = await browser.submit(`/utenti/${person.id}`, `/utenti/${person.id}/account`, {
      name: 'Mario Rossi',
      email: taken.email,
    });
    assert.equal(clash.status, 409);
    assert.match(clash.body, /già usato da un altro account/);
    assert.match(clash.body, /value="Mario Rossi"/, 'what was typed stays on screen');

    const done = await browser.submit(`/utenti/${person.id}`, `/utenti/${person.id}/account`, {
      name: '  Mario   Rossi ',
      email: ' Mario.Rossi@Rilievi.TEST ',
    });
    assert.equal(done.status, 302);
    const saved = await prisma.user.findUniqueOrThrow({ where: { id: person.id } });
    assert.equal(saved.name, 'Mario Rossi');
    assert.equal(saved.email, 'mario.rossi@rilievi.test');
    assert.ok(
      outbox.some((mail) => mail.to === person.email && /Email del tuo account/.test(mail.subject)),
      'the old address is told about the change',
    );
    assert.equal((await new Browser().login('mario.rossi@rilievi.test')).status, 302);
  });

  it('writes every change to the people to the audit log of their company', async () => {
    const entries = await prisma.auditLog.findMany({ select: { action: true, aziendaId: true } });
    const actions = entries.map((a) => a.action);
    for (const action of [
      'PASSWORD_RESET_LINK',
      'PASSWORD_RESET',
      'USER_ROLE',
      'USER_EDIT',
      'LOGIN',
    ]) {
      assert.ok(actions.includes(action), action);
    }
    assert.ok(
      entries.filter((e) => e.action.startsWith('USER_')).every((e) => e.aziendaId !== null),
      'events about people of a company carry the company',
    );
  });
});
