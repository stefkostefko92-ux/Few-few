import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { invalidateSettings } = await import('../../src/admin/settings.js');
const { inviteOwnerByFirm, acceptTransferInvite, findOpenInvite, TransferError } =
  await import('../../src/accounts/transfer.js');
const { createServer } = await import('../../src/server.js');
const { hashPassword } = await import('../../src/auth/password.js');
const { createTransferInvite } = await import('../../src/accounts/transfer.js');

/**
 * Собственик и счетоводител на една фирма (SPEC 26–28): кантората добавя фирмата и кани собственика;
 * собствеността е на собственика, кантората работи по пълномощно, след като той го потвърди.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Шипка“ 1',
  addressCity: 'София',
  postalCode: '1000',
};

let server: Server;
let origin = '';
let firm = { userId: '', organizationId: '' };

interface Session {
  cookie: string;
  csrf: string;
}

async function login(email: string): Promise<Session> {
  const res = await fetch(`${origin}/vhod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: PASSWORD }),
  });
  assert.equal(res.status, 303, `вход ${email}`);
  const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  const page = await fetch(`${origin}/app`, { headers: { cookie } });
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? '';
  assert.ok(csrf, 'CSRF токен на страницата');
  return { cookie, csrf };
}

function post(session: Session, path: string, fields: Record<string, string>) {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: session.cookie },
    body: new URLSearchParams({ _csrf: session.csrf, ...fields }),
  });
}

const get = (session: Session, path: string) =>
  fetch(`${origin}${path}`, { redirect: 'manual', headers: { cookie: session.cookie } });

function clientFields(eik: string, legalName: string, ownerEmail: string) {
  return {
    legalName,
    eik,
    vatNumber: '',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
    iban: '',
    documentRef: 'Пълномощно № 3/01.11.2026',
    validFrom: '2026-11-01',
    ownerEmail,
  };
}

async function setDailyLimit(value: number): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'invites.firmDailyLimit' },
    create: { key: 'invites.firmDailyLimit', value },
    update: { value },
  });
  invalidateSettings();
}

const isCode = (code: string) => (error: unknown) =>
  error instanceof TransferError && error.code === code;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  firm = await register({
    ...base,
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'accountant@example.test',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
  });
  server = createServer().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
});

test('кантората добавя фирма и кани собственика; преди потвърждение не вижда фирмата', async () => {
  const session = await login('accountant@example.test');
  const created = await post(
    session,
    `/app/o/${firm.organizationId}/klienti/nov`,
    clientFields('131063188', 'Пекарна Зора ЕООД', 'Owner@Example.test'),
  );
  assert.equal(created.status, 303);
  const client = await prisma.organization.findUniqueOrThrow({ where: { eik: '131063188' } });
  const mandate = await prisma.clientMandate.findFirstOrThrow({ where: { clientId: client.id } });
  assert.equal(mandate.status, 'PENDING');
  const invite = await prisma.transferInvite.findFirstOrThrow({
    where: { organizationId: client.id },
  });
  assert.equal(invite.email, 'owner@example.test');
  assert.equal(invite.mandateId, mandate.id);
  assert.equal(
    await prisma.notification.count({
      where: { kind: 'transfer.invite', organizationId: client.id },
    }),
    1,
  );
  // Собствеността не е на кантората: няма членство във фирмата.
  assert.equal(await prisma.membership.count({ where: { organizationId: client.id } }), 0);
  // Преди потвърждение кантората не вижда фирмата и не може сама да потвърди пълномощното си.
  assert.equal((await get(session, `/app/o/${client.id}`)).status, 404);
  const self = await post(session, `/app/o/${client.id}/palnomoshtni/${mandate.id}/potvardi`, {});
  assert.equal(self.status, 404);
  assert.equal(
    (await prisma.clientMandate.findUniqueOrThrow({ where: { id: mandate.id } })).status,
    'PENDING',
  );
});

test('собственикът приема с отметка: става OWNER, пълномощното е активно, кантората е ACCOUNTANT', async () => {
  const client = await prisma.organization.findUniqueOrThrow({ where: { eik: '131063188' } });
  // Връзката от писмото: токенът е само в опашката (шифрован) — тук поканата се подновява от кантората.
  const token = await prisma.$transaction(async (tx) => {
    const result = await inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId: client.id,
      email: 'owner@example.test',
      actorId: firm.userId,
    });
    return result.token;
  });
  const open = await findOpenInvite(token);
  assert.equal(open?.mandate?.firm.legalName, 'Кантора Баланс ООД');
  assert.equal(open?.mandate?.status, 'PENDING');

  const page = await fetch(`${origin}/pokana/${token}`);
  const html = await page.text();
  assert.ok(html.includes('Кантора Баланс ООД') && html.includes('name="confirmMandate"'));

  const accepted = await fetch(`${origin}/pokana/${token}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'Зора Петрова',
      password: 'хлебът-се-пече-рано-сутрин',
      acceptTerms: 'on',
      confirmMandate: 'on',
    }),
  });
  assert.equal(accepted.status, 303);
  const owner = await prisma.user.findUniqueOrThrow({
    where: { email: 'owner@example.test' },
    include: { memberships: true },
  });
  assert.deepEqual(
    owner.memberships.map((m) => [m.organizationId, m.role]),
    [[client.id, 'OWNER']],
  );
  const mandate = await prisma.clientMandate.findFirstOrThrow({ where: { clientId: client.id } });
  assert.equal(mandate.status, 'ACTIVE');
  const approved = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'mandate.approved', targetId: mandate.id },
  });
  assert.equal(approved.actorId, owner.id);

  // Счетоводителят вече работи по пълномощно, но не управлява пълномощните и собствеността.
  const session = await login('accountant@example.test');
  assert.equal((await get(session, `/app/o/${client.id}`)).status, 200);
  assert.equal((await get(session, `/app/o/${client.id}/palnomoshtni`)).status, 404);
  assert.equal(
    await prisma.membership.count({ where: { userId: firm.userId, organizationId: client.id } }),
    0,
  );
  // Фирма със собственик не се кани наново.
  await assert.rejects(
    prisma.$transaction((tx) =>
      inviteOwnerByFirm(tx, {
        firmId: firm.organizationId,
        clientId: client.id,
        email: 'other@example.test',
        actorId: firm.userId,
      }),
    ),
    isCode('hasOwner'),
  );
});

test('без отметка пълномощното остава чакащо — решава го собственикът по-късно', async () => {
  const session = await login('accountant@example.test');
  await post(
    session,
    `/app/o/${firm.organizationId}/klienti/nov`,
    clientFields('200000015', 'Ателие Линия ООД', ''),
  );
  const client = await prisma.organization.findUniqueOrThrow({ where: { eik: '200000015' } });
  assert.equal(await prisma.transferInvite.count({ where: { organizationId: client.id } }), 0);
  const mandate = await prisma.clientMandate.findFirstOrThrow({ where: { clientId: client.id } });
  // Поканата по-късно, от началната страница на кантората.
  const sent = await post(session, `/app/o/${firm.organizationId}/klienti/${mandate.id}/pokana`, {
    email: 'linia@example.test',
  });
  assert.equal(sent.status, 303);
  assert.ok(sent.headers.get('location')?.includes('pokana=ok'));
  const token = await prisma.$transaction(async (tx) => {
    const result = await inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId: client.id,
      email: 'linia@example.test',
      actorId: firm.userId,
    });
    return result.token;
  });
  await acceptTransferInvite({
    token,
    user: { name: 'Лина Тодорова', password: 'линиите-са-прави-и-дълги' },
  });
  assert.equal(
    (await prisma.clientMandate.findUniqueOrThrow({ where: { id: mandate.id } })).status,
    'PENDING',
  );
  assert.equal((await get(session, `/app/o/${client.id}`)).status, 404);
});

test('отказ: служител на кантората, чуждо или оттеглено пълномощно, дневен таван', async () => {
  const other = await register({
    ...base,
    kind: 'accountant',
    name: 'Петър Петров',
    email: 'other-firm@example.test',
    legalName: 'Друга Кантора ЕООД',
    eik: '200000002',
  });
  await setDailyLimit(20);
  const managed = async (eik: string, firmId: string, status: 'PENDING' | 'REVOKED') => {
    const org = await prisma.organization.create({
      data: {
        kind: 'COMPANY',
        legalName: `Клиент ${eik}`,
        eik,
        addressStreet: 'ул. „Шипка“ 3',
        addressCity: 'София',
        postalCode: '1000',
        createdByFirmId: firmId,
      },
    });
    await prisma.clientMandate.create({
      data: {
        firmId,
        clientId: org.id,
        status,
        documentRef: 'Пълномощно № 9',
        validFrom: new Date('2026-11-01T00:00:00Z'),
      },
    });
    return org.id;
  };
  const invite = (firmId: string, clientId: string, email: string, actorId: string) =>
    prisma.$transaction((tx) => inviteOwnerByFirm(tx, { firmId, clientId, email, actorId }));

  const a = await managed('200000027', other.organizationId, 'PENDING');
  // Счетоводителят не може да покани себе си (или колега) за собственик.
  await assert.rejects(
    invite(other.organizationId, a, 'other-firm@example.test', other.userId),
    isCode('firmMember'),
  );
  // Чуждо пълномощно: кантората кани само за свои клиенти.
  await assert.rejects(
    invite(firm.organizationId, a, 'x@example.test', firm.userId),
    isCode('notFound'),
  );
  const revoked = await managed('200000034', other.organizationId, 'REVOKED');
  await assert.rejects(
    invite(other.organizationId, revoked, 'x@example.test', other.userId),
    isCode('notFound'),
  );

  // Таванът е настройка в мастър панела.
  await setDailyLimit(2);
  const b = await managed('208725180', other.organizationId, 'PENDING');
  await invite(other.organizationId, a, 'a-owner@example.test', other.userId);
  await invite(other.organizationId, b, 'b-owner@example.test', other.userId);
  await assert.rejects(
    invite(other.organizationId, b, 'b-owner2@example.test', other.userId),
    isCode('rateLimited'),
  );
});

test('чужда кантора не взема фирма без собственик: добавя я само с чакащо пълномощно, без покана', async () => {
  await setDailyLimit(20);
  // Кантора X създава фирмата; мастърът е пратил покана до истинския собственик.
  const x = await login('accountant@example.test');
  await post(
    x,
    `/app/o/${firm.organizationId}/klienti/nov`,
    clientFields('300000003', 'Мелница Жито АД', ''),
  );
  const client = await prisma.organization.findUniqueOrThrow({ where: { eik: '300000003' } });
  assert.equal(client.createdByFirmId, firm.organizationId);
  const masterInvite = await createTransferInvite({
    organizationId: client.id,
    email: 'real-owner@example.test',
    actorId: firm.userId,
  });

  // Кантора Y добавя същия ЕИК с „имейл на собственика“ — свой втори имейл.
  const y = await register({
    ...base,
    kind: 'accountant',
    name: 'Игрек Игреков',
    email: 'y@example.test',
    legalName: 'Кантора Игрек ЕООД',
    eik: '300000010',
  });
  const ys = await login('y@example.test');
  const added = await post(
    ys,
    `/app/o/${y.organizationId}/klienti/nov`,
    clientFields('300000003', 'Мелница Жито АД', 'y.private@example.test'),
  );
  assert.equal(added.status, 303);
  assert.ok(added.headers.get('location')?.includes('klient=existing'));
  const yMandate = await prisma.clientMandate.findFirstOrThrow({
    where: { firmId: y.organizationId, clientId: client.id },
  });
  assert.equal(yMandate.status, 'PENDING');
  assert.equal(await prisma.transferInvite.count({ where: { mandateId: yMandate.id } }), 0);
  const still = await prisma.transferInvite.findUniqueOrThrow({
    where: { id: masterInvite.inviteId },
  });
  assert.equal(still.revokedAt, null);
  // И пряко, и през „Покани собственика“ — отказ.
  await assert.rejects(
    prisma.$transaction((tx) =>
      inviteOwnerByFirm(tx, {
        firmId: y.organizationId,
        clientId: client.id,
        email: 'y.private@example.test',
        actorId: y.userId,
      }),
    ),
    isCode('notCreator'),
  );
  const resend = await post(ys, `/app/o/${y.organizationId}/klienti/${yMandate.id}/pokana`, {
    email: 'y.private@example.test',
  });
  assert.ok(resend.headers.get('location')?.includes('pokana=notCreator'));

  // Създателят не отменя поканата на мастъра.
  await assert.rejects(
    prisma.$transaction((tx) =>
      inviteOwnerByFirm(tx, {
        firmId: firm.organizationId,
        clientId: client.id,
        email: 'someone@example.test',
        actorId: firm.userId,
      }),
    ),
    isCode('invited'),
  );
  assert.equal(
    (await prisma.transferInvite.findUniqueOrThrow({ where: { id: masterInvite.inviteId } }))
      .revokedAt,
    null,
  );
});

test('дневният таван държи и при едновременни покани', async () => {
  const z = await register({
    ...base,
    kind: 'accountant',
    name: 'Зета Зетова',
    email: 'z@example.test',
    legalName: 'Кантора Зета ООД',
    eik: '300000028',
  });
  await setDailyLimit(2);
  const eiks = ['300000035', '300000042', '300000054', '300000067', '300000074', '300000081'];
  const clients: string[] = [];
  for (const eik of eiks) {
    const org = await prisma.organization.create({
      data: {
        kind: 'COMPANY',
        legalName: `Клиент ${eik}`,
        eik,
        addressStreet: 'ул. „Шипка“ 4',
        addressCity: 'София',
        postalCode: '1000',
        createdByFirmId: z.organizationId,
      },
    });
    await prisma.clientMandate.create({
      data: {
        firmId: z.organizationId,
        clientId: org.id,
        status: 'PENDING',
        documentRef: 'Пълномощно № 21',
        validFrom: new Date('2026-11-01T00:00:00Z'),
      },
    });
    clients.push(org.id);
  }
  const results = await Promise.allSettled(
    clients.map((clientId, i) =>
      prisma.$transaction((tx) =>
        inviteOwnerByFirm(tx, {
          firmId: z.organizationId,
          clientId,
          email: `owner${i}@example.test`,
          actorId: z.userId,
        }),
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
});

test('имейлът от поканата се вижда само от OWNER/ADMIN на кантората', async () => {
  await setDailyLimit(20);
  const viewer = await prisma.user.create({
    data: {
      email: 'viewer@example.test',
      name: 'Виктор Гледачев',
      passwordHash: await hashPassword(PASSWORD),
    },
  });
  await prisma.membership.create({
    data: { userId: viewer.id, organizationId: firm.organizationId, role: 'VIEWER' },
  });
  const ownerSession = await login('accountant@example.test');
  await post(
    ownerSession,
    `/app/o/${firm.organizationId}/klienti/nov`,
    clientFields('300000099', 'Книжарница Перо ООД', 'pero-owner@example.test'),
  );
  const mine = await (await get(ownerSession, '/app')).text();
  assert.ok(mine.includes('pero-owner@example.test'));
  const theirs = await (await get(await login('viewer@example.test'), '/app')).text();
  assert.ok(theirs.includes('Книжарница Перо ООД'));
  assert.ok(!theirs.includes('pero-owner@example.test'));
});
