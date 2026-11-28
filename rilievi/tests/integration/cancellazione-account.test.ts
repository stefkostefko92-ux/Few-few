// The deletion of an account (the legal review, 28 November 2026 — part B, H2; the owner: "Бутон за изтриване";
// Allegato A, A.9 of the terms 2026-11-29): an account could only be deactivated, never deleted, while the
// processing agreement says the portal lets the customer delete the data. Now whoever may deactivate an account may
// also delete it, once it is deactivated, with their own password. The account is made anonymous in one
// transaction: name and email go, and so do sessions, two-factor keys and codes, password links, external
// identities and accepted invites; what stays is the name written in signed documents (their text) and the lines
// of the activity log (with the author shown as deleted). It cannot be undone and the page of the person is gone.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  Browser,
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

const HTML = { accept: 'text/html' };

describe('deleting an account', () => {
  it('needs a deactivated account and the password, then leaves no personal data of the account', async () => {
    const azienda = await makeAzienda('Cancellazioni Srl');
    const { browser: admin, user: adminUser } = await signedIn('ADMIN', azienda.id);
    const tecnico = await makeUser('TECNICO', 'Mario Cancellabile', azienda.id);
    const vecchiaEmail = tecnico.email;
    // A session, recovery codes, a pending password link, an accepted invite and a sheet of their own.
    const viaggia = new Browser();
    assert.equal((await viaggia.login(vecchiaEmail)).status, 302);
    await prisma.recoveryCode.create({ data: { userId: tecnico.id, codeHash: 'x'.repeat(64) } });
    await prisma.passwordReset.create({
      data: {
        userId: tecnico.id,
        tokenHash: `t-${tecnico.id}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    await prisma.invite.create({
      data: {
        email: vecchiaEmail,
        name: 'Mario Cancellabile',
        role: 'TECNICO',
        aziendaId: azienda.id,
        tokenHash: `i-${tecnico.id}`,
        invitedById: adminUser.id,
        expiresAt: new Date(Date.now() + 3_600_000),
        acceptedAt: new Date(),
        acceptedUserId: tecnico.id,
      },
    });
    const scheda = await prisma.scheda.create({
      data: { aziendaId: azienda.id, data: new Date(), searchText: '', createdById: tecnico.id },
    });
    const pagina = `/utenti/${tecnico.id}`;
    const elimina = `${pagina}/elimina`;

    // Active: deactivate it first — nothing changes.
    const attivo = await admin.submit(pagina, elimina, { password: PASSWORD });
    assert.equal(attivo.status, 303);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: tecnico.id } })).name,
      'Mario Cancellabile',
    );
    assert.doesNotMatch((await admin.get(pagina, HTML)).body, /action="[^"]*\/elimina"/);

    await admin.submit(pagina, `${pagina}/stato`, { active: '0' });
    assert.match((await admin.get(pagina, HTML)).body, /action="[^"]*\/elimina"/);

    // A wrong password: refused, nothing deleted.
    const sbagliata = await admin.submit(pagina, elimina, { password: 'non-la-password' });
    assert.equal(sbagliata.status, 422);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: tecnico.id } })).cancellatoAt,
      null,
    );

    const ok = await admin.submit(pagina, elimina, { password: PASSWORD });
    assert.equal(ok.status, 303);
    assert.equal(ok.location, '/utenti');
    const dopo = await prisma.user.findUniqueOrThrow({ where: { id: tecnico.id } });
    assert.ok(dopo.cancellatoAt);
    assert.equal(dopo.name, 'Utente cancellato');
    assert.notEqual(dopo.email, vecchiaEmail);
    assert.doesNotMatch(dopo.email, /mario|tecnico/i);
    assert.equal(dopo.totpSecretEnc, null);
    assert.equal(dopo.lastLoginAt, null);
    for (const [nome, n] of [
      ['sessions', await prisma.session.count({ where: { userId: tecnico.id } })],
      ['recovery codes', await prisma.recoveryCode.count({ where: { userId: tecnico.id } })],
      ['password links', await prisma.passwordReset.count({ where: { userId: tecnico.id } })],
      ['identities', await prisma.identitaEsterna.count({ where: { userId: tecnico.id } })],
      ['invites', await prisma.invite.count({ where: { acceptedUserId: tecnico.id } })],
    ] as const)
      assert.equal(n, 0, nome);
    assert.equal(await prisma.invite.count({ where: { email: vecchiaEmail } }), 0);
    // The work of the company stays, with the author shown as deleted.
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id: scheda.id } })).createdById,
      tecnico.id,
    );
    const voce = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'USER_DELETE', targetId: tecnico.id },
    });
    assert.doesNotMatch(JSON.stringify(voce), /Mario|@rilievi\.test/);
    // The person is gone from the list and their page; the old email no longer logs in.
    assert.equal((await admin.get(pagina, HTML)).status, 404);
    assert.doesNotMatch(
      (await admin.get('/utenti', HTML)).body,
      /Mario Cancellabile|Utente cancellato/,
    );
    assert.notEqual((await new Browser().login(vecchiaEmail)).status, 302);
    // Nobody brings it back or writes into it: the name and email, reactivation, a new company (the review of
    // Кодаджията — `loadTarget` read deleted accounts too). Refused, never a 500, and the row stays anonymous.
    const { browser: master } = await signedIn('MASTER');
    const altra = await makeAzienda('Dopo la Cancellazione Srl');
    for (const [chi, azione, campi] of [
      [admin, 'account', { name: 'Mario Cancellabile', email: vecchiaEmail, password: PASSWORD }],
      [admin, 'stato', { active: '1' }],
      [master, 'account', { name: 'Mario Cancellabile', email: vecchiaEmail, password: PASSWORD }],
      [master, 'stato', { active: '1' }],
      [master, 'aziende', { azienda: altra.id, role: 'TECNICO' }],
    ] as const) {
      const r = await chi.submit('/account', `${pagina}/${azione}`, campi);
      assert.ok(r.status < 500, `${azione}: ${r.status}`);
    }
    const ancora = await prisma.user.findUniqueOrThrow({
      where: { id: tecnico.id },
      include: { memberships: true },
    });
    assert.equal(ancora.name, 'Utente cancellato');
    assert.equal(ancora.email, dopo.email);
    assert.ok(ancora.deactivatedAt);
    assert.ok(!ancora.memberships.some((m) => m.aziendaId === altra.id), 'no new company');
    // Twice: nothing to delete any more.
    assert.equal((await admin.submit('/account', elimina, { password: PASSWORD })).status, 404);
  });

  it('is not for an account that is also in a company of someone else, nor for the MASTER', async () => {
    const a = await makeAzienda('Prima Srl');
    const b = await makeAzienda('Seconda Srl');
    const { browser: admin } = await signedIn('ADMIN', a.id);
    const condiviso = await makeUser('TECNICO', 'Doppio Lavoro', a.id);
    await prisma.membership.create({
      data: { userId: condiviso.id, aziendaId: b.id, role: 'TECNICO' },
    });
    await prisma.user.update({ where: { id: condiviso.id }, data: { deactivatedAt: new Date() } });
    const rifiuto = await admin.submit(
      `/utenti/${condiviso.id}`,
      `/utenti/${condiviso.id}/elimina`,
      {
        password: PASSWORD,
      },
    );
    assert.equal(rifiuto.status, 303);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: condiviso.id } })).cancellatoAt,
      null,
    );
    // The MASTER may: the account is the portal's to manage.
    const { browser: master, user: masterUser } = await signedIn('MASTER');
    // Never the MASTER: not even another MASTER may delete one.
    const altroMaster = await makeUser('MASTER');
    await prisma.user.update({
      where: { id: altroMaster.id },
      data: { deactivatedAt: new Date() },
    });
    const suMaster = await master.submit('/account', `/utenti/${altroMaster.id}/elimina`, {
      password: PASSWORD,
    });
    assert.ok([303, 404].includes(suMaster.status), String(suMaster.status));
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: altroMaster.id } })).cancellatoAt,
      null,
    );
    assert.ok(masterUser.id);
    const fatto = await master.submit(
      `/utenti/${condiviso.id}`,
      `/utenti/${condiviso.id}/elimina`,
      {
        password: PASSWORD,
      },
    );
    assert.equal(fatto.status, 303);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: condiviso.id } })).cancellatoAt);
  });
});
