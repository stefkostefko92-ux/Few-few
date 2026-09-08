/**
 * Панел + агент по целия път срещу жива PostgreSQL:
 * вход → CSRF → бранд → акаунт → агентски ключ → подписана чернова от агента →
 * агентът НЕ може да одобри → човек одобрява → по-ниска роля НЕ може → одит-веригата е цяла.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

const hasDatabase = Boolean(process.env.DATABASE_URL);

process.env.NODE_ENV ??= 'test';
process.env.PUBLIC_BASE_URL ??= 'https://publikator.example.com';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
process.env.IG_APP_ID ??= '123456';
process.env.IG_APP_SECRET ??= 'app-secret';
process.env.IG_REDIRECT_URI ??= 'https://publikator.example.com/auth/instagram/callback';
process.env.TOKEN_ENC_KEY ??= 'a'.repeat(64);
process.env.DATABASE_URL ??= 'postgresql://postgres@127.0.0.1:5432/publikator_test';
process.env.LOG_LEVEL ??= 'silent';

const { prisma } = await import('../../src/db.js');
const { hashPassword } = await import('../../src/auth/password.js');
const { encryptSecret } = await import('../../src/crypto.js');
const { MemoryNonceStore } = await import('../../src/agent/nonce-store.js');
const { createServer } = await import('../../src/server.js');
const { verifyAuditChain } = await import('../../src/audit.js');
const { signRequest } = await import('../../src/agent/signature.js');

class Browser {
  private cookies = new Map<string, string>();
  constructor(private readonly base: string) {}

  private header(): string {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private absorb(res: Response): void {
    for (const raw of res.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(';');
      const [name, value] = (pair ?? '').split('=');
      if (!name) continue;
      const expired = attrs.some(
        (a) => /max-age=0/i.test(a) || /expires=Thu, 01 Jan 1970/i.test(a),
      );
      if (expired || value === undefined || value === '') this.cookies.delete(name.trim());
      else this.cookies.set(name.trim(), value);
    }
  }

  async get(path: string): Promise<Response> {
    const res = await fetch(this.base + path, {
      headers: { cookie: this.header() },
      redirect: 'manual',
    });
    this.absorb(res);
    return res;
  }

  async form(path: string, fields: Record<string, string | string[]>): Promise<Response> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      for (const item of Array.isArray(v) ? v : [v]) body.append(k, item);
    }
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: { cookie: this.header(), 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
    this.absorb(res);
    return res;
  }

  async csrf(path = '/admin'): Promise<string> {
    const html = await (await this.get(path)).text();
    const match = html.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(match, `няма CSRF токен в ${path}`);
    return match[1]!;
  }
}

test('панел + агент: пълен път', { skip: !hasDatabase }, async (t) => {
  const stamp = Date.now();
  const ownerEmail = `owner-${stamp}@example.com`;
  const viewerEmail = `viewer-${stamp}@example.com`;
  const password = 'Publikator2026!';

  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: 'Собственик',
      passwordHash: await hashPassword(password),
      role: 'OWNER',
    },
  });
  const viewer = await prisma.user.create({
    data: {
      email: viewerEmail,
      name: 'Наблюдател',
      passwordHash: await hashPassword(password),
      role: 'VIEWER',
    },
  });

  const app = createServer({ nonceStore: new MemoryNonceStore() });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const created: { brandId?: string } = {};
  t.after(async () => {
    server.close();
    if (created.brandId)
      await prisma.brand.delete({ where: { id: created.brandId } }).catch(() => undefined);
    await prisma.apiKey.deleteMany({ where: { createdById: owner.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
    await prisma.$disconnect();
  });

  // 1) Без вход → към входа; JSON маршрутите на агента без подпис → 401.
  const anon = await fetch(`${base}/admin`, { redirect: 'manual' });
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location') ?? '', /^\/admin\/login/);
  assert.equal((await fetch(`${base}/agent/v1/brands`)).status, 401);

  // 2) Вход като собственик.
  const browser = new Browser(base);
  const bad = await browser.form('/admin/login', {
    email: ownerEmail,
    password: 'грешна-парола-123',
  });
  assert.equal(bad.status, 401);
  const login = await browser.form('/admin/login', { email: ownerEmail, password });
  assert.equal(login.status, 302);
  assert.equal(login.headers.get('location'), '/admin');
  const dashboard = await browser.get('/admin');
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Табло/);
  assert.match(dashboard.headers.get('content-security-policy') ?? '', /script-src 'self' 'nonce-/);

  // 3) CSRF: без токен → 403; с токен → бранд.
  const noCsrf = await browser.form('/admin/brands', {
    slug: `t-${stamp}`,
    name: 'Тест',
    summary: 'Продукт за тестове.',
    voice: 'Кратко.',
    language: 'bg',
  });
  assert.equal(noCsrf.status, 403);
  const csrf = await browser.csrf('/admin/brands/new');
  const brandRes = await browser.form('/admin/brands', {
    _csrf: csrf,
    slug: `t-${stamp}`,
    name: 'Тест',
    summary: 'Продукт за тестове.',
    voice: 'Кратко.',
    language: 'bg',
  });
  assert.equal(brandRes.status, 302);
  const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: `t-${stamp}` } });
  created.brandId = brand.id;

  const account = await prisma.instagramAccount.create({
    data: {
      brandId: brand.id,
      igUserId: `1784${stamp}`,
      username: `test_${stamp}`,
      accessTokenEnc: encryptSecret('IGQV-fake', process.env.TOKEN_ENC_KEY!),
      tokenExpiresAt: new Date(Date.now() + 50 * 24 * 3600 * 1000),
      scopes: 'instagram_business_basic',
    },
  });

  // 4) Агентски ключ — тайната се показва веднъж в отговора.
  const keyPage = await browser.form('/admin/keys', {
    _csrf: csrf,
    name: 'socialdjiyata',
    scopes: ['brands:read', 'accounts:read', 'drafts:read', 'drafts:write'],
    brandIds: [brand.id],
    expiresInDays: '90',
  });
  assert.equal(keyPage.status, 200);
  const keyHtml = await keyPage.text();
  const keyId = keyHtml.match(/PUBLIKATOR_KEY_ID=([A-Za-z0-9]+)/)?.[1];
  const keySecret = keyHtml.match(/PUBLIKATOR_KEY_SECRET=(pk_[A-Za-z0-9_-]+)/)?.[1];
  assert.ok(keyId && keySecret, 'ключът трябва да се покаже веднъж');
  const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: keyId } });
  assert.ok(!stored.secretEnc.includes(keySecret), 'тайната не се пази в чист вид');

  // 5) Агентът създава чернова с подписана заявка.
  const agentCall = async (
    method: string,
    path: string,
    payload?: unknown,
    tweak: Partial<Record<string, string>> = {},
  ) => {
    const body = payload === undefined ? '' : JSON.stringify(payload);
    const timestamp = tweak.timestamp ?? String(Math.floor(Date.now() / 1000));
    const nonce = tweak.nonce ?? `n${stamp}${Math.random().toString(36).slice(2, 14)}`;
    const signature =
      tweak.signature ?? signRequest(keySecret, { timestamp, nonce, method, path, body });
    return fetch(base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-publikator-key-id': keyId,
        'x-publikator-timestamp': timestamp,
        'x-publikator-nonce': nonce,
        'x-publikator-signature': signature,
      },
      body: body || undefined,
      redirect: 'manual',
    });
  };

  const brandsRes = await agentCall('GET', '/agent/v1/brands');
  assert.equal(brandsRes.status, 200);
  const brandsJson = (await brandsRes.json()) as { brands: Array<{ slug: string }> };
  assert.deepEqual(
    brandsJson.brands.map((b) => b.slug),
    [brand.slug],
  );

  const draftPayload = {
    brandSlug: brand.slug,
    accountId: account.id,
    kind: 'IMAGE',
    mediaUrl: 'https://cdn.example.com/a.jpg',
    caption: 'Кукичка на първи ред.\n\nОбяснението следва.',
    altText: 'Описание на снимката.',
    hashtags: ['#тест'],
    topic: 'тестова тема',
  };
  const fixedNonce = `replay${stamp}abcdef`;
  const draftRes = await agentCall('POST', '/agent/v1/drafts', draftPayload, { nonce: fixedNonce });
  assert.equal(draftRes.status, 201);
  const draftJson = (await draftRes.json()) as {
    post: { id: string; status: string; createdByType: string; aiAssisted: boolean };
  };
  assert.equal(draftJson.post.status, 'DRAFT');
  assert.equal(draftJson.post.createdByType, 'AGENT');
  assert.equal(draftJson.post.aiAssisted, true);

  // повторение на същия nonce → отказ; лош подпис → отказ; стар timestamp → отказ
  assert.equal(
    (await agentCall('POST', '/agent/v1/drafts', draftPayload, { nonce: fixedNonce })).status,
    401,
  );
  assert.equal(
    (await agentCall('POST', '/agent/v1/drafts', draftPayload, { signature: 'f'.repeat(64) }))
      .status,
    401,
  );
  assert.equal(
    (await agentCall('POST', '/agent/v1/drafts', draftPayload, { timestamp: '1600000000' })).status,
    401,
  );

  // 6) Агентът НЯМА път към одобрение: маршрутът е човешки (сесия) → пренасочва към вход.
  const agentApprove = await agentCall('POST', `/admin/posts/${draftJson.post.id}/approve`, {});
  assert.equal(agentApprove.status, 302);
  assert.match(agentApprove.headers.get('location') ?? '', /^\/admin\/login/);
  const stillDraft = await prisma.post.findUniqueOrThrow({ where: { id: draftJson.post.id } });
  assert.equal(stillDraft.status, 'DRAFT');

  // 7) Човекът одобрява от панела.
  const approve = await browser.form(`/admin/posts/${draftJson.post.id}/approve`, { _csrf: csrf });
  assert.equal(approve.status, 302);
  const approved = await prisma.post.findUniqueOrThrow({ where: { id: draftJson.post.id } });
  assert.equal(approved.status, 'APPROVED');
  assert.match(approved.approvedBy ?? '', new RegExp(ownerEmail));

  // 8) Наблюдател не може да одобрява/отказва.
  const viewerBrowser = new Browser(base);
  assert.equal(
    (await viewerBrowser.form('/admin/login', { email: viewerEmail, password })).status,
    302,
  );
  const viewerCsrf = await viewerBrowser.csrf('/admin');
  const forbidden = await viewerBrowser.form(`/admin/posts/${draftJson.post.id}/reject`, {
    _csrf: viewerCsrf,
    reason: 'не',
  });
  assert.equal(forbidden.status, 403);
  assert.equal((await viewerBrowser.get('/admin/keys')).status, 403);

  // 9) Изход унищожава сесията.
  assert.equal((await browser.form('/admin/logout', { _csrf: csrf })).status, 302);
  assert.equal((await browser.get('/admin')).status, 302);

  // 10) Одит-веригата е цяла и съдържа агентското създаване и човешкото одобрение.
  const chain = await verifyAuditChain();
  assert.equal(chain.ok, true);
  const actions = (await prisma.auditLog.findMany({ where: { targetId: draftJson.post.id } }))
    .map((r) => r.action)
    .sort();
  assert.deepEqual(actions, ['post.approve', 'post.draft.create']);
});
