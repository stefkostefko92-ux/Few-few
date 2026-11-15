import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient, type Session } from './http.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');

/** SPEC 48: износ на фирмата (ZIP), моите данни (JSON) и закриване на профила. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let orgId = '';
let ownerId = '';

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const reg = await register({
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
  orgId = reg.organizationId;
  ownerId = reg.userId;
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } })
  ).id;
  for (const name of ['Хляб', 'Козунак']) {
    const res = await http.post(owner, `/app/o/${orgId}/nov`, {
      typeCode: '380',
      seriesId,
      issueDate: '2026-11-13',
      taxPointDate: '2026-11-13',
      dueDate: '2026-11-27',
      currency: 'EUR',
      'buyer[name]': 'Сладкарница Роза ЕООД',
      'buyer[legalId]': '121604974',
      'buyer[street]': 'ул. „Шипка“ 1',
      'buyer[city]': 'София',
      'buyer[postalCode]': '1000',
      'buyer[countryCode]': 'BG',
      'lines[0][name]': name,
      'lines[0][quantity]': '2',
      'lines[0][unitCode]': 'C62',
      'lines[0][netPrice]': '3.50',
      'lines[0][category]': 'S',
      'lines[0][rate]': '20',
      saveBuyer: 'on',
    });
    assert.equal(res.status, 303);
  }
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('износът: PDF, UBL и CII на всеки документ, регистър и каталог — валиден ZIP', async () => {
  // И останалото (одитът от 13.11.2026): проформа, получена е-фактура, плащане по документ.
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({ where: { organizationId: orgId } })
  ).id;
  const proforma = await http.post(owner, `/app/o/${orgId}/nov`, {
    typeCode: 'proforma',
    seriesId,
    issueDate: '2026-11-13',
    taxPointDate: '2026-11-13',
    dueDate: '2026-11-27',
    currency: 'EUR',
    'buyer[name]': 'Сладкарница Роза ЕООД',
    'buyer[legalId]': '121604974',
    'buyer[street]': 'ул. „Шипка“ 1',
    'buyer[city]': 'София',
    'buyer[postalCode]': '1000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Торта',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '30.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
  });
  assert.equal(proforma.status, 303);
  await prisma.incomingInvoice.create({
    data: {
      organizationId: orgId,
      format: 'UBL',
      xml: '<Invoice>входяща</Invoice>',
      sha256: 'd'.repeat(64),
      supplierName: 'Мелница Злато ООД',
      supplierEik: '175074752',
      number: '0000000777',
      typeCode: '380',
      currency: 'EUR',
      payableCents: 1200n,
      vatCents: 200n,
      issues: [],
      valid: true,
    },
  });
  const first = await prisma.document.findFirstOrThrow({ where: { number: '0000000001' } });
  const paid = await http.post(owner, `/app/o/${orgId}/d/${first.id}/plashtane`, {
    amount: '1.00',
    paidOn: '2026-11-13',
  });
  assert.equal(paid.status, 303);
  const res = await http.get(owner, `/app/o/${orgId}/iznos.zip`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  const dir = mkdtempSync(join(tmpdir(), 'fakturist-export-'));
  const file = join(dir, 'export.zip');
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  execFileSync('unzip', ['-tq', file]);
  const names = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
  for (const n of ['0000000001', '0000000002']) {
    for (const suffix of ['.pdf', '-ubl.xml', '-cii.xml']) {
      assert.ok(names.includes(`dokumenti/${n}${suffix}`), `${n}${suffix}`);
    }
  }
  for (const n of [
    'dokumenti.csv',
    'kontragenti.json',
    'artikuli.json',
    'serii.json',
    'firma.json',
    'vhodyashti.csv',
    'plashtaniya.csv',
  ]) {
    assert.ok(names.includes(n), n);
  }
  assert.ok(
    names.some((n) => n.startsWith('proformi/') && n.endsWith('.pdf')),
    'проформата',
  );
  const incoming = names.find((n) => n.startsWith('vhodyashti/') && n.endsWith('.xml'))!;
  assert.equal(
    execFileSync('unzip', ['-p', file, incoming], { encoding: 'utf8' }),
    '<Invoice>входяща</Invoice>',
    'получената — точно както е получена',
  );
  assert.match(
    execFileSync('unzip', ['-p', file, 'plashtaniya.csv'], { encoding: 'utf8' }),
    /0000000001,2026-11-13,1\.00,EUR,MANUAL/,
  );
  const csv = execFileSync('unzip', ['-p', file, 'dokumenti.csv'], { encoding: 'utf8' });
  assert.ok(csv.includes('0000000002') && csv.includes('Сладкарница Роза ЕООД'));
  const ubl = execFileSync('unzip', ['-p', file, 'dokumenti/0000000001-ubl.xml'], {
    encoding: 'utf8',
  });
  const stored = await prisma.document.findFirstOrThrow({ where: { number: '0000000001' } });
  assert.equal(ubl, stored.ublXml, 'XML-ът е точно издаденият');
  assert.ok(await prisma.auditLog.findFirst({ where: { action: 'organization.exported' } }));
});

test('моите данни: профил, членства, приети документи — без хешове и тайни', async () => {
  const res = await http.get(owner, '/app/sigurnost/moite-danni.json');
  assert.equal(res.status, 200);
  const text = await res.text();
  const data = JSON.parse(text) as { profile: { email: string }; memberships: unknown[] };
  assert.equal(data.profile.email, 'owner@example.test');
  assert.equal(data.memberships.length, 1);
  assert.ok(!/passwordHash|totpSecret|argon2|tokenHash/.test(text));
});

test('закриване: грешна парола, единствен собственик с членове — отказ; после профилът е заличен', async () => {
  const wrong = await http.post(owner, '/app/sigurnost/zakrii', {
    password: 'грешна',
    confirm: 'on',
  });
  assert.ok(wrong.headers.get('location')?.endsWith('err=close.password'));
  const member = await prisma.user.create({
    data: { email: 'member@example.test', name: 'Член', passwordHash: 'x' },
  });
  const membership = await prisma.membership.create({
    data: { userId: member.id, organizationId: orgId, role: 'ISSUER' },
  });
  const blocked = await http.post(owner, '/app/sigurnost/zakrii', {
    password: PASSWORD,
    confirm: 'on',
  });
  assert.ok(blocked.headers.get('location')?.endsWith('err=close.transferFirst'));
  await prisma.membership.delete({ where: { id: membership.id } });

  const closed = await http.post(owner, '/app/sigurnost/zakrii', {
    password: PASSWORD,
    confirm: 'on',
  });
  assert.equal(closed.status, 303);
  // Бисквитката „доверено устройство“ се маха заедно със сесията.
  assert.ok(
    closed.headers
      .getSetCookie()
      .some((c) => /^fakturist_dev=;/.test(c) && /Expires=Thu, 01 Jan 1970/.test(c)),
  );
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
  assert.equal(user.name, 'Закрит профил');
  assert.ok(user.email.endsWith('@fakturist.invalid') && user.disabledAt);
  assert.equal(await prisma.session.count({ where: { userId: ownerId } }), 0);
  assert.equal(await prisma.membership.count({ where: { userId: ownerId } }), 0);
  // Документите остават при фирмата; старият имейл не влиза.
  assert.equal(await prisma.document.count({ where: { organizationId: orgId } }), 2);
  assert.equal(
    (await http.post(null, '/vhod', { email: 'owner@example.test', password: PASSWORD })).status,
    400,
  );
  assert.equal((await http.get(owner, `/app/o/${orgId}`)).status, 303);
});
