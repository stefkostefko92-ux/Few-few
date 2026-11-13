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
const transfer = await import('../../src/accounts/transfer.js');
const { acceptTransferInvite } = await import('../../src/accounts/transfer-accept.js');
const { revokeOwnership } = await import('../../src/accounts/ownership.js');
const { inviteMember, acceptMemberInvite, removeMember, MemberError } =
  await import('../../src/accounts/members.js');
const { decideMandate } = await import('../../src/accounts/mandates.js');
const { decryptMemberInviteToken, encryptTotpSecret } = await import('../../src/auth/keys.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { TransferError } = await import('../../src/accounts/transfer-core.js');
const { sofiaToday } = await import('../../src/time.js');

/**
 * Регресии по одита на достъпа (Кодаджията, 13.11.2026): покани, които оцеляват след отнемане на
 * собственост, махане на член или оттегляне на пълномощно; шкафче към непотвърдена фирма; таван на
 * втория фактор по профил; нова сесия след кода; парола при включване на 2FA; действащо пълномощно.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let masterId = '';
let firm = { userId: '', organizationId: '' };
let company = { userId: '', organizationId: '' };
let owner: Session;

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterId = (
    await prisma.user.create({
      data: { email: 'm@example.test', name: 'М', passwordHash: 'x', platformRole: 'MASTER' },
    })
  ).id;
  firm = await register({
    kind: 'accountant',
    name: 'Цвета Колева',
    email: 'firm@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Кантора Баланс ООД',
    eik: '121604974',
    addressStreet: 'ул. „Граф Игнатиев“ 1',
    addressCity: 'София',
    postalCode: '1000',
  });
  company = await register({
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
  // Фирмата кани членове — план с повече потребители (безплатният е за един).
  await prisma.subscription.updateMany({
    where: { organizationId: company.organizationId },
    data: { planCode: 'business' },
  });
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

/** Фирма, добавена от кантората, с чакащо пълномощно. */
async function firmClient(eik: string) {
  const org = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: `Клиент ${eik} ЕООД`,
      eik,
      addressStreet: 'ул. „Самуил“ 3',
      addressCity: 'Перник',
      postalCode: '2300',
      createdByFirmId: firm.organizationId,
    },
  });
  const mandate = await prisma.clientMandate.create({
    data: {
      firmId: firm.organizationId,
      clientId: org.id,
      status: 'PENDING',
      documentRef: 'Пълномощно № 1',
      validFrom: new Date('2026-11-01T00:00:00Z'),
    },
  });
  return { id: org.id, mandateId: mandate.id };
}

/** Суровият токен на поканата за член — от шифрованото писмо в опашката. */
async function memberInviteToken(inviteId: string): Promise<string> {
  const mail = await prisma.notification.findFirstOrThrow({
    where: { kind: 'member.invite', payload: { path: ['inviteId'], equals: inviteId } },
  });
  const payload = mail.payload as { inviteId: string; tokenEnc: string };
  return decryptMemberInviteToken(payload.tokenEnc, payload.inviteId);
}

const memberError = (code: string) => (error: unknown) =>
  error instanceof MemberError && error.code === code;

test('F1: поканите за член, пратени от подставен собственик, падат с „Отнеми собствеността“', async () => {
  const client = await firmClient('175074752');
  const invite = await prisma.$transaction((tx) =>
    transfer.inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId: client.id,
      email: 'puppet@example.test',
      actorId: firm.userId,
    }),
  );
  const puppet = await acceptTransferInvite({
    token: invite.token,
    user: { name: 'Подставен Собственик', password: PASSWORD },
    confirmMandate: true,
  });
  await prisma.subscription.updateMany({
    where: { organizationId: client.id },
    data: { planCode: 'business' },
  });
  const { inviteId } = await inviteMember({
    organizationId: client.id,
    actor: { userId: puppet.userId, role: 'OWNER' },
    email: 'alt@example.test',
    role: 'ADMIN',
  });
  const token = await memberInviteToken(inviteId);
  const result = await revokeOwnership({
    organizationId: client.id,
    actorId: masterId,
    reason: 'disputed',
  });
  assert.equal(result.revokedMemberInvites, 1);
  await assert.rejects(
    acceptMemberInvite({ token, user: { name: 'Алтернативен', password: PASSWORD } }),
    memberError('invalid'),
  );
  assert.equal(await prisma.membership.count({ where: { organizationId: client.id } }), 0);
  assert.equal(
    (
      await prisma.notification.findFirstOrThrow({
        where: { kind: 'member.invite', payload: { path: ['inviteId'], equals: inviteId } },
      })
    ).status,
    'FAILED',
  );
});

test('F3: оттеглено пълномощно → поканата на кантората към собственик пада', async () => {
  const client = await firmClient('200000002');
  const invite = await prisma.$transaction((tx) =>
    transfer.inviteOwnerByFirm(tx, {
      firmId: firm.organizationId,
      clientId: client.id,
      email: 'puppet2@example.test',
      actorId: firm.userId,
    }),
  );
  await decideMandate({
    mandateId: client.mandateId,
    actorId: masterId,
    decision: 'revoke',
    clientOrgId: null,
  });
  const stored = await prisma.transferInvite.findFirstOrThrow({
    where: { organizationId: client.id },
  });
  assert.ok(stored.revokedAt);
  await assert.rejects(
    acceptTransferInvite({
      token: invite.token,
      user: { name: 'Подставен Втори', password: PASSWORD },
      confirmMandate: true,
    }),
    (error: unknown) => error instanceof TransferError && error.code === 'invalid',
  );
  assert.equal(await prisma.membership.count({ where: { organizationId: client.id } }), 0);
});

test('F6: махнат администратор не се връща през покана, пратена преди махането', async () => {
  const first = await inviteMember({
    organizationId: company.organizationId,
    actor: { userId: company.userId, role: 'OWNER' },
    email: 'admin@example.test',
    role: 'ADMIN',
  });
  const admin = await acceptMemberInvite({
    token: await memberInviteToken(first.inviteId),
    user: { name: 'Админ Админов', password: PASSWORD },
  });
  const second = await inviteMember({
    organizationId: company.organizationId,
    actor: { userId: admin.userId, role: 'ADMIN' },
    email: 'admin-alt@example.test',
    role: 'ISSUER',
  });
  const token = await memberInviteToken(second.inviteId);
  const membership = await prisma.membership.findFirstOrThrow({
    where: { userId: admin.userId, organizationId: company.organizationId },
  });
  await removeMember({
    organizationId: company.organizationId,
    membershipId: membership.id,
    actor: { userId: company.userId, role: 'OWNER' },
  });
  await assert.rejects(
    acceptMemberInvite({ token, user: { name: 'Втори Имейл', password: PASSWORD } }),
    memberError('invalid'),
  );
});

test('F2: шкафчето доставя само до потвърдена фирма', async () => {
  const recipient = await register({
    kind: 'company',
    name: 'Мария Иванова',
    email: 'recipient@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Сладкарница Роза ЕООД',
    eik: '200000015',
    vatNumber: 'BG200000015',
    addressStreet: 'ул. „Шипка“ 1',
    addressCity: 'София',
    postalCode: '1000',
  });
  const seriesId = (
    await prisma.documentSeries.findFirstOrThrow({
      where: { organizationId: company.organizationId },
    })
  ).id;
  const today = sofiaToday();
  const issue = () =>
    http.post(owner, `/app/o/${company.organizationId}/nov`, {
      typeCode: '380',
      seriesId,
      issueDate: today,
      taxPointDate: today,
      dueDate: today,
      currency: 'EUR',
      'buyer[name]': 'Сладкарница Роза ЕООД',
      'buyer[legalId]': '200000015',
      'buyer[vatId]': 'BG200000015',
      'buyer[street]': 'ул. „Шипка“ 1',
      'buyer[city]': 'София',
      'buyer[postalCode]': '1000',
      'buyer[countryCode]': 'BG',
      'lines[0][name]': 'Торта',
      'lines[0][quantity]': '1',
      'lines[0][unitCode]': 'C62',
      'lines[0][netPrice]': '50.00',
      'lines[0][category]': 'S',
      'lines[0][rate]': '20',
    });
  assert.equal((await issue()).status, 303);
  const inbox = () =>
    prisma.inboxEntry.count({ where: { recipientOrgId: recipient.organizationId } });
  assert.equal(await inbox(), 0, 'непотвърдена — нищо в шкафчето');
  assert.equal(
    await prisma.notification.count({ where: { kind: 'inbox.received' } }),
    0,
    'и без писмо до натрапника',
  );
  await prisma.organization.update({
    where: { id: recipient.organizationId },
    data: { verifiedAt: new Date() },
  });
  assert.equal((await issue()).status, 303);
  assert.equal(await inbox(), 1, 'потвърдена — доставено');
});

/** Вход с паролата → сесия преди кода (бисквитка + CSRF от страницата за кода). */
async function passwordStep(email: string): Promise<{ status: number; session: Session | null }> {
  const res = await http.post(null, '/vhod', { email, password: PASSWORD });
  if (res.status !== 303) return { status: res.status, session: null };
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const page = await http.get({ cookie, csrf: '' }, '/vhod/kod');
  const csrf = /name="_csrf" value="([^"]+)"/.exec(await page.text())?.[1] ?? '';
  return { status: 303, session: { cookie, csrf } };
}

test('F4 + F7: таванът на кода е по профил, не по сесия; след кода сесията е нова', async () => {
  const user = await prisma.user.create({
    data: { email: 'twofa@example.test', name: 'Двама Фактора', passwordHash: 'x' },
  });
  const { hashPassword } = await import('../../src/auth/password.js');
  const secret = generateTotpSecret();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(PASSWORD),
      totpSecretEnc: encryptTotpSecret(secret, user.id),
      totpEnabledAt: new Date(),
      emailVerifiedAt: new Date(),
    },
  });
  // Сесия → верен код → нова сесия: старата бисквитка вече не пуска.
  const ok = await passwordStep('twofa@example.test');
  assert.ok(ok.session);
  const code = totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
  const done = await http.post(ok.session, '/vhod/kod', { code });
  assert.equal(done.status, 303);
  assert.ok(
    done.headers
      .getSetCookie()
      .some((c) => c.startsWith('fakturist_sid=') || c.startsWith('__Host-fakturist=')),
  );
  const stale = await http.get(ok.session, '/app');
  assert.equal(stale.status, 303, 'сесията отпреди кода не е пълна');

  // Грешни кодове с нов вход всеки път: общият брояч заключва профила.
  let locked = false;
  for (let i = 0; i < 6 && !locked; i += 1) {
    const step = await passwordStep('twofa@example.test');
    if (!step.session) {
      locked = true;
      break;
    }
    const wrong = await http.post(step.session, '/vhod/kod', { code: '000000' });
    assert.equal(wrong.status, 400);
  }
  const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.ok(after.lockedUntil && after.lockedUntil > new Date(), 'профилът е заключен');
  assert.equal(
    (await passwordStep('twofa@example.test')).status,
    400,
    'заключен — и паролата не минава',
  );
});

test('F7: включването на 2FA иска текущата парола', async () => {
  const page = await (await http.get(owner, '/app/sigurnost')).text();
  const draft = /name="draft" value="([^"]+)"/.exec(page)?.[1] ?? '';
  const readable = /<code class="mono">([^<]+)<\/code>/.exec(page)?.[1] ?? '';
  const secret = readable.replace(/\s+/g, '');
  assert.ok(draft && secret);
  const code = totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));
  const without = await http.post(owner, '/app/sigurnost/2fa', { draft, code, password: 'грешна' });
  assert.match(without.headers.get('location') ?? '', /err=current/);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: company.userId } });
  assert.equal(user.totpEnabledAt, null);
});

test('F5: действащо пълномощно не се пренаписва от нова заявка на кантората', async () => {
  const client = await firmClient('200000027');
  await prisma.clientMandate.update({
    where: { id: client.mandateId },
    data: { status: 'ACTIVE' },
  });
  const accountant = await http.login('firm@example.test', PASSWORD);
  const res = await http.post(accountant, `/app/o/${firm.organizationId}/klienti/nov`, {
    legalName: 'Клиент 200000027 ЕООД',
    eik: '200000027',
    addressStreet: 'ул. „Самуил“ 3',
    addressCity: 'Перник',
    postalCode: '2300',
    documentRef: 'Подменено пълномощно',
    validFrom: '2020-01-01',
    processorDeclaration: 'on',
  });
  assert.ok(res.status === 303 || res.status === 200, `статус ${res.status}`);
  const mandate = await prisma.clientMandate.findUniqueOrThrow({ where: { id: client.mandateId } });
  assert.equal(mandate.status, 'ACTIVE');
  assert.equal(mandate.documentRef, 'Пълномощно № 1');
});
