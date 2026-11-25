// Links that must stop when the reason for them stops (audit, 4 November 2026):
// - an invite stays a promise of the inviter: deactivated, demoted below ADMIN or taken out of the
//   company, they no longer invite — the links they gave stop;
// - a reset link given by a manager stops when the person changes their own password, and when the
//   account is deactivated (reactivated within a day, the old link opened it again).
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Browser,
  linkFrom,
  makeAzienda,
  makeUser,
  PASSWORD,
  prisma,
  signedIn,
  startApp,
  stopApp,
} from './harness.js';

before(startApp);
after(stopApp);

async function inviteFrom(admin: Browser, email: string): Promise<string> {
  const reply = await admin.submit('/utenti/invita', '/utenti/invita', {
    name: 'Persona Invitata',
    email,
    role: 'TECNICO',
  });
  assert.equal(reply.status, 200);
  return linkFrom(reply.body);
}

const stato = async (browser: Browser, id: string, active: '0' | '1') => {
  const _csrf = await browser.csrf(`/utenti/${id}`);
  return browser.post(`/utenti/${id}/stato`, { _csrf, active });
};

describe('the invites of someone who no longer invites', () => {
  it('stop when the inviter is deactivated', async () => {
    const azienda = await makeAzienda();
    const { user: admin, browser } = await signedIn('ADMIN', azienda.id);
    const path = await inviteFrom(browser, 'invitato.disattivo@rilievi.test');
    assert.equal((await new Browser().get(path)).status, 200);
    const { browser: master } = await signedIn('MASTER');
    assert.equal((await stato(master, admin.id, '0')).status, 302);
    assert.equal((await new Browser().get(path)).status, 410);
  });

  it('stop when the inviter is no longer ADMIN of that company, and only there', async () => {
    const [prima, seconda] = [await makeAzienda(), await makeAzienda()];
    const admin = await makeUser('ADMIN', undefined, prima.id);
    await prisma.membership.create({
      data: { userId: admin.id, aziendaId: seconda.id, role: 'ADMIN' },
    });
    const browser = new Browser();
    assert.equal((await browser.login(admin.email)).status, 302);
    const inPrima = await browser.submit('/utenti/invita', '/utenti/invita', {
      name: 'Prima',
      email: 'invitato.prima@rilievi.test',
      role: 'TECNICO',
      azienda: prima.id,
    });
    const inSeconda = await browser.submit('/utenti/invita', '/utenti/invita', {
      name: 'Seconda',
      email: 'invitato.seconda@rilievi.test',
      role: 'TECNICO',
      azienda: seconda.id,
    });
    const [pathPrima, pathSeconda] = [linkFrom(inPrima.body), linkFrom(inSeconda.body)];

    const { browser: master } = await signedIn('MASTER');
    const demoted = await master.submit(
      `/utenti/${admin.id}`,
      `/utenti/${admin.id}/aziende/${prima.id}/ruolo`,
      { role: 'DIREZIONE' },
    );
    assert.equal(demoted.status, 302);
    assert.equal((await new Browser().get(pathPrima)).status, 410);
    assert.equal((await new Browser().get(pathSeconda)).status, 200, 'still ADMIN there');
  });
});

describe('a reset link given by a manager', () => {
  it('stops when the person changes their own password', async () => {
    const { user, browser: own } = await signedIn('TECNICO');
    const { browser: master } = await signedIn('MASTER');
    const given = await master.submit(`/utenti/${user.id}`, `/utenti/${user.id}/reimposta`, {});
    const path = linkFrom(given.body);
    const changed = await own.submit('/account', '/account/password', {
      current: PASSWORD,
      password: 'Fune-Nuova-Bottoniera-2026',
      confirm: 'Fune-Nuova-Bottoniera-2026',
    });
    assert.equal(changed.status, 302);
    assert.equal((await new Browser().get(path)).status, 410);
  });

  it('stops when the account is deactivated, and stays stopped when it is reactivated', async () => {
    const user = await makeUser('TECNICO');
    const { browser: master } = await signedIn('MASTER');
    const given = await master.submit(`/utenti/${user.id}`, `/utenti/${user.id}/reimposta`, {});
    const path = linkFrom(given.body);
    assert.equal((await stato(master, user.id, '0')).status, 302);
    assert.equal((await stato(master, user.id, '1')).status, 302);
    assert.equal((await new Browser().get(path)).status, 410);
  });
});
