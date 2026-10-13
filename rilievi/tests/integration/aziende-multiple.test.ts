import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, makeUser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

/** A sheet through the form; `azienda` picks the company when the writer has more than one. */
async function newScheda(browser: Browser, matricola: string, azienda?: string): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', {
    data: '2026-10-12',
    matricola,
    ...(azienda ? { azienda } : {}),
  });
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  const id = /^\/schede\/([a-z0-9]+)$/.exec(reply.location)?.[1];
  assert.ok(id);
  return id;
}

const memberships = async (userId: string) =>
  (await prisma.membership.findMany({ where: { userId }, orderBy: { aziendaId: 'asc' } })).map(
    (m) => [m.aziendaId, m.role],
  );

describe('the MASTER', () => {
  it('is invisible to everyone else and shows as the portal administration', async () => {
    const { user: master, browser: owner } = await signedIn('MASTER');
    const { user: admin, browser } = await signedIn('ADMIN');
    // An invite of the MASTER into the admin's company: the admin sees it, not the MASTER's name.
    await owner.submit('/utenti/invita', '/utenti/invita', {
      name: 'Invitata Dal Master',
      email: 'dal.master@rilievi.test',
      role: 'TECNICO',
      azienda: admin.aziendaId!,
    });
    const list = await browser.get('/utenti');
    assert.equal(list.status, 200);
    assert.doesNotMatch(list.body, new RegExp(master.name));
    assert.doesNotMatch(list.body, new RegExp(master.email.replace('.', '\\.')));
    assert.match(list.body, /dal\.master@rilievi\.test/);
    assert.match(list.body, /Amministrazione del portale/);
    assert.equal((await browser.get(`/utenti/${master.id}`)).status, 404);
    const log = await browser.get('/registro');
    assert.doesNotMatch(log.body, new RegExp(master.name));
    assert.match(log.body, /Amministrazione del portale/);
  });

  it('manages every account, its own too, but cannot switch itself off', async () => {
    const { user: master, browser } = await signedIn('MASTER');
    const list = await browser.get('/utenti');
    assert.match(list.body, new RegExp(`class="row-link" href="/utenti/${master.id}"`));
    const self = await browser.get(`/utenti/${master.id}`);
    assert.equal(self.status, 200);
    assert.match(self.body, new RegExp(`action="/utenti/${master.id}/account"`));
    assert.match(self.body, new RegExp(`action="/utenti/${master.id}/reimposta"`));
    assert.doesNotMatch(self.body, new RegExp(`action="/utenti/${master.id}/stato"`));
    assert.match(self.body, /Non puoi disattivare il tuo account/);

    const _csrf = await browser.csrf(`/utenti/${master.id}`);
    const off = await browser.post(`/utenti/${master.id}/stato`, { _csrf, active: '0' });
    assert.equal(off.status, 302);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: master.id } })).deactivatedAt,
      null,
    );
    assert.equal((await browser.get('/schede')).status, 200, 'still signed in');

    const renamed = await browser.post(`/utenti/${master.id}/account`, {
      _csrf,
      name: 'Carbon Stealth VCC',
      email: master.email,
    });
    assert.equal(renamed.status, 302);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: master.id } })).name,
      'Carbon Stealth VCC',
    );
    assert.match((await browser.get('/schede')).body, /class="who__name">Carbon Stealth VCC</);
  });
});

describe('a person in several companies', () => {
  it('is put in another company by the MASTER only, with a different role there', async () => {
    const other = await makeAzienda('Seconda Azienda');
    const person = await makeUser('TECNICO', 'Persona Condivisa');
    const { browser: admin } = await signedIn('ADMIN');
    await admin.submit(`/utenti/${person.id}`, `/utenti/${person.id}/aziende`, {
      azienda: other.id,
      role: 'TECNICO',
    });
    assert.deepEqual(await memberships(person.id), [[person.aziendaId, 'TECNICO']]);

    const { browser: master } = await signedIn('MASTER');
    const added = await master.submit(`/utenti/${person.id}`, `/utenti/${person.id}/aziende`, {
      azienda: other.id,
      role: 'ADMIN',
    });
    assert.equal(added.status, 302);
    const expected = [
      [person.aziendaId, 'TECNICO'],
      [other.id, 'ADMIN'],
    ].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    assert.deepEqual(await memberships(person.id), expected);

    // Taken out of one company, never out of the last one.
    await master.submit(
      `/utenti/${person.id}`,
      `/utenti/${person.id}/aziende/${other.id}/rimuovi`,
      {},
    );
    assert.deepEqual(await memberships(person.id), [[person.aziendaId, 'TECNICO']]);
    const last = await master.submit(
      `/utenti/${person.id}`,
      `/utenti/${person.id}/aziende/${person.aziendaId}/rimuovi`,
      {},
    );
    assert.equal(last.status, 302);
    assert.deepEqual(await memberships(person.id), [[person.aziendaId, 'TECNICO']]);
    const actions = (
      await prisma.auditLog.findMany({ where: { targetId: person.id }, select: { action: true } })
    ).map((e) => e.action);
    assert.ok(actions.includes('MEMBERSHIP_ADD') && actions.includes('MEMBERSHIP_REMOVE'));
  });

  it('has in each company exactly the rights of the role held there', async () => {
    const shop = await makeAzienda('Officina Uno');
    const lab = await makeAzienda('Officina Due');
    const person = await makeUser('TECNICO', 'Doppio Ruolo', shop.id);
    await prisma.membership.create({
      data: { userId: person.id, aziendaId: lab.id, role: 'ADMIN' },
    });
    const { browser: master } = await signedIn('MASTER');
    const inShop = await newScheda(master, '600001', shop.id);
    const inLab = await newScheda(master, '600002', lab.id);
    const outsider = await makeAzienda('Fuori');
    const foreign = await newScheda(master, '600003', outsider.id);

    const browser = new Browser();
    assert.equal((await browser.login(person.email)).status, 302);
    const list = await browser.get('/schede');
    assert.match(list.body, new RegExp(`/schede/${inShop}`));
    assert.match(list.body, new RegExp(`/schede/${inLab}`));
    assert.doesNotMatch(list.body, new RegExp(`/schede/${foreign}`));
    assert.match(list.body, /id="azienda-filter"/, 'two companies: the company filter appears');
    assert.match(list.body, /class="who__role">2 aziende</);

    // Tecnico in the shop: writes, does not delete. Admin in the lab: deletes, sees the trash.
    assert.equal((await browser.get(`/schede/${inShop}/modifica`)).status, 200);
    assert.equal((await browser.get(`/schede/${inShop}/elimina`)).status, 404);
    assert.equal((await browser.get(`/schede/${inLab}/elimina`)).status, 200);
    assert.equal((await browser.get(`/schede/${foreign}`)).status, 404);
    assert.equal((await browser.get('/cestino')).status, 200);

    // People and audit: only the lab, where the person is ADMIN.
    const shopMate = await makeUser('OPERATORE', 'Collega Officina Uno', shop.id);
    const labMate = await makeUser('OPERATORE', 'Collega Officina Due', lab.id);
    const people = await browser.get('/utenti');
    assert.equal(people.status, 200);
    assert.match(people.body, /Collega Officina Due/);
    assert.doesNotMatch(people.body, /Collega Officina Uno/);
    assert.equal((await browser.get(`/utenti/${shopMate.id}`)).status, 404);
    assert.equal((await browser.get(`/utenti/${labMate.id}`)).status, 200);

    // A new sheet asks for the company and accepts only one of the person's own.
    const smuggled = await browser.submit('/schede/nuova', '/schede', {
      data: '2026-10-12',
      matricola: '600009',
      azienda: outsider.id,
    });
    assert.equal(smuggled.status, 422);
    const mine = await newScheda(browser, '600010', lab.id);
    assert.equal(
      (await prisma.scheda.findUniqueOrThrow({ where: { id: mine } })).aziendaId,
      lab.id,
    );
  });

  it('keeps an account shared with another company out of reach of one company ADMIN', async () => {
    const elsewhere = await makeAzienda('Azienda Esterna');
    const shared = await makeUser('TECNICO', 'Tecnico In Due Aziende');
    await prisma.membership.create({
      data: { userId: shared.id, aziendaId: elsewhere.id, role: 'TECNICO' },
    });
    const { browser } = await signedIn('ADMIN');
    const page = await browser.get(`/utenti/${shared.id}`);
    assert.equal(page.status, 200);
    assert.doesNotMatch(page.body, /Azienda Esterna/, 'the other company is not shown');
    assert.match(page.body, /li gestisce l(&#39;|')amministrazione del portale/);
    assert.doesNotMatch(page.body, /action="\/utenti\/[a-z0-9]+\/(stato|account|reimposta)"/);

    // The role in the shared company is the admin's to set; the account is not.
    const roleUrl = `/utenti/${shared.id}/aziende/${shared.aziendaId}/ruolo`;
    await browser.submit(`/utenti/${shared.id}`, roleUrl, { role: 'OPERATORE' });
    const _csrf = await browser.csrf('/account');
    await browser.post(`/utenti/${shared.id}/stato`, { _csrf, active: '0' });
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: shared.id },
      include: { memberships: true },
    });
    assert.equal(after.deactivatedAt, null);
    const roles = Object.fromEntries(after.memberships.map((m) => [m.aziendaId, m.role]));
    assert.equal(roles[shared.aziendaId!], 'OPERATORE');
    assert.equal(roles[elsewhere.id], 'TECNICO');
  });
});
