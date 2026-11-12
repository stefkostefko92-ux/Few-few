// Point D1 — access through the Client's identity provider (terms 2026-11-12, art. 4.6): the company's
// administrator names its Microsoft tenant or Google Workspace domain; each person links their own account
// from "Account" with their password; then "Accedi con Microsoft/Google" opens a session — code flow with
// PKCE, state and nonce, the ID token checked (signature, issuer of the tenant, audience, nonce) — but only
// while one of the person's active companies still allows that organisation. Never MASTER, never an account
// that is not linked (no match by email), the two-step code still asked when it is on.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { JWTPayload } from 'jose';
import {
  ALTRO_TENANT,
  autorizza,
  avviaProviderFinto,
  claimsGoogle,
  claimsMicrosoft,
  fermaProviderFinto,
  scambi,
  TENANT,
} from './oidc-finto.js';

await avviaProviderFinto();
const { Browser, makeAzienda, outbox, PASSWORD, prisma, signedIn, startApp, stopApp } =
  await import('./harness.js');
const { cifraSegreto } = await import('../../src/auth/chiavi.js');
const { totpCodeAt, totpStep } = await import('../../src/auth/totp.js');

before(startApp);
after(async () => {
  await stopApp();
  await fermaProviderFinto();
});

type B = InstanceType<typeof Browser>;
const errore = (body: string) => /<div class="errors"[^>]*><h2>([^<]+)</.exec(body)?.[1] ?? '';
const sessione = (b: B) => b.cookies.has('rilievi_sid');

/** The company with Microsoft and Google switched on by its administrator, through the settings page. */
async function aziendaConAccesso(nome: string, microsoft = TENANT, google = 'ascensori.example') {
  const azienda = await makeAzienda(nome);
  const { browser: admin } = await signedIn('ADMIN', azienda.id);
  const page = `/impostazioni/accesso?azienda=${azienda.id}`;
  const saved = await admin.submit(page, '/impostazioni/accesso', {
    azienda: azienda.id,
    microsoft,
    google,
  });
  assert.equal(saved.status, 303, errore(saved.body));
  return { azienda, admin };
}

/** Links the browser's account to the provider identity, through "Account". */
async function collega(browser: B, fornitore: 'microsoft' | 'google', claims: JWTPayload) {
  const start = await browser.submit('/account', `/account/esterno/${fornitore}/collega`, {
    password: PASSWORD,
  });
  assert.equal(start.status, 303, errore(start.body));
  return browser.get(autorizza(start.location, claims));
}

/** "Accedi con …" from the sign-in page of a fresh browser, up to the callback. */
async function accedi(
  fornitore: 'microsoft' | 'google',
  claims: JWTPayload,
  browser = new Browser(),
) {
  const start = await browser.submit('/accesso', `/accesso/esterno/${fornitore}`, {
    next: '/cartelli',
  });
  assert.equal(start.status, 303, `start: ${start.status}`);
  const path = autorizza(start.location, claims);
  const reply = await browser.get(path);
  return { browser, reply, start, path };
}

describe('access through the identity provider', () => {
  it('lets the administrator set the tenant and the domain, strictly', async () => {
    const azienda = await makeAzienda('Sso Impostazioni');
    const { browser: admin } = await signedIn('ADMIN', azienda.id);
    const page = `/impostazioni/accesso?azienda=${azienda.id}`;
    const shown = await admin.get(page);
    assert.equal(shown.status, 200);
    assert.match(shown.body, /name="microsoft"/);
    assert.match(shown.body, /name="google"/);
    const bad = await admin.submit(page, '/impostazioni/accesso', {
      azienda: azienda.id,
      microsoft: 'contoso.onmicrosoft.com',
      google: 'gmail.com',
    });
    assert.equal(bad.status, 422);
    let row = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(row.accessoMicrosoft, null);
    assert.equal(row.accessoGoogle, null);
    const ok = await admin.submit(page, '/impostazioni/accesso', {
      azienda: azienda.id,
      microsoft: TENANT.toUpperCase(),
      google: 'Ascensori.Example',
    });
    assert.equal(ok.status, 303);
    row = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(row.accessoMicrosoft, TENANT);
    assert.equal(row.accessoGoogle, 'ascensori.example');
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'AZIENDA_ACCESSO_ESTERNO', aziendaId: azienda.id },
    });
    assert.deepEqual(audit?.meta, { microsoft: true, google: true });
    const { browser: tecnico } = await signedIn('TECNICO', azienda.id);
    assert.equal((await tecnico.get(page)).status, 403);
  });

  it('links an account with the password, then signs in with it', async () => {
    const { azienda } = await aziendaConAccesso('Sso Microsoft');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    const wrong = await browser.submit('/account', '/account/esterno/microsoft/collega', {
      password: 'sbagliata-sbagliata',
    });
    assert.equal(wrong.status, 422);
    const linked = await collega(
      browser,
      'microsoft',
      claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000001'),
    );
    assert.equal(linked.status, 303);
    assert.equal(linked.location, '/account');
    const id = await prisma.identitaEsterna.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(id.fornitore, 'MICROSOFT');
    assert.equal(id.soggetto, `${TENANT}:a1b2c3d4-0000-4000-8000-000000000001`);
    assert.equal(id.organizzazione, TENANT);
    assert.match(
      (await browser.get('/account')).body,
      /a1b2c3d4-0000-4000-8000-000000000001@contoso\.example/,
    );
    assert.ok(outbox.some((m) => m.to === user.email && /Microsoft/.test(m.subject)));
    // The token endpoint got the client secret and the PKCE verifier.
    assert.match(scambi.at(-1)?.verifier ?? '', /^[A-Za-z0-9_-]{43}$/);

    const { browser: nuovo, reply } = await accedi(
      'microsoft',
      claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000001'),
    );
    assert.equal(reply.status, 303, errore(reply.body));
    assert.equal(reply.location, '/cartelli');
    assert.ok(sessione(nuovo));
    assert.equal((await nuovo.get('/schede')).status, 200);
    const login = await prisma.auditLog.findFirst({
      where: { action: 'LOGIN', targetId: user.id },
      orderBy: { at: 'desc' },
    });
    assert.deepEqual(login?.meta, { fornitore: 'microsoft' });
  });

  it('refuses a replayed, forged or foreign answer', async () => {
    const { azienda } = await aziendaConAccesso('Sso Rifiuti');
    const { browser } = await signedIn('TECNICO', azienda.id);
    const oid = 'a1b2c3d4-0000-4000-8000-000000000002';
    await collega(browser, 'microsoft', claimsMicrosoft(oid));

    // The same callback twice: the state cookie is spent by the first.
    const { browser: b1, reply: r1, path: p1 } = await accedi('microsoft', claimsMicrosoft(oid));
    assert.equal(r1.status, 303);
    assert.equal((await b1.get(p1)).status, 400);

    // A copy of the state cookie in another browser: the state has passed once, the provider is not asked again.
    const origine = new Browser();
    const so = await origine.submit('/accesso', '/accesso/esterno/microsoft', { next: '/schede' });
    const cookie = origine.cookies.get('rilievi_oidc') ?? '';
    const po = autorizza(so.location, claimsMicrosoft(oid));
    assert.equal((await origine.get(po)).status, 303);
    const copia = new Browser();
    copia.cookies.set('rilievi_oidc', cookie);
    const scambiPrima = scambi.length;
    assert.equal((await copia.get(po)).status, 400);
    assert.equal(scambi.length, scambiPrima);
    assert.ok(!sessione(copia));

    // A state that is not base64url (more bytes than characters) is a plain 400, not a crash.
    const strano = new Browser();
    await strano.submit('/accesso', '/accesso/esterno/microsoft', { next: '/schede' });
    const accentato = await strano.get(
      `/accesso/esterno/microsoft/ritorno?code=x&state=${encodeURIComponent('é' + 'a'.repeat(42))}`,
    );
    assert.equal(accentato.status, 400);

    // Without the cookie of the browser that started (login CSRF).
    const starter = new Browser();
    const start = await starter.submit('/accesso', '/accesso/esterno/microsoft', {
      next: '/schede',
    });
    const altro = new Browser();
    const cross = await altro.get(autorizza(start.location, claimsMicrosoft(oid)));
    assert.equal(cross.status, 400);
    assert.ok(!sessione(altro));

    // Another state in the URL.
    const s2 = new Browser();
    const st2 = await s2.submit('/accesso', '/accesso/esterno/microsoft', { next: '/schede' });
    const path = autorizza(st2.location, claimsMicrosoft(oid)).replace(
      /state=[^&]+/,
      'state=' + 'A'.repeat(43),
    );
    assert.equal((await s2.get(path)).status, 400);

    const casi: Array<[string, JWTPayload, { firmaEstranea?: boolean }?]> = [
      ['wrong nonce', claimsMicrosoft(oid, TENANT, { nonce: 'B'.repeat(43) })],
      ['wrong audience', claimsMicrosoft(oid, TENANT, { aud: 'altro-client' })],
      [
        'issuer of another tenant',
        claimsMicrosoft(oid, TENANT, {
          iss: `${new URL(start.location).origin}/ms/${ALTRO_TENANT}/v2.0`,
        }),
      ],
      ['expired', claimsMicrosoft(oid, TENANT, { exp: Math.floor(Date.now() / 1000) - 600 })],
      ['unknown key', claimsMicrosoft(oid), { firmaEstranea: true }],
    ];
    for (const [nome, claims, opzioni] of casi) {
      const b = new Browser();
      const s = await b.submit('/accesso', '/accesso/esterno/microsoft', { next: '/schede' });
      const reply = await b.get(autorizza(s.location, claims, opzioni));
      assert.equal(reply.status, 400, nome);
      assert.ok(!sessione(b), nome);
    }

    // Cancelled at the provider.
    const c = new Browser();
    const sc = await c.submit('/accesso', '/accesso/esterno/microsoft', { next: '/schede' });
    const state = new URL(sc.location).searchParams.get('state');
    const cancelled = await c.get(
      `/accesso/esterno/microsoft/ritorno?error=access_denied&state=${state}`,
    );
    assert.equal(cancelled.status, 400);
    assert.ok(errore(cancelled.body));
  });

  it('never matches by email, nor lets an identity serve two accounts', async () => {
    const { azienda } = await aziendaConAccesso('Sso Email');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    // An identity that was never linked, even with the person's own email, opens nothing.
    const { reply, browser: b } = await accedi(
      'microsoft',
      claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000003', TENANT, {
        email: user.email,
        preferred_username: user.email,
      }),
    );
    assert.equal(reply.status, 403);
    assert.ok(!sessione(b));
    await collega(browser, 'microsoft', claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000004'));
    const { browser: altro, user: altroUser } = await signedIn('TECNICO', azienda.id);
    const dup = await collega(
      altro,
      'microsoft',
      claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000004'),
    );
    assert.equal(dup.status, 422);
    assert.equal(await prisma.identitaEsterna.count({ where: { userId: altroUser.id } }), 0);
    // An account of another tenant is not linked to this company's people.
    const fuori = await collega(
      altro,
      'microsoft',
      claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000005', ALTRO_TENANT),
    );
    assert.equal(fuori.status, 422);
    assert.equal(await prisma.identitaEsterna.count({ where: { userId: altroUser.id } }), 0);
  });

  it('stops when the company switches it off, the account is off or unlinked', async () => {
    const { azienda, admin } = await aziendaConAccesso('Sso Spento');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    const oid = 'a1b2c3d4-0000-4000-8000-000000000006';
    await collega(browser, 'microsoft', claimsMicrosoft(oid));
    const off = await admin.submit(
      `/impostazioni/accesso?azienda=${azienda.id}`,
      '/impostazioni/accesso',
      {
        azienda: azienda.id,
        microsoft: '',
        google: '',
      },
    );
    assert.equal(off.status, 303);
    assert.equal((await accedi('microsoft', claimsMicrosoft(oid))).reply.status, 403);
    await prisma.azienda.update({ where: { id: azienda.id }, data: { accessoMicrosoft: TENANT } });
    await prisma.user.update({ where: { id: user.id }, data: { deactivatedAt: new Date() } });
    assert.equal((await accedi('microsoft', claimsMicrosoft(oid))).reply.status, 403);
    await prisma.user.update({
      where: { id: user.id },
      data: { deactivatedAt: null, lockedUntil: new Date(Date.now() + 600_000) },
    });
    assert.equal((await accedi('microsoft', claimsMicrosoft(oid))).reply.status, 429);
    await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: null } });
    const unlink = await browser.submit('/account', '/account/esterno/microsoft/scollega', {});
    assert.equal(unlink.status, 303);
    assert.equal(await prisma.identitaEsterna.count({ where: { userId: user.id } }), 0);
    assert.equal((await accedi('microsoft', claimsMicrosoft(oid))).reply.status, 403);
  });

  it('binds a link to the session that started it', async () => {
    const { azienda } = await aziendaConAccesso('Sso Sessione');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    const start = await browser.submit('/account', '/account/esterno/microsoft/collega', {
      password: PASSWORD,
    });
    assert.equal(start.status, 303);
    // A new session in the same browser (someone else signs in) does not finish the old link.
    assert.equal((await browser.submit('/account', '/esci', {})).status, 302);
    assert.equal((await browser.login(user.email)).status, 302);
    const reply = await browser.get(
      autorizza(start.location, claimsMicrosoft('a1b2c3d4-0000-4000-8000-000000000007')),
    );
    assert.equal(reply.status, 400);
    assert.equal(await prisma.identitaEsterna.count({ where: { userId: user.id } }), 0);
  });

  it('asks the two-step code when it is on, and never serves MASTER', async () => {
    const { azienda } = await aziendaConAccesso('Sso Codice');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    const oid = 'a1b2c3d4-0000-4000-8000-000000000008';
    await collega(browser, 'microsoft', claimsMicrosoft(oid));
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecretEnc: cifraSegreto(secret), totpEnabledAt: new Date() },
    });
    const { browser: b, reply } = await accedi('microsoft', claimsMicrosoft(oid));
    assert.equal(reply.status, 200);
    assert.match(reply.body, /action="\/accesso\/codice"/);
    assert.ok(!sessione(b));
    const _csrf = /name="_csrf" value="([^"]+)"/.exec(reply.body)?.[1] ?? '';
    const code = totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
    const done = await b.post('/accesso/codice', { _csrf, codice: code });
    assert.equal(done.status, 303);
    assert.ok(sessione(b));

    const { browser: master } = await signedIn('MASTER');
    assert.doesNotMatch((await master.get('/account')).body, /esterno\/microsoft\/collega/);
    const tried = await master.submit('/account', '/account/esterno/microsoft/collega', {
      password: PASSWORD,
    });
    assert.equal(tried.status, 404);
  });

  it('takes Google only from the Workspace domain of the company', async () => {
    const { azienda } = await aziendaConAccesso('Sso Google');
    const { browser, user } = await signedIn('TECNICO', azienda.id);
    // A personal Gmail account (no hd) is not the company's.
    assert.equal((await collega(browser, 'google', claimsGoogle('1001'))).status, 422);
    assert.equal(
      (await collega(browser, 'google', claimsGoogle('1001', 'altro.example'))).status,
      422,
    );
    assert.equal(
      (await collega(browser, 'google', claimsGoogle('1001', 'ascensori.example'))).status,
      303,
    );
    const { reply, browser: b } = await accedi('google', claimsGoogle('1001', 'ascensori.example'));
    assert.equal(reply.status, 303, errore(reply.body));
    assert.ok(sessione(b));
    const id = await prisma.identitaEsterna.findFirstOrThrow({ where: { userId: user.id } });
    assert.equal(id.soggetto, '1001');
    assert.ok(id.usataAt);
  });

  it('shows the buttons only where they can work', async () => {
    const login = await new Browser().get('/accesso');
    assert.match(login.body, /action="\/accesso\/esterno\/microsoft"/);
    assert.match(login.body, /action="\/accesso\/esterno\/google"/);
    const { browser } = await signedIn('TECNICO', (await makeAzienda('Sso Nessuno')).id);
    assert.doesNotMatch((await browser.get('/account')).body, /esterno\/microsoft\/collega/);
    assert.equal(
      (await new Browser().submit('/accesso', '/accesso/esterno/yahoo', { next: '/' })).status,
      404,
    );
  });
});
