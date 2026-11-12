// The names and rights of the roles per company and the audit log (the owner, 30 October 2026), against
// the real app: the company admin renames the roles and changes what the roles below may do — the
// change holds from the next request of everyone in the company — and the log shows each one their own
// actions and those of the roles below, never an equal or higher role.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = { data: '2026-10-12', matricola: '0071234', indirizzo: 'Via Roma 1, Milano' };

/** The roles form as the defaults, with the changes of the test on top. */
function form(aziendaId: string, changes: Record<string, string | string[]>) {
  return {
    azienda: aziendaId,
    'perm-DIREZIONE': [
      'schede:read',
      'schede:write',
      'schede:delete',
      'interventi:read',
      'interventi:write',
    ],
    'perm-RESPONSABILE': [
      'schede:read',
      'schede:write',
      'schede:delete',
      'interventi:read',
      'interventi:write',
    ],
    'perm-TECNICO': ['schede:read', 'schede:write', 'interventi:read', 'interventi:write'],
    'perm-OPERATORE': ['schede:read', 'schede:write', 'interventi:read', 'interventi:write'],
    'perm-CLIENTE': ['schede:read', 'interventi:read'],
    ...changes,
  };
}

async function create(browser: Browser): Promise<number> {
  return (await browser.submit('/schede/nuova', '/schede', SURVEY)).status;
}

describe('the roles of a company', () => {
  it('get the admin’s names and rights, from the next request of everyone in it', async () => {
    const azienda = await makeAzienda();
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const { browser: operatore } = await signedIn('OPERATORE', azienda.id);
    assert.equal(await create(tecnico), 303, 'a technician writes by default');
    assert.equal((await operatore.get('/registro')).status, 403);

    const saved = await admin.submit(
      '/impostazioni',
      '/impostazioni/ruoli',
      form(azienda.id, {
        'nome-TECNICO': 'Manutentore',
        'perm-TECNICO': ['schede:read', 'interventi:read'],
        'perm-OPERATORE': ['schede:write', 'interventi:write', 'audit:view'],
      }),
    );
    assert.equal(saved.status, 303);
    const row = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.deepEqual(row.nomiRuoli, { TECNICO: 'Manutentore' });
    assert.deepEqual(row.permessiRuoli, {
      TECNICO: ['schede:read', 'interventi:read'],
      OPERATORE: [
        'schede:read',
        'schede:write',
        'interventi:read',
        'interventi:write',
        'audit:view',
      ],
    });
    assert.ok(
      await prisma.auditLog.findFirst({
        where: { aziendaId: azienda.id, action: 'AZIENDA_RUOLI' },
      }),
    );

    // The technician lost writing, the operator got the log — no new sign-in needed.
    assert.equal((await tecnico.get('/schede/nuova')).status, 403);
    const csrf = await tecnico.csrf('/account');
    assert.equal((await tecnico.post('/schede', { _csrf: csrf, ...SURVEY })).status, 403);
    assert.doesNotMatch((await tecnico.get('/schede')).body, /href="\/schede\/nuova"/);
    assert.equal((await operatore.get('/registro')).status, 200);
    assert.match((await operatore.get('/schede')).body, /href="\/registro"/);
    // The new name everywhere the company's roles show.
    assert.match((await admin.get('/utenti')).body, /Manutentore/);
    assert.match((await tecnico.get('/account')).body, /<dd>Manutentore<\/dd>/);
  });

  it('cannot be changed below ADMIN, in another company, or with rights out of reach', async () => {
    const [azienda, altra] = [await makeAzienda(), await makeAzienda()];
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { browser: direzione } = await signedIn('DIREZIONE', azienda.id);
    const post = await direzione.request('POST', '/impostazioni/ruoli', {
      form: form(azienda.id, {}),
    });
    assert.equal(post.status, 403);
    assert.equal(
      (await admin.submit('/impostazioni', '/impostazioni/ruoli', form(altra.id, {}))).status,
      404,
    );
    const forged = await admin.submit(
      '/impostazioni',
      '/impostazioni/ruoli',
      form(azienda.id, { 'perm-CLIENTE': ['schede:read', 'users:manage'] }),
    );
    assert.equal(forged.status, 422);
    assert.match(forged.body, /Valore non valido\./);
    const twin = await admin.submit(
      '/impostazioni',
      '/impostazioni/ruoli',
      form(azienda.id, { 'nome-TECNICO': 'Amministratore' }),
    );
    assert.equal(twin.status, 422);
    assert.match(twin.body, /Due ruoli non possono avere lo stesso nome\./);
    assert.match(twin.body, /value="Amministratore"/, 'what was typed comes back');
    for (const id of [azienda.id, altra.id]) {
      const row = await prisma.azienda.findUniqueOrThrow({ where: { id } });
      assert.equal(row.nomiRuoli, null);
      assert.equal(row.permessiRuoli, null);
    }
  });

  it('keep the hierarchy for people and settings whatever a forged record says', async () => {
    const azienda = await makeAzienda();
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { permessiRuoli: { CLIENTE: ['users:manage', 'aziende:settings', 'schede:trash'] } },
    });
    const { browser: cliente } = await signedIn('CLIENTE', azienda.id);
    assert.equal((await cliente.get('/utenti')).status, 403);
    assert.equal((await cliente.get('/impostazioni')).status, 403);
    assert.equal((await cliente.get('/cestino')).status, 200, 'the configurable right holds');
  });
});

describe('the audit log', () => {
  it('shows one’s own actions and those of the roles below, not an equal role or the master', async () => {
    const azienda = await makeAzienda();
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const { browser: altroAdmin } = await signedIn('ADMIN', azienda.id);
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    const { browser: master } = await signedIn('MASTER');
    const scheda = async (browser: Browser) => {
      const reply = await browser.submit('/schede/nuova', '/schede', SURVEY);
      assert.equal(reply.status, 303);
      return reply.location;
    };
    const [mia, diUnPari, delTecnico] = [
      await scheda(admin),
      await scheda(altroAdmin),
      await scheda(tecnico),
    ];
    await master.submit('/impostazioni', '/impostazioni/cartello', {
      azienda: azienda.id,
      modello: 'blu',
    });
    const log = (await admin.get('/registro')).body;
    assert.match(log, new RegExp(`href="${mia}"`), 'own action');
    assert.match(log, new RegExp(`href="${delTecnico}"`), 'a role below');
    assert.doesNotMatch(log, new RegExp(`href="${diUnPari}"`), 'an equal role');
    assert.doesNotMatch(log, /Modello del cartello di fermo impianto cambiato/, 'the master');
    // The master sees everything; the technician has no log by default.
    const all = (await master.get(`/registro?azienda=${azienda.id}`)).body;
    for (const href of [mia, diUnPari, delTecnico]) assert.match(all, new RegExp(`href="${href}"`));
    assert.equal((await tecnico.get('/registro')).status, 403);
  });
});

describe('the role names', () => {
  it('reach the invite page and the master’s view of the users', async () => {
    const azienda = await makeAzienda();
    await prisma.azienda.update({
      where: { id: azienda.id },
      data: { nomiRuoli: { TECNICO: 'Manutentore' } },
    });
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const invited = await admin.submit('/utenti/invita', '/utenti/invita', {
      name: 'Nuovo Manutentore',
      email: `manutentore.${Date.now()}@rilievi.test`,
      role: 'TECNICO',
    });
    assert.equal(invited.status, 200);
    const link = /<input class="input" id="link" type="text" readonly value="([^"]+)"/.exec(
      invited.body,
    )?.[1];
    assert.ok(link);
    const page = await new Browser().get(new URL(link).pathname);
    assert.match(page.body, /Manutentore/);
    const { browser: master } = await signedIn('MASTER');
    assert.match((await master.get(`/utenti?azienda=${azienda.id}`)).body, /Manutentore/);
  });
});
