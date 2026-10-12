import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, makeUser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;

/** A waiting access request straight in the database (the public form has its own tests). */
async function makeRequest(overrides: Partial<{ company: string; email: string }> = {}) {
  counter += 1;
  return prisma.accessRequest.create({
    data: {
      name: 'Giulia Verdi',
      company: overrides.company ?? `Ascensori Richiesta ${counter}`,
      email: overrides.email ?? `richiesta.${counter}@example.it`,
      phone: '+39 02 1234 5678',
      teamSize: 'S6_20',
      locale: 'en',
    },
  });
}

describe('access requests for the portal owner', () => {
  it('are listed only for the MASTER, with the count of new ones in the menu', async () => {
    const request = await makeRequest();
    const { browser: master } = await signedIn('MASTER');
    const list = await master.get('/richieste');
    assert.equal(list.status, 200);
    assert.match(list.body, new RegExp(`href="/richieste/${request.id}"`));
    assert.match(list.body, /<span class="nav__count">\d+<\/span>/);
    const { browser: admin } = await signedIn('ADMIN');
    assert.equal((await admin.get('/richieste')).status, 403);
    assert.equal((await admin.get(`/richieste/${request.id}`)).status, 403);
    assert.doesNotMatch((await admin.get('/schede')).body, /href="\/richieste"/);
    const forged = await admin.submit('/account', `/richieste/${request.id}/accetta`, {
      mode: 'new',
      aziendaName: 'Forged',
      email: 'forged@example.it',
      name: 'Forged',
      role: 'ADMIN',
      locale: 'it',
    });
    assert.equal(forged.status, 403);
  });

  it('accepted: the company is created, its administrator invited, the request marked', async () => {
    const request = await makeRequest();
    const { browser, user } = await signedIn('MASTER');
    const reply = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/accetta`,
      {
        mode: 'new',
        aziendaName: request.company,
        email: 'Admin.Nuovo@Example.IT',
        name: 'Giulia Verdi',
        role: 'ADMIN',
        locale: 'en',
      },
    );
    assert.equal(reply.status, 200);
    assert.match(reply.body, /\/invito\/[A-Za-z0-9_-]{30,}/);
    const row = await prisma.accessRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { azienda: true, invite: true },
    });
    assert.equal(row.status, 'ACCEPTED');
    assert.equal(row.decidedById, user.id);
    assert.equal(row.azienda?.name, request.company);
    assert.equal(row.invite?.email, 'admin.nuovo@example.it');
    assert.equal(row.invite?.role, 'ADMIN');
    assert.equal(row.invite?.aziendaId, row.aziendaId);
    assert.equal(row.invite?.locale, 'en');
    const actions = await prisma.auditLog.findMany({
      where: { OR: [{ targetId: request.id }, { targetId: row.aziendaId ?? '' }] },
    });
    assert.deepEqual(actions.map((entry) => entry.action).sort(), [
      'ACCESS_REQUEST_ACCEPT',
      'AZIENDA_CREATE',
    ]);
    const page = await browser.get(`/richieste/${request.id}`);
    assert.doesNotMatch(page.body, /\/accetta"/, 'a decided request has no accept form');
    const twice = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/accetta`,
      {
        mode: 'new',
        aziendaName: 'Another name',
        email: 'other@example.it',
        name: 'Other',
        role: 'ADMIN',
        locale: 'it',
      },
    );
    assert.equal(twice.status, 409);
  });

  it('can join an existing company instead of a new one', async () => {
    const request = await makeRequest();
    const azienda = await makeAzienda('Azienda Esistente Richieste');
    const { browser } = await signedIn('MASTER');
    const reply = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/accetta`,
      {
        mode: 'existing',
        azienda: azienda.id,
        aziendaName: '',
        email: request.email,
        name: request.name,
        role: 'DIREZIONE',
        locale: 'it',
      },
    );
    assert.equal(reply.status, 200);
    const row = await prisma.accessRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: { invite: true },
    });
    assert.equal(row.aziendaId, azienda.id);
    assert.equal(row.invite?.role, 'DIREZIONE');
  });

  it('stays new when the company name is taken or the email already has an account', async () => {
    const taken = await makeAzienda('Nome Già Preso');
    const first = await makeRequest();
    const { browser } = await signedIn('MASTER');
    const clash = await browser.submit(`/richieste/${first.id}`, `/richieste/${first.id}/accetta`, {
      mode: 'new',
      aziendaName: taken.name.toUpperCase(),
      email: first.email,
      name: first.name,
      role: 'ADMIN',
      locale: 'it',
    });
    assert.equal(clash.status, 409);
    assert.match(clash.body, /already exists|esiste già|вече има/i);
    assert.equal(
      (await prisma.accessRequest.findUniqueOrThrow({ where: { id: first.id } })).status,
      'NEW',
    );
    const existing = await makeUser('TECNICO');
    const second = await makeRequest({ email: existing.email });
    const exists = await browser.submit(
      `/richieste/${second.id}`,
      `/richieste/${second.id}/accetta`,
      {
        mode: 'new',
        aziendaName: 'Azienda Mai Creata',
        email: existing.email,
        name: 'Someone',
        role: 'ADMIN',
        locale: 'it',
      },
    );
    assert.equal(exists.status, 409);
    assert.equal(await prisma.azienda.count({ where: { name: 'Azienda Mai Creata' } }), 0);
    assert.equal(
      (await prisma.accessRequest.findUniqueOrThrow({ where: { id: second.id } })).status,
      'NEW',
    );
  });

  it('refuses a forged MASTER role and leaves nothing behind: no company, the request still new', async () => {
    const request = await makeRequest();
    const { browser } = await signedIn('MASTER');
    const reply = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/accetta`,
      {
        mode: 'new',
        aziendaName: 'Azienda Ruolo Falso',
        email: 'falso@example.it',
        name: 'Falso',
        role: 'MASTER',
        locale: 'it',
      },
    );
    assert.equal(reply.status, 403);
    assert.equal(await prisma.azienda.count({ where: { name: 'Azienda Ruolo Falso' } }), 0);
    const row = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.status, 'NEW');
    assert.equal(row.decidedAt, null);
  });

  it('lets only one of two owners accepting at once win; the other gets 409, one invitation', async () => {
    const request = await makeRequest();
    const first = (await signedIn('MASTER')).browser;
    const second = (await signedIn('MASTER')).browser;
    const form = (name: string) => ({
      mode: 'new',
      aziendaName: name,
      email: request.email,
      name: request.name,
      role: 'ADMIN',
      locale: 'it',
    });
    const [tokenA, tokenB] = await Promise.all([
      first.csrf(`/richieste/${request.id}`),
      second.csrf(`/richieste/${request.id}`),
    ]);
    const replies = await Promise.all([
      first.post(`/richieste/${request.id}/accetta`, { _csrf: tokenA, ...form('Gara Uno Srl') }),
      second.post(`/richieste/${request.id}/accetta`, { _csrf: tokenB, ...form('Gara Due Srl') }),
    ]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
    assert.equal(await prisma.invite.count({ where: { email: request.email } }), 1);
    assert.equal(
      await prisma.azienda.count({ where: { name: { in: ['Gara Uno Srl', 'Gara Due Srl'] } } }),
      1,
      'the loser leaves no company behind',
    );
  });

  it('rejected: kept as rejected, nothing sent, and it cannot be accepted afterwards', async () => {
    const request = await makeRequest();
    const { browser } = await signedIn('MASTER');
    const reply = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/rifiuta`,
      {},
    );
    assert.equal(reply.status, 303);
    const row = await prisma.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(row.status, 'REJECTED');
    assert.ok(row.decidedAt);
    const late = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/accetta`,
      {
        mode: 'new',
        aziendaName: 'Too Late Srl',
        email: request.email,
        name: request.name,
        role: 'ADMIN',
        locale: 'it',
      },
    );
    assert.equal(late.status, 409);
    const list = await browser.get('/richieste?stato=REJECTED');
    assert.match(list.body, new RegExp(`href="/richieste/${request.id}"`));
  });

  it('deleted on demand, and purged on their own after 180 days without changes', async () => {
    const request = await makeRequest();
    const { browser } = await signedIn('MASTER');
    const reply = await browser.submit(
      `/richieste/${request.id}`,
      `/richieste/${request.id}/elimina`,
      {},
    );
    assert.equal(reply.status, 303);
    assert.equal(await prisma.accessRequest.count({ where: { id: request.id } }), 0);
    assert.equal(
      await prisma.auditLog.count({
        where: { targetId: request.id, action: 'ACCESS_REQUEST_DELETE' },
      }),
      1,
    );
    const old = await makeRequest();
    const fresh = await makeRequest();
    await prisma.$executeRaw`UPDATE "AccessRequest" SET "updatedAt" = now() - interval '181 days' WHERE id = ${old.id}`;
    const { purgeOldRequests } = await import('../../src/requests/service.js');
    assert.ok((await purgeOldRequests()) >= 1);
    assert.equal(await prisma.accessRequest.count({ where: { id: old.id } }), 0);
    assert.equal(await prisma.accessRequest.count({ where: { id: fresh.id } }), 1);
  });
});
