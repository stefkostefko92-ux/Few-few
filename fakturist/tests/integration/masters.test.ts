import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';
import { startHttp, type HttpClient } from './http.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const { createServer } = await import('../../src/server.js');
const { grantMaster, revokeMaster, MasterError } = await import('../../src/accounts/masters.js');
const { composeMasterMail } = await import('../../src/mail/master-mail.js');
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');

/**
 * Мастър ролята от панела: 2FA код на действащия, писмо до засегнатия и до другите мастъри, сесиите на
 * засегнатия — край, последният мастър не се маха, нов имейл → профил + връзка за парола.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let ownerId = '';
let ownerSecret = '';
const nowStep = () => totpStep(Math.floor(Date.now() / 1000));
before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  ownerSecret = generateTotpSecret();
  const owner = await prisma.user.create({
    data: {
      email: 'admin@example.test',
      name: 'Собственик',
      passwordHash: 'x',
      platformRole: 'MASTER',
    },
  });
  ownerId = owner.id;
  await prisma.user.update({
    where: { id: ownerId },
    data: {
      totpSecretEnc: encryptTotpSecret(ownerSecret, ownerId),
      totpEnabledAt: new Date(),
    },
  });
  await register({
    kind: 'company',
    name: 'Инфо Карбон',
    email: 'info@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    addressStreet: 'ул. 1',
    addressCity: 'София',
    postalCode: '1000',
  });
  await prisma.notification.deleteMany();
  http = await startHttp(createServer);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

/** Валиден код за текущата стъпка; стъпката се „освобождава“ преди всеки опит. */
async function code(): Promise<string> {
  await prisma.user.update({ where: { id: ownerId }, data: { totpLastStep: null } });
  return totpCodeAt(ownerSecret, nowStep());
}

test('даване на съществуващ профил: грешен код — отказ; верен — MASTER, сесиите му — край, писма', async () => {
  const info = await prisma.user.findUniqueOrThrow({ where: { email: 'info@example.test' } });
  const session = await http.login('info@example.test', PASSWORD);
  assert.ok(session);
  await assert.rejects(
    grantMaster({ actorId: ownerId, email: 'info@example.test', name: '', code: '000000' }),
    (e: unknown) => e instanceof MasterError && e.code === 'badCode',
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: info.id } })).platformRole,
    'NONE',
  );
  const result = await grantMaster({
    actorId: ownerId,
    email: ' INFO@example.test ',
    name: '',
    code: await code(),
  });
  assert.deepEqual(result, { userId: info.id, created: false });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: info.id } })).platformRole,
    'MASTER',
  );
  assert.equal(await prisma.session.count({ where: { userId: info.id } }), 0, 'влиза наново');
  const mails = await prisma.notification.findMany({ orderBy: { createdAt: 'asc' } });
  assert.deepEqual(
    mails.map((m) => [m.kind, m.toEmail]),
    [
      ['master.granted', 'info@example.test'],
      ['master.notice', 'admin@example.test'],
    ],
  );
  const granted = await composeMasterMail('master.granted', 'info@example.test', mails[0]!.payload);
  assert.match(granted.subject, /мастър роля/);
  assert.match(granted.text, /двуфакторен вход/);
  const notice = await composeMasterMail('master.notice', 'admin@example.test', mails[1]!.payload);
  assert.match(notice.text, /info@example\.test/);
  // Същият код втори път не минава (стъпката е записана).
  const reused = totpCodeAt(ownerSecret, nowStep());
  await assert.rejects(
    grantMaster({ actorId: ownerId, email: 'other@example.test', name: 'Друг', code: reused }),
    (e: unknown) => e instanceof MasterError && e.code === 'badCode',
  );
  await assert.rejects(
    grantMaster({ actorId: ownerId, email: 'info@example.test', name: '', code: await code() }),
    (e: unknown) => e instanceof MasterError && e.code === 'already',
  );
  const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'master.granted' } });
  assert.equal(audit.actorId, ownerId);
});

test('нов имейл: профил с мастър роля без използваема парола + връзка за парола; без име — отказ', async () => {
  await prisma.notification.deleteMany();
  await assert.rejects(
    grantMaster({ actorId: ownerId, email: 'new@example.test', name: '', code: await code() }),
    (e: unknown) => e instanceof MasterError && e.code === 'nameRequired',
  );
  const result = await grantMaster({
    actorId: ownerId,
    email: 'new@example.test',
    name: 'Нов Мастър',
    code: await code(),
  });
  assert.equal(result.created, true);
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'new@example.test' } });
  assert.equal(user.platformRole, 'MASTER');
  assert.equal(
    (await http.post(null, '/vhod', { email: 'new@example.test', password: PASSWORD })).status,
    400,
    'никоя парола не влиза, докато не зададе своя',
  );
  const kinds = (await prisma.notification.findMany()).map((m) => m.kind).sort();
  assert.deepEqual(kinds, [
    'account.passwordReset',
    'master.granted',
    'master.notice',
    'master.notice',
  ]);
  assert.equal(
    await prisma.userToken.count({ where: { userId: user.id, purpose: 'PASSWORD_RESET' } }),
    1,
  );
});

test('отнемане: с код; последният мастър не се маха; немастър — отказ', async () => {
  const info = await prisma.user.findUniqueOrThrow({ where: { email: 'info@example.test' } });
  const fresh = await prisma.user.findUniqueOrThrow({ where: { email: 'new@example.test' } });
  await revokeMaster({ actorId: ownerId, userId: info.id, code: await code() });
  await revokeMaster({ actorId: ownerId, userId: fresh.id, code: await code() });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: info.id } })).platformRole,
    'NONE',
  );
  await assert.rejects(
    revokeMaster({ actorId: ownerId, userId: ownerId, code: await code() }),
    (e: unknown) => e instanceof MasterError && e.code === 'lastMaster',
  );
  await assert.rejects(
    revokeMaster({ actorId: ownerId, userId: info.id, code: await code() }),
    (e: unknown) => e instanceof MasterError && e.code === 'notMaster',
  );
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).platformRole,
    'MASTER',
  );
});

test('страницата е само за мастър', async () => {
  const user = await http.login('info@example.test', PASSWORD);
  assert.equal((await http.get(user, '/admin/mastari')).status, 404);
  assert.equal(
    (
      await http.post(user, '/admin/mastari', {
        email: 'x@example.test',
        name: 'X',
        code: '123456',
      })
    ).status,
    404,
  );
  assert.equal(await prisma.user.count({ where: { email: 'x@example.test' } }), 0);
});

test('мастърът с 2FA вижда страницата: списък и формата', async () => {
  const { hashPassword } = await import('../../src/auth/password.js');
  await prisma.user.update({
    where: { id: ownerId },
    data: { passwordHash: await hashPassword(PASSWORD), totpLastStep: null },
  });
  const first = await http.post(null, '/vhod', { email: 'admin@example.test', password: PASSWORD });
  assert.equal(first.status, 303);
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const form = await (await fetch(`${http.origin}/vhod/kod`, { headers: { cookie } })).text();
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form)?.[1] ?? '';
  const verified = await http.post({ cookie, csrf }, '/vhod/kod', {
    code: totpCodeAt(ownerSecret, totpStep(Math.floor(Date.now() / 1000))),
  });
  assert.equal(verified.status, 303);
  const page = await http.get({ cookie, csrf }, '/admin/mastari');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /admin@example\.test/);
  assert.match(html, /action="\/admin\/mastari"/);
  assert.match(html, /autocomplete="one-time-code"/);
});
