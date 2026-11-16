import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { prepareTestDatabase, truncateAll } from './harness.js';

prepareTestDatabase();
delete process.env['SMTP_HOST'];
const { prisma } = await import('../../src/db.js');
const { register } = await import('../../src/accounts/register.js');
const { seedPlans } = await import('../../src/billing/seed-plans.js');
const tokens = await import('../../src/accounts/tokens.js');
const { createTransferInvite, acceptTransferInvite } =
  await import('../../src/accounts/transfer.js');
const { processOutbox } = await import('../../src/mail/outbox.js');
const { verifyPassword } = await import('../../src/auth/password.js');
const { sha256Hex } = await import('../../src/crypto.js');
const { LEGAL_DOCUMENTS } = await import('../../src/legal/documents.js');
const { HOUR, DAY, MINUTE } = await import('../../src/time.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

/**
 * SPEC 35–38: приетите правни документи, „Забравена парола“ и потвърждението на имейла.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let userId = '';
let organizationId = '';
let masterId = '';

async function sendAll(): Promise<Message[]> {
  const sent: Message[] = [];
  await processOutbox(async (message) => {
    sent.push(message);
  });
  return sent;
}

/** Токенът от връзката в писмото (`/nova-parola/<токен>` или `/potvardi-imeyl/<токен>`). */
function tokenFrom(message: Message, path: string): string {
  const match = new RegExp(`${path}/([A-Za-z0-9_-]{43})`).exec(message.text);
  assert.ok(match, `няма връзка ${path} в писмото`);
  return match[1]!;
}

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterId = (
    await prisma.user.create({
      data: {
        email: 'master@example.test',
        name: 'Мастър',
        passwordHash: 'x',
        platformRole: 'MASTER',
      },
    })
  ).id;
  ({ userId, organizationId } = await register({
    kind: 'company',
    name: 'Иван Петров',
    email: 'ivan@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пекарна Зора ЕООД',
    eik: '131063188',
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  }));
});

after(async () => {
  await prisma.$disconnect();
});

test('регистрацията записва приетите документи с версиите им', async () => {
  const rows = await prisma.legalAcceptance.findMany({
    where: { userId },
    orderBy: { document: 'asc' },
  });
  assert.deepEqual(
    rows.map((row) => [row.document, row.version, row.organizationId]),
    [
      ['dpa', LEGAL_DOCUMENTS.dpa.version, organizationId],
      ['privacy', LEGAL_DOCUMENTS.privacy.version, organizationId],
      ['terms', LEGAL_DOCUMENTS.terms.version, organizationId],
    ],
  );
});

test('потвърждение на имейла: писмо при регистрация; повторното отваряне не променя нищо', async () => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.equal(user.emailVerifiedAt, null);
  const stored = await prisma.userToken.findFirstOrThrow({
    where: { userId, purpose: 'EMAIL_VERIFY' },
  });
  const mail = (await sendAll()).find((m) => m.to === 'ivan@example.test');
  assert.ok(mail, 'писмо за потвърждение');
  const token = tokenFrom(mail, '/potvardi-imeyl');
  // В базата е само хешът — не и самият токен.
  assert.equal(stored.tokenHash, sha256Hex(token));
  assert.notEqual(stored.tokenHash, token);
  assert.ok(stored.expiresAt.getTime() - stored.createdAt.getTime() <= 7 * DAY);

  assert.deepEqual(await tokens.verifyEmail(token), { userId });
  const verified = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(verified.emailVerifiedAt);
  // Повторно отваряне (скенерът на пощата е бил пръв) — пак „потвърден“, без нов запис.
  const audits = await prisma.auditLog.count({ where: { action: 'auth.email.verified' } });
  assert.deepEqual(await tokens.verifyEmail(token), { userId });
  assert.equal(await prisma.auditLog.count({ where: { action: 'auth.email.verified' } }), audits);
  await assert.rejects(tokens.verifyEmail('не-е-токен'), isCode('invalid'));
  // Вече потвърден имейл — ново писмо не се праща.
  assert.equal(await tokens.requestEmailVerification(userId), 'already');
});

const isCode = (code: string) => (error: unknown) =>
  error instanceof tokens.AccountTokenError && error.code === code;

test('изтекла връзка за потвърждение не важи; „Изпрати отново“ — до 3 на час', async () => {
  const other = await register({
    kind: 'company',
    name: 'Мария Георгиева',
    email: 'maria@example.test',
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: 'Пивоварна Хмел ООД',
    eik: '200000015',
    addressStreet: 'ул. „Шипка“ 9',
    addressCity: 'София',
    postalCode: '1000',
  });
  const first = (await sendAll()).find((m) => m.to === 'maria@example.test');
  assert.ok(first);
  const later = new Date(Date.now() + 8 * DAY);
  await assert.rejects(
    tokens.verifyEmail(tokenFrom(first, '/potvardi-imeyl'), later),
    isCode('invalid'),
  );
  // Писмото от регистрацията + две повторни = 3 за час; четвъртото чака.
  assert.equal(await tokens.requestEmailVerification(other.userId), 'queued');
  assert.equal(await tokens.requestEmailVerification(other.userId), 'queued');
  assert.equal(await tokens.requestEmailVerification(other.userId), 'rateLimited');
  // Връзка за стар имейл (профилът е сменил адреса си) не потвърждава новия.
  const last = (await sendAll()).filter((m) => m.to === 'maria@example.test').at(-1);
  assert.ok(last);
  await prisma.user.update({ where: { id: other.userId }, data: { email: 'maria2@example.test' } });
  await assert.rejects(tokens.verifyEmail(tokenFrom(last, '/potvardi-imeyl')), isCode('invalid'));
});

test('„Забравена парола“: непознат и спрян имейл не получават нищо', async () => {
  assert.equal(await tokens.requestPasswordReset('nobody@example.test'), 'ignored');
  const disabled = await prisma.user.create({
    data: {
      email: 'gone@example.test',
      name: 'Спрян',
      passwordHash: 'x',
      disabledAt: new Date(),
    },
  });
  assert.equal(await tokens.requestPasswordReset('GONE@example.test'), 'ignored');
  assert.equal(
    await prisma.notification.count({
      where: { toEmail: { in: ['nobody@example.test', disabled.email] } },
    }),
    0,
  );
});

test('нова парола: една връзка важи, старата не; слаба парола не я изгаря; сесиите падат', async () => {
  assert.equal(await tokens.requestPasswordReset(' Ivan@Example.test '), 'queued');
  const firstMail = (await sendAll()).find((m) => m.to === 'ivan@example.test');
  assert.ok(firstMail);
  const oldToken = tokenFrom(firstMail, '/nova-parola');
  assert.equal(await tokens.requestPasswordReset('ivan@example.test'), 'queued');
  const secondMail = (await sendAll()).find((m) => m.to === 'ivan@example.test');
  assert.ok(secondMail);
  const token = tokenFrom(secondMail, '/nova-parola');
  const row = await prisma.userToken.findUniqueOrThrow({ where: { tokenHash: sha256Hex(token) } });
  assert.ok(row.expiresAt.getTime() - row.createdAt.getTime() <= HOUR);

  // Новата връзка отменя старата.
  assert.equal(await tokens.findPasswordReset(oldToken), null);
  await assert.rejects(
    tokens.resetPassword({ token: oldToken, password: 'съвсем-нова-парола-2026' }),
    isCode('invalid'),
  );
  assert.ok(await tokens.findPasswordReset(token));

  // Слаба парола — грешка, връзката остава.
  await assert.rejects(
    tokens.resetPassword({ token, password: 'късa' }),
    (error: unknown) =>
      error instanceof tokens.AccountTokenError && error.code === 'password.tooShort',
  );
  assert.ok(await tokens.findPasswordReset(token));

  await prisma.session.create({
    data: { userId, csrfToken: 'x', verified: true, expiresAt: new Date(Date.now() + DAY) },
  });
  await tokens.resetPassword({ token, password: 'съвсем-нова-парола-2026' });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  assert.ok(await verifyPassword('съвсем-нова-парола-2026', user.passwordHash));
  assert.equal(await prisma.session.count({ where: { userId } }), 0);
  assert.equal(await tokens.findPasswordReset(token), null);
  await assert.rejects(
    tokens.resetPassword({ token, password: 'още-една-нова-парола-26' }),
    isCode('invalid'),
  );
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'auth.password.reset', targetId: userId },
  });
  const serialized = JSON.stringify(log, (_key, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  assert.ok(!serialized.includes('ivan@example.test'));
});

test('нова връзка за парола отменя и писмото на старата, ако още чака в опашката', async () => {
  const other = await prisma.user.create({
    data: { email: 'queue@example.test', name: 'Опашка', passwordHash: 'x' },
  });
  assert.equal(await tokens.requestPasswordReset('queue@example.test'), 'queued');
  assert.equal(await tokens.requestPasswordReset('queue@example.test'), 'queued');
  const mails = await prisma.notification.findMany({
    where: { toEmail: 'queue@example.test', kind: 'account.passwordReset' },
    orderBy: { createdAt: 'asc' },
  });
  assert.deepEqual(
    mails.map((m) => m.status),
    ['FAILED', 'PENDING'],
  );
  assert.equal(mails[0]!.lastError, 'Заменена с нова връзка.');
  const sent = (await sendAll()).filter((m) => m.to === other.email);
  assert.equal(sent.length, 1, 'тръгва само новата връзка');
});

test('изтекла връзка за нова парола не важи; до 3 писма на час', async () => {
  const later = new Date(Date.now() + HOUR + MINUTE);
  assert.equal(await tokens.requestPasswordReset('ivan@example.test'), 'queued');
  const mail = (await sendAll()).find((m) => m.to === 'ivan@example.test');
  assert.ok(mail);
  const token = tokenFrom(mail, '/nova-parola');
  assert.equal(await tokens.findPasswordReset(token, later), null);
  await assert.rejects(
    tokens.resetPassword({ token, password: 'съвсем-нова-парола-2027', now: later }),
    isCode('invalid'),
  );
  // Три в последния час (две от предишния тест + това) — четвъртото не тръгва.
  assert.equal(await tokens.requestPasswordReset('ivan@example.test'), 'rateLimited');
});

test('нов собственик по покана: имейлът е потвърден, условията — записани', async () => {
  const org = await prisma.organization.create({
    data: {
      kind: 'COMPANY',
      legalName: 'Без Собственик ЕООД',
      eik: '200000027',
      addressStreet: 'ул. „Шипка“ 4',
      addressCity: 'София',
      postalCode: '1000',
    },
  });
  const invite = await createTransferInvite({
    organizationId: org.id,
    email: 'owner@example.test',
    actorId: masterId,
  });
  const accepted = await acceptTransferInvite({
    token: invite.token,
    user: { name: 'Нов Собственик', password: 'истинската-парола-2026' },
  });
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: accepted.userId } });
  assert.ok(owner.emailVerifiedAt);
  const docs = await prisma.legalAcceptance.findMany({
    where: { userId: accepted.userId },
    select: { document: true, organizationId: true },
    orderBy: { document: 'asc' },
  });
  assert.deepEqual(docs, [
    { document: 'dpa', organizationId: org.id },
    { document: 'privacy', organizationId: org.id },
    { document: 'terms', organizationId: org.id },
  ]);
});
