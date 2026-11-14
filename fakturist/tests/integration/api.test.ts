import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { sofiaToday } = await import('../../src/time.js');
const { addDays } = await import('../../src/recurring/schedule.js');

/** SPEC 53: API ключове (веднъж, хеш, обхват, оттегляне) и REST (списък, документ, файлове, издаване). */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let orgId = '';
let otherOrgId = '';
let seriesId = '';
let readKey = '';
let issueKey = '';
const today = sofiaToday();

function api(key: string, path: string, init: RequestInit = {}) {
  return fetch(`${http.origin}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${key}`, ...(init.headers ?? {}) },
  });
}

function body(extra: Record<string, unknown> = {}) {
  return {
    seriesId,
    typeCode: '380',
    issueDate: today,
    dueDate: addDays(today, 14),
    currency: 'EUR',
    buyer: {
      name: 'Сладкарница Роза ЕООД',
      legalId: '121604974',
      address: { street: 'ул. „Шипка“ 1', city: 'София', postalCode: '1000', countryCode: 'BG' },
    },
    lines: [
      {
        id: '1',
        name: 'Услуга',
        quantity: '2',
        unitCode: 'C62',
        netPrice: '50.00',
        vat: { category: 'S', rate: '20' },
        allowanceCharges: [],
        attributes: [],
      },
    ],
    notes: [],
    precedingInvoices: [],
    allowanceCharges: [],
    vatExemptions: [],
    ...extra,
  };
}

function post(key: string, payload: unknown, idempotencyKey?: string) {
  return api(key, '/api/v1/documents', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(payload),
  });
}

async function createKey(name: string, scopes: string[]): Promise<string> {
  const form = new URLSearchParams({ _csrf: owner.csrf, name });
  for (const s of scopes) form.append('scopes', s);
  const res = await fetch(`${http.origin}/app/o/${orgId}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: owner.cookie },
    body: form,
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const key = /(fkt_[A-Za-z0-9_-]{43})/.exec(await res.text())?.[1];
  assert.ok(key, 'ключът е на страницата веднъж');
  return key;
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const seller = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'owner@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    vatNumber: 'BG131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  orgId = seller.organizationId;
  const other = await register({
    kind: 'company',
    name: 'Мария Георгиева',
    email: 'other@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Чужда ЕООД',
    eik: '200000002',
    addressStreet: 'ул. „Шипка“ 1',
    addressCity: 'София',
    postalCode: '1000',
  });
  otherOrgId = other.organizationId;
  seriesId = (await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } }))
    .id;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('без план „Бизнес“ ключ не се създава', async () => {
  const form = new URLSearchParams({ _csrf: owner.csrf, name: 'Магазин', scopes: 'read' });
  const res = await fetch(`${http.origin}/app/o/${orgId}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: owner.cookie },
    body: form,
  });
  assert.match(await res.text(), /план „Бизнес“/);
  assert.equal(await prisma.apiKey.count(), 0);
  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'business' },
  });
});

test('ключът се показва веднъж; в базата е само хешът', async () => {
  readKey = await createKey('Само четене', ['read']);
  issueKey = await createKey('Магазин', ['read', 'issue']);
  const stored = await prisma.apiKey.findMany();
  assert.equal(stored.length, 2);
  for (const row of stored) {
    assert.ok(!JSON.stringify(row).includes(readKey));
    assert.ok(!JSON.stringify(row).includes(issueKey));
    assert.match(row.prefix, /^fkt_.{8}$/);
  }
  const list = await (await http.get(owner, `/app/o/${orgId}/api`)).text();
  assert.ok(!list.includes(readKey), 'списъкът не показва ключа отново');
});

test('без ключ, с грешен ключ или само за четене — отказ; бисквитка не стига', async () => {
  assert.equal((await fetch(`${http.origin}/api/v1/documents`)).status, 401);
  assert.equal((await api('fkt_' + 'x'.repeat(43), '/api/v1/documents')).status, 401);
  const withCookie = await fetch(`${http.origin}/api/v1/documents`, {
    headers: { cookie: owner.cookie },
  });
  assert.equal(withCookie.status, 401);
  const denied = await post(readKey, body());
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { error: string }).error, 'scope');
});

test('издаване: 201 с номер от сървъра; Idempotency-Key връща същия; друго тяло — 422', async () => {
  const first = await post(issueKey, body(), 'zakaz-0001');
  assert.equal(first.status, 201);
  const created = (await first.json()) as {
    data: { id: string; number: string; totals: { payable: string } };
  };
  assert.equal(created.data.number, '0000000001');
  assert.equal(created.data.totals.payable, '120.00');
  const again = await post(issueKey, body(), 'zakaz-0001');
  assert.equal(again.status, 200);
  assert.equal(again.headers.get('idempotent-replayed'), 'true');
  assert.equal(((await again.json()) as { data: { id: string } }).data.id, created.data.id);
  const other = await post(issueKey, body({ notes: ['друго'] }), 'zakaz-0001');
  assert.equal(other.status, 422);
  // Едновременни заявки със същия ключ: един документ.
  const parallel = await Promise.all([
    post(issueKey, body(), 'zakaz-0002'),
    post(issueKey, body(), 'zakaz-0002'),
    post(issueKey, body(), 'zakaz-0002'),
  ]);
  assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 200, 201]);
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 2);
  const audit = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'api.document.issued', targetId: created.data.id },
  });
  assert.ok(audit.actorId);
});

test('доставчикът и номерът не идват от заявката; правилата връщат кодовете', async () => {
  const forged = await post(issueKey, {
    ...body(),
    number: '9999999999',
    seller: { name: 'Чужд' },
  });
  assert.equal(forged.status, 201);
  const doc = (await forged.json()) as { data: { number: string; id: string } };
  assert.equal(doc.data.number, '0000000003');
  const stored = await prisma.document.findUniqueOrThrow({ where: { id: doc.data.id } });
  assert.match(stored.ublXml ?? '', /Пекарна Зора ЕООД/);
  const bad = await post(issueKey, body({ lines: [] }));
  assert.equal(bad.status, 400);
  const rejected = await post(issueKey, body({ buyer: { ...body().buyer, legalId: '123' } }));
  assert.equal(rejected.status, 422);
  const issues = ((await rejected.json()) as { issues: Array<{ rule: string }> }).issues;
  assert.ok(issues.some((i) => i.rule.startsWith('BG-')));
});

test('четене: списък на страници, документ, PDF и XML; чужд документ — 404', async () => {
  const page1 = (await (await api(readKey, '/api/v1/documents?limit=2')).json()) as {
    data: Array<{ id: string }>;
    next: string | null;
  };
  assert.equal(page1.data.length, 2);
  assert.ok(page1.next);
  const page2 = (await (
    await api(readKey, `/api/v1/documents?limit=2&after=${page1.next}`)
  ).json()) as {
    data: Array<{ id: string }>;
    next: string | null;
  };
  assert.equal(page2.data.length, 1);
  assert.equal(page2.next, null);
  const id = page1.data[0]!.id;
  const one = await api(readKey, `/api/v1/documents/${id}`);
  assert.equal(one.status, 200);
  assert.ok(((await one.json()) as { data: { input: unknown } }).data.input);
  const pdf = await api(readKey, `/api/v1/documents/${id}/pdf`);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const ubl = await api(readKey, `/api/v1/documents/${id}/ubl.xml`);
  assert.match(await ubl.text(), /<Invoice/);
  const series = (await (await api(readKey, '/api/v1/series')).json()) as {
    data: Array<{ id: string }>;
  };
  assert.equal(series.data[0]!.id, seriesId);

  const foreign = await prisma.document.create({
    data: {
      organizationId: otherOrgId,
      typeCode: '380',
      status: 'ISSUED',
      number: '0000000001',
      issueDate: new Date(),
      input: {},
      buyerName: 'x',
    },
  });
  assert.equal((await api(readKey, `/api/v1/documents/${foreign.id}`)).status, 404);
  assert.equal((await api(readKey, `/api/v1/documents/${foreign.id}/pdf`)).status, 404);
  assert.equal((await api(readKey, '/api/v1/nyama')).status, 404);
});

test('оттеглен ключ, загубено право на създателя, сменен план', async () => {
  const key = await prisma.apiKey.findFirstOrThrow({ where: { name: 'Само четене' } });
  const res = await http.post(owner, `/app/o/${orgId}/api/${key.id}/ottegli`, {});
  assert.equal(res.status, 303);
  assert.equal((await api(readKey, '/api/v1/documents')).status, 401);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'api.key.revoked' } }));

  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'pro' },
  });
  const plan = await api(issueKey, '/api/v1/documents');
  assert.equal(plan.status, 403);
  assert.equal(((await plan.json()) as { error: string }).error, 'plan');
  await prisma.subscription.updateMany({
    where: { organizationId: orgId, status: 'ACTIVE' },
    data: { planCode: 'business' },
  });

  // Създателят вече не е член → четенето е по ключа на фирмата, издаването — не.
  const ownerId = (await prisma.apiKey.findFirstOrThrow({ where: { name: 'Магазин' } }))
    .createdById!;
  await prisma.membership.updateMany({
    where: { userId: ownerId, organizationId: orgId },
    data: { role: 'VIEWER' },
  });
  const noRight = await post(issueKey, body());
  assert.equal(noRight.status, 403);
  assert.equal(((await noRight.json()) as { error: string }).error, 'access');
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 3);
  await prisma.membership.updateMany({
    where: { userId: ownerId, organizationId: orgId },
    data: { role: 'OWNER' },
  });
});

test('невалиден JSON и твърде голямо тяло — JSON грешка, не HTML', async () => {
  const broken = await api(issueKey, '/api/v1/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"seriesId":',
  });
  assert.equal(broken.status, 400);
  assert.equal(((await broken.json()) as { error: string }).error, 'invalidJson');
  const big = await api(issueKey, '/api/v1/documents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x: 'a'.repeat(300_000) }),
  });
  assert.equal(big.status, 413);
});

test('ревю: страницата не губи документ, сменил статуса; невалидна дата и чужда серия — ясни кодове', async () => {
  const all = (await (await api(issueKey, '/api/v1/documents?status=ISSUED&limit=100')).json()) as {
    data: Array<{ id: string }>;
  };
  assert.ok(all.data.length >= 3);
  const page1 = (await (await api(issueKey, '/api/v1/documents?status=ISSUED&limit=1')).json()) as {
    data: Array<{ id: string }>;
    next: string;
  };
  // Курсорният документ е анулиран между двете страници — следващият не бива да изчезне.
  await prisma.document.update({ where: { id: page1.next }, data: { status: 'CANCELLED' } });
  const page2 = (await (
    await api(issueKey, `/api/v1/documents?status=ISSUED&limit=1&after=${page1.next}`)
  ).json()) as { data: Array<{ id: string }> };
  assert.equal(page2.data[0]?.id, all.data[1]?.id);
  await prisma.document.update({ where: { id: page1.next }, data: { status: 'ISSUED' } });

  const badDate = await api(issueKey, '/api/v1/documents?from=2026-13-45');
  assert.equal(badDate.status, 400);
  const otherSeries = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: otherOrgId },
  });
  const foreign = await post(issueKey, body({ seriesId: otherSeries.id }));
  assert.equal(foreign.status, 422);
  assert.equal(((await foreign.json()) as { error: string }).error, 'series');

  const noXml = await prisma.document.create({
    data: {
      organizationId: orgId,
      typeCode: '380',
      status: 'ISSUED',
      number: '0000009999',
      issueDate: new Date(),
      input: {},
      buyerName: 'x',
    },
  });
  const missing = await api(issueKey, `/api/v1/documents/${noXml.id}/ubl.xml`);
  assert.equal(missing.status, 404);
  assert.equal(((await missing.json()) as { error: string }).error, 'notFound');
});

test('ревю: махнат създател → ключът не чете; махане на член оттегля ключовете му', async () => {
  const { removeMember } = await import('../../src/accounts/members.js');
  const helper = await prisma.user.create({
    data: { email: 'admin2@example.test', name: 'Втори админ', passwordHash: 'x' },
  });
  const membership = await prisma.membership.create({
    data: { userId: helper.id, organizationId: orgId, role: 'ADMIN' },
  });
  const { createApiKey } = await import('../../src/api/keys.js');
  const { key } = await createApiKey(
    { organizationId: orgId, role: 'ADMIN', viaFirmId: null, mandateId: null },
    helper.id,
    { name: 'На админа', scopes: ['read'] },
  );
  assert.equal((await api(key, '/api/v1/series')).status, 200);
  const ownerId = (
    await prisma.membership.findFirstOrThrow({
      where: { organizationId: orgId, role: 'OWNER' },
    })
  ).userId;
  await removeMember({
    organizationId: orgId,
    membershipId: membership.id,
    actor: { userId: ownerId, role: 'OWNER' },
  });
  assert.equal((await api(key, '/api/v1/series')).status, 401, 'оттеглен заедно с членството');
  // Членство, изтрито без оттегляне (напр. ръчно) — 403, ключът пак не работи.
  const second = await createApiKey(
    { organizationId: orgId, role: 'OWNER', viaFirmId: null, mandateId: null },
    ownerId,
    { name: 'Временно', scopes: ['read'] },
  );
  await prisma.membership.updateMany({
    where: { userId: ownerId, organizationId: orgId },
    data: { userId: helper.id },
  });
  const orphan = await api(second.key, '/api/v1/series');
  assert.equal(orphan.status, 403);
  await prisma.membership.updateMany({
    where: { userId: helper.id, organizationId: orgId },
    data: { userId: ownerId },
  });
});
