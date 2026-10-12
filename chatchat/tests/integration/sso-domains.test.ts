import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { after, before, beforeEach, describe, test } from 'node:test';
import { promisify } from 'node:util';
import { ENTRA_TID, FAKE_CLIENT_ID, FAKE_CLIENT_SECRET, FakeIdp } from '../sso-fake-idp.js';
import { Client, db, makeUser, PEPPER, resetDb } from './helpers.js';
import {
  cookieFrom,
  finishCallback,
  makeSsoConfig,
  seedSsoTenant,
  signInPassword,
  startSsoApp,
  verifyDomainViaDns,
  type SsoHarness,
} from './sso-world.js';

/**
 * Находка 2 от ревюто: домейните се ДОКАЗВАТ (DNS TXT `_chatchat.<домейн>`). Недоказан домейн не
 * показва бутон, не започва вход, не свързва и не минава теста; заявка не блокира друг клиент —
 * първият доказал печели, недоказаните заявки на другите се изтриват; аварийно — CLI с изричен флаг.
 */

const run = promisify(execFile);
let idp: FakeIdp;
let h: SsoHarness;

before(async () => {
  idp = await FakeIdp.create();
  await idp.listen();
  h = await startSsoApp(idp);
});
after(async () => {
  await h.close();
  await idp.close();
  await db.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  idp.tamper = {};
  idp.txt.clear();
  idp.dnsDown.clear();
});

const entraInput = (domains: string[]) => ({
  provider: 'ENTRA',
  entraTenantId: ENTRA_TID,
  clientId: FAKE_CLIENT_ID,
  clientSecret: FAKE_CLIENT_SECRET,
  domains,
});

async function adminOf(slug: string) {
  const { tenant, company } = await seedSsoTenant(slug);
  const admin = await makeUser({
    tenantId: tenant.id,
    role: 'TENANT_ADMIN',
    email: `admin@${slug}.example`,
  });
  return { tenant, company, admin, client: await signInPassword(h, admin) };
}

async function claim(client: Client, domains: string[], companyId?: string) {
  const r = await client.post('/api/v1/admin/sso/configs', {
    ...entraInput(domains),
    ...(companyId ? { companyId } : {}),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.config as {
    id: string;
    domainStatus: Array<{ domain: string; txt: { host: string; value: string } | null }>;
  };
}

const verifyUrl = (id: string, domain: string) =>
  `/api/v1/admin/sso/configs/${id}/domains/${encodeURIComponent(domain)}/verify`;

describe('Недоказан домейн не участва във входа', () => {
  test('няма бутон, няма начало; доказан → има; доказаност, изгубена по средата на входа → отказ', async () => {
    const { tenant } = await seedSsoTenant();
    await makeSsoConfig(idp, { tenantId: tenant.id, domains: ['alfa.example'], verified: false });
    const user = await makeUser({
      tenantId: tenant.id,
      role: 'INTERNAL_TECHNICIAN',
      email: 't@alfa.example',
    });
    const c = new Client(h.base);
    assert.deepEqual((await c.post('/api/v1/auth/sso/discover', { email: user.email })).body, {
      sso: null,
    });
    const start = await c.post('/api/v1/auth/sso/start', { email: user.email });
    assert.deepEqual([start.status, start.body.code], [404, 'sso_not_configured']);

    await db.ssoDomain.updateMany({
      data: { verifiedAt: new Date(), verifiedDomain: 'alfa.example' },
    });
    const shown = await c.post('/api/v1/auth/sso/discover', { email: user.email });
    assert.deepEqual(shown.body, { sso: { provider: 'ENTRA', label: null } });
    const begun = await fetch(`${h.base}/api/v1/auth/sso/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: h.origin },
      body: JSON.stringify({ email: user.email }),
    });
    const url = ((await begun.json()) as { url: string }).url;
    idp.next = { oid: 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001', preferred_username: user.email };
    const to = new URL(
      (await fetch(url, { redirect: 'manual' })).headers.get('location') ?? `${h.origin}/`,
    );
    await db.ssoDomain.updateMany({ data: { verifiedAt: null, verifiedDomain: null } });
    const back = await finishCallback(h, `${to.pathname}${to.search}`, cookieFrom(begun, 'cc_sso'));
    assert.equal(back.location, '/?sso_error=sso_denied');
    assert.equal(await db.externalIdentity.count(), 0);
  });
});

describe('Доказване през DNS TXT', () => {
  test('липсващ/чужд/паднал DNS → грешка; правилен (на парчета) → доказан, с одит', async () => {
    const { client } = await adminOf('alfa');
    const cfg = await claim(client, ['alfa.example']);
    const txt = cfg.domainStatus[0]?.txt;
    assert.ok(txt);
    assert.equal(txt.host, '_chatchat.alfa.example');
    const missing = await client.post(verifyUrl(cfg.id, 'alfa.example'));
    assert.deepEqual([missing.status, missing.body.code], [422, 'sso_domain_txt_missing']);
    idp.txt.set(txt.host, [['chatchat-verify=sbagliato']]);
    const wrong = await client.post(verifyUrl(cfg.id, 'alfa.example'));
    assert.deepEqual([wrong.status, wrong.body.code], [422, 'sso_domain_txt_mismatch']);
    idp.dnsDown.add(txt.host);
    const down = await client.post(verifyUrl(cfg.id, 'alfa.example'));
    assert.deepEqual([down.status, down.body.code], [502, 'sso_domain_dns_error']);
    idp.dnsDown.clear();
    const half = Math.floor(txt.value.length / 2);
    idp.txt.set(txt.host, [['v=spf1 -all'], [txt.value.slice(0, half), txt.value.slice(half)]]);
    const ok = await client.post(verifyUrl(cfg.id, 'alfa.example'));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const row = ok.body.config.domainStatus[0];
    assert.notEqual(row.verifiedAt, null);
    assert.equal(row.txt, null);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.domain_verified' },
    });
    assert.deepEqual(audit.detail, { domain: 'alfa.example', via: 'dns', removedClaims: 0 });
    assert.doesNotMatch(JSON.stringify(audit.detail), /chatchat-verify/);
  });

  test('недоказана заявка не блокира друг клиент; първият доказал печели; токенът е на заявката', async () => {
    const a = await adminOf('alfa');
    const b = await adminOf('beta');
    const cfgA = await claim(a.client, ['shared.example']);
    const cfgB = await claim(b.client, ['shared.example']); // заявката на A не пречи
    const txtA = cfgA.domainStatus[0]?.txt;
    const txtB = cfgB.domainStatus[0]?.txt;
    assert.ok(txtA && txtB);
    assert.equal(txtA.host, txtB.host);
    assert.notEqual(txtA.value, txtB.value);
    // Записът на A в DNS не доказва заявката на B.
    idp.txt.set(txtA.host, [[txtA.value]]);
    const notB = await b.client.post(verifyUrl(cfgB.id, 'shared.example'));
    assert.deepEqual([notB.status, notB.body.code], [422, 'sso_domain_txt_mismatch']);
    // B (истинският собственик) доказва → заявката на A изчезва (одит в клиента на A).
    assert.equal((await verifyDomainViaDns(idp, b.client, cfgB.id, 'shared.example')).status, 200);
    assert.equal(await db.ssoDomain.count({ where: { configId: cfgA.id } }), 0);
    const removed = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.domain_claim_removed' },
    });
    assert.equal(removed.tenantId, a.tenant.id);
    // A вече не може нито да го заяви, нито да го докаже.
    const again = await a.client.patch(`/api/v1/admin/sso/configs/${cfgA.id}`, {
      domains: ['shared.example'],
    });
    assert.deepEqual([again.status, again.body.code], [409, 'sso_domain_taken']);
    const late = await a.client.post(verifyUrl(cfgA.id, 'shared.example'));
    assert.equal(late.status, 404);
    const created = await a.client.post('/api/v1/admin/sso/configs', {
      ...entraInput(['shared.example']),
      companyId: a.company.id,
    });
    assert.deepEqual([created.status, created.body.code], [409, 'sso_domain_taken']);
  });

  test('махнат и добавен отново домейн → доказва се наново (нов токен)', async () => {
    const { client } = await adminOf('alfa');
    const cfg = await claim(client, ['alfa.example', 'beta-alfa.example']);
    assert.equal((await verifyDomainViaDns(idp, client, cfg.id, 'alfa.example')).status, 200);
    const old = idp.txt.get('_chatchat.alfa.example')?.[0]?.[0];
    const url = `/api/v1/admin/sso/configs/${cfg.id}`;
    assert.equal((await client.patch(url, { domains: ['beta-alfa.example'] })).status, 200);
    const back = await client.patch(url, { domains: ['alfa.example', 'beta-alfa.example'] });
    const row = (
      back.body.config.domainStatus as Array<{
        domain: string;
        txt: { value: string } | null;
        verifiedAt: string | null;
      }>
    ).find((d) => d.domain === 'alfa.example');
    assert.equal(row?.verifiedAt, null);
    assert.notEqual(row?.txt?.value, old);
  });

  test('достъп: чужд клиент 404, без право 403, без CSRF 403, невалиден домейн 400', async () => {
    const a = await adminOf('alfa');
    const b = await adminOf('beta');
    const cfg = await claim(a.client, ['alfa.example']);
    const support = await makeUser({
      tenantId: a.tenant.id,
      role: 'SUPPORT',
      email: 's@alfa.example',
    });
    assert.equal((await b.client.post(verifyUrl(cfg.id, 'alfa.example'))).status, 404);
    assert.equal(
      (await (await signInPassword(h, support)).post(verifyUrl(cfg.id, 'alfa.example'))).status,
      403,
    );
    assert.equal(
      (await a.client.post(verifyUrl(cfg.id, 'alfa.example'), {}, { csrf: null })).status,
      403,
    );
    assert.equal((await a.client.post(verifyUrl(cfg.id, 'not a domain'))).status, 400);
  });
});

describe('CLI: аварийно доказване без DNS', () => {
  const cli = (env: Record<string, string>) =>
    run(process.execPath, ['--import', 'tsx', 'src/cli/sso-domain.ts'], {
      env: {
        PATH: process.env.PATH ?? '',
        DATABASE_URL: process.env.DATABASE_URL ?? '',
        SESSION_PEPPER: PEPPER,
        ...env,
      },
    });

  test('без изричния флаг → отказ; с него → доказан (одит via cli); доказан от друг → отказ', async () => {
    const a = await adminOf('alfa');
    const b = await adminOf('beta');
    await claim(a.client, ['alfa.example']);
    const cfgB = await claim(b.client, ['alfa.example']);
    await assert.rejects(cli({ TENANT_SLUG: 'alfa', SSO_DOMAIN: 'alfa.example' }));
    assert.equal(await db.ssoDomain.count({ where: { verifiedAt: { not: null } } }), 0);
    const { stdout } = await cli({
      TENANT_SLUG: 'alfa',
      SSO_DOMAIN: 'Alfa.Example',
      SSO_VERIFY_WITHOUT_DNS: '1',
    });
    assert.match(stdout, /alfa\.example/);
    const audit = await db.auditEvent.findFirstOrThrow({
      where: { action: 'sso.domain_verified' },
    });
    assert.equal(audit.actorId, null);
    assert.equal((audit.detail as { via: string }).via, 'cli');
    assert.equal(await db.ssoDomain.count({ where: { configId: cfgB.id } }), 0);
    await assert.rejects(
      cli({ TENANT_SLUG: 'beta', SSO_DOMAIN: 'alfa.example', SSO_VERIFY_WITHOUT_DNS: '1' }),
    );
  });
});
