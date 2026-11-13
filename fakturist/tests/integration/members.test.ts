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
const { processOutbox } = await import('../../src/mail/outbox.js');
const { sha256Hex } = await import('../../src/crypto.js');
const { inviteMember, MemberError } = await import('../../src/accounts/members.js');
type Message = import('../../src/mail/mailer.js').MailMessage;

/** SPEC 45: покани за членове — роля под своята, еднократна връзка, приемане само с имейла. */
const PASSWORD = 'дълга-и-трудна-парола-2026';
let http: HttpClient;
let owner: Session;
let orgId = '';
let ownerId = '';

async function sendAll(): Promise<Message[]> {
  const sent: Message[] = [];
  await processOutbox(async (message) => {
    sent.push(message);
  });
  return sent;
}

function linkFrom(message: Message): string {
  const match = /\/chlen\/[A-Za-z0-9_-]{43}/.exec(message.text);
  assert.ok(match, 'няма връзка в писмото');
  return match[0];
}

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
    addressStreet: 'ул. „Раковски“ 2',
    addressCity: 'Перник',
    postalCode: '2300',
  });
  orgId = reg.organizationId;
  ownerId = reg.userId;
  await prisma.notification.deleteMany();
  http = await startHttp(createServer);
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('собственикът кани счетоводител; в базата е само хешът; писмото носи връзката', async () => {
  const sent = await http.post(owner, `/app/o/${orgId}/chlenove/pokani`, {
    email: 'Anna@Example.test',
    role: 'ACCOUNTANT',
  });
  assert.equal(sent.status, 303);
  assert.ok(sent.headers.get('location')?.endsWith('ok=invited'));
  const invite = await prisma.memberInvite.findFirstOrThrow({ where: { organizationId: orgId } });
  assert.equal(invite.email, 'anna@example.test');
  const mail = (await sendAll()).find((m) => m.to === 'anna@example.test');
  assert.ok(mail);
  const path = linkFrom(mail);
  assert.equal(invite.tokenHash, sha256Hex(path.slice('/chlen/'.length)));
  const log = await prisma.auditLog.findFirstOrThrow({ where: { action: 'member.invited' } });
  assert.ok(!JSON.stringify(log.details).includes('anna@'));

  // Нов профил: приема общите условия и политиката; имейлът е потвърден; членът е с ролята.
  const page = await http.get(null, path);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes('Пекарна Зора ЕООД'));
  const created = await http.post(null, path, {
    name: 'Анна Колева',
    password: 'друга-дълга-парола-2026',
    acceptTerms: 'on',
  });
  assert.equal(created.status, 303);
  const anna = await prisma.user.findUniqueOrThrow({
    where: { email: 'anna@example.test' },
    include: { memberships: true, legalAcceptances: true },
  });
  assert.ok(anna.emailVerifiedAt);
  assert.deepEqual(
    anna.memberships.map((m) => [m.organizationId, m.role]),
    [[orgId, 'ACCOUNTANT']],
  );
  assert.deepEqual(anna.legalAcceptances.map((a) => a.document).sort(), ['privacy', 'terms']);
  // Връзката е еднократна.
  assert.equal((await http.get(null, path)).status, 404);
});

test('роля само под своята: ADMIN не кани ADMIN, никой не кани OWNER', async () => {
  await assert.rejects(
    inviteMember({
      organizationId: orgId,
      actor: { userId: ownerId, role: 'ADMIN' },
      email: 'x@example.test',
      role: 'ADMIN',
    }),
    (error: unknown) => error instanceof MemberError && error.code === 'forbiddenRole',
  );
  const owners = await http.post(owner, `/app/o/${orgId}/chlenove/pokani`, {
    email: 'y@example.test',
    role: 'OWNER',
  });
  assert.ok(owners.headers.get('location')?.endsWith('err=invalid'));
  // Вече член — отказ.
  const again = await http.post(owner, `/app/o/${orgId}/chlenove/pokani`, {
    email: 'anna@example.test',
    role: 'VIEWER',
  });
  assert.ok(again.headers.get('location')?.endsWith('err=alreadyMember'));
});

test('нова покана за същия имейл отменя старата; отменената не важи', async () => {
  await http.post(owner, `/app/o/${orgId}/chlenove/pokani`, {
    email: 'petar@example.test',
    role: 'VIEWER',
  });
  await http.post(owner, `/app/o/${orgId}/chlenove/pokani`, {
    email: 'petar@example.test',
    role: 'ISSUER',
  });
  const invites = await prisma.memberInvite.findMany({
    where: { email: 'petar@example.test' },
    orderBy: { createdAt: 'asc' },
  });
  assert.equal(invites.length, 2);
  assert.ok(invites[0]!.revokedAt);
  assert.equal(invites[1]!.revokedAt, null);
  const mails = (await sendAll()).filter((m) => m.to === 'petar@example.test');
  // Писмото на отменената покана не тръгва (опашката го отбелязва като неуспешно), новото — да.
  assert.equal(mails.length, 1);
  assert.ok(mails[0]!.text.includes('издава документи'));
});

test('смяна на роля и махане; членът не вижда фирмата след махането', async () => {
  const anna = await prisma.membership.findFirstOrThrow({
    where: { organizationId: orgId, role: 'ACCOUNTANT' },
  });
  const changed = await http.post(owner, `/app/o/${orgId}/chlenove/${anna.id}/rolya`, {
    role: 'VIEWER',
  });
  assert.ok(changed.headers.get('location')?.endsWith('ok=roleChanged'));
  assert.equal(
    (await prisma.membership.findUniqueOrThrow({ where: { id: anna.id } })).role,
    'VIEWER',
  );
  const annaSession = await http.login('anna@example.test', 'друга-дълга-парола-2026');
  assert.equal((await http.get(annaSession, `/app/o/${orgId}`)).status, 200);
  // Наблюдателят не управлява членове.
  assert.equal((await http.get(annaSession, `/app/o/${orgId}/chlenove`)).status, 404);
  const removed = await http.post(owner, `/app/o/${orgId}/chlenove/${anna.id}/mahni`, {});
  assert.ok(removed.headers.get('location')?.endsWith('ok=removed'));
  assert.equal((await http.get(annaSession, `/app/o/${orgId}`)).status, 404);
  // Собственикът не маха себе си.
  const self = await prisma.membership.findFirstOrThrow({
    where: { organizationId: orgId, role: 'OWNER' },
  });
  const leave = await http.post(owner, `/app/o/${orgId}/chlenove/${self.id}/mahni`, {});
  assert.ok(leave.headers.get('location')?.endsWith('err=forbiddenRole'));
});
