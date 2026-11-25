// The MASTER's own account and the other MASTERs (audit, 4 November 2026): a stolen MASTER session must
// not turn into a takeover — no reset link for itself, a new email only with the current password, and
// no hand on another MASTER's account, two-step login or access.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeUser, PASSWORD, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

describe('the MASTER account', () => {
  it('cannot be taken over from a stolen session: no own reset link, own email only with the password', async () => {
    const { user: master, browser } = await signedIn('MASTER');
    const _csrf = await browser.csrf(`/utenti/${master.id}`);
    const link = await browser.post(`/utenti/${master.id}/reimposta`, { _csrf });
    assert.equal(link.status, 302, 'no link page for itself');
    assert.equal(await prisma.passwordReset.count({ where: { userId: master.id } }), 0);

    const nuova = `nuovo.${master.id}@rilievi.test`;
    const senza = await browser.post(`/utenti/${master.id}/account`, {
      _csrf,
      name: master.name,
      email: nuova,
    });
    assert.equal(senza.status, 400);
    assert.match(senza.body, /password attuale/i);
    const sbagliata = await browser.post(`/utenti/${master.id}/account`, {
      _csrf,
      name: master.name,
      email: nuova,
      password: 'non-e-la-password-giusta',
    });
    assert.equal(sbagliata.status, 400);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: master.id } })).email,
      master.email,
    );
    const giusta = await browser.post(`/utenti/${master.id}/account`, {
      _csrf,
      name: master.name,
      email: nuova,
      password: PASSWORD,
    });
    assert.equal(giusta.status, 302);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: master.id } })).email, nuova);
  });

  it('does not manage another MASTER: no reset link, no two-step reset, no new email', async () => {
    const { user: master, browser } = await signedIn('MASTER');
    const other = await makeUser('MASTER');
    await prisma.user.update({
      where: { id: other.id },
      data: { totpSecretEnc: 'x', totpEnabledAt: new Date() },
    });
    const page = await browser.get(`/utenti/${other.id}`);
    assert.doesNotMatch(
      page.body,
      new RegExp(`action="/utenti/${other.id}/(account|reimposta|due-fattori|stato)"`),
    );
    // The token from its own page — the only one with forms whatever else is in the database.
    const _csrf = await browser.csrf(`/utenti/${master.id}`);
    await browser.post(`/utenti/${other.id}/reimposta`, { _csrf });
    await browser.post(`/utenti/${other.id}/due-fattori`, { _csrf });
    await browser.post(`/utenti/${other.id}/account`, {
      _csrf,
      name: 'Preso',
      email: `preso.${other.id}@rilievi.test`,
    });
    await browser.post(`/utenti/${other.id}/stato`, { _csrf, active: '0' });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    assert.equal(after.email, other.email);
    assert.notEqual(after.totpEnabledAt, null);
    assert.equal(after.deactivatedAt, null);
    assert.equal(await prisma.passwordReset.count({ where: { userId: other.id } }), 0);
  });
});
