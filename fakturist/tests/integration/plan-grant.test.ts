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
const { generateTotpSecret, totpCodeAt, totpStep } = await import('../../src/auth/totp.js');
const { encryptTotpSecret } = await import('../../src/auth/keys.js');
const { hashPassword } = await import('../../src/auth/password.js');
const { grantPlan, endGrant, GrantError, addMonthsUtc } =
  await import('../../src/billing/grant.js');
const { orgHasFeature, planLimits } = await import('../../src/billing/entitlements.js');
const { currentCredit } = await import('../../src/billing/proration.js');
const { expireSubscriptions } = await import('../../src/billing/expiry.js');

/**
 * SPEC 71–72: мастърът дава план на фирма ръчно — без плащане и фактура, със срок или безсрочно;
 * функциите и таваните идват от плана; няма прихващане; изтича или се прекратява към началния план.
 */
const PASSWORD = 'дълга-и-трудна-парола-2026';
const DAY = 24 * 60 * 60 * 1000;
let http: HttpClient;
let master: Session;
let owner: Session;
let masterId = '';
let masterSecret = '';
let companyId = '';
let firmId = '';

const base = {
  password: PASSWORD,
  acceptTerms: 'on' as const,
  addressStreet: 'ул. „Раковски“ 2',
  addressCity: 'Перник',
  postalCode: '2300',
};

/** Мастър с 2FA: паролата → кодът → нова сесия; CSRF токенът — от страница на панела. */
async function masterSession(): Promise<Session> {
  await prisma.user.update({ where: { id: masterId }, data: { totpLastStep: null } });
  const first = await http.post(null, '/vhod', { email: 'admin@example.test', password: PASSWORD });
  assert.equal(first.status, 303);
  const cookie = first.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const form = await (await fetch(`${http.origin}/vhod/kod`, { headers: { cookie } })).text();
  const csrf = /name="_csrf" value="([^"]+)"/.exec(form)?.[1] ?? '';
  const verified = await http.post({ cookie, csrf }, '/vhod/kod', {
    code: totpCodeAt(masterSecret, totpStep(Math.floor(Date.now() / 1000))),
  });
  assert.equal(verified.status, 303);
  const fresh = verified.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .filter((c) => c.startsWith('fakturist_sid='))
    .join('; ');
  const page = await (await http.get({ cookie: fresh, csrf: '' }, '/admin')).text();
  const token = /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? '';
  assert.ok(token, 'CSRF токен в панела');
  return { cookie: fresh, csrf: token };
}

const active = (organizationId: string) =>
  prisma.subscription.findFirstOrThrow({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });

before(async () => {
  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  masterSecret = generateTotpSecret();
  masterId = (
    await prisma.user.create({
      data: {
        email: 'admin@example.test',
        name: 'Собственик',
        passwordHash: await hashPassword(PASSWORD),
        platformRole: 'MASTER',
      },
    })
  ).id;
  await prisma.user.update({
    where: { id: masterId },
    data: { totpSecretEnc: encryptTotpSecret(masterSecret, masterId), totpEnabledAt: new Date() },
  });
  companyId = (
    await register({
      ...base,
      kind: 'company',
      name: 'Иван Петров',
      email: 'owner@example.test',
      legalName: 'Пекарна Зора ЕООД',
      eik: '131063188',
      vatNumber: 'BG131063188',
    })
  ).organizationId;
  firmId = (
    await register({
      ...base,
      kind: 'accountant',
      name: 'Мария Колева',
      email: 'firm@example.test',
      legalName: 'Счетоводна кантора Баланс ООД',
      eik: '121604974',
    })
  ).organizationId;
  http = await startHttp(createServer);
  master = await masterSession();
  owner = await http.login('owner@example.test', PASSWORD);
});

after(async () => {
  await http.close();
  await prisma.$disconnect();
});

test('мастърът дава „Бизнес“ за 3 месеца от картата на фирмата: без плащане и фактура, с одит', async () => {
  const card = await (await http.get(master, `/admin/r/organizations/${companyId}`)).text();
  assert.match(card, new RegExp(`action="/admin/firmi/${companyId}/plan"`));
  const before = await active(companyId);
  assert.equal(before.planCode, 'free');

  const res = await http.post(master, `/admin/firmi/${companyId}/plan`, {
    planCode: 'business',
    months: '3',
    note: 'Партньор — пробен период',
  });
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /plan=ok/);

  const now = await active(companyId);
  assert.equal(now.planCode, 'business');
  assert.equal(now.granted, true);
  assert.equal(now.grantedById, masterId);
  assert.equal(now.grantNote, 'Партньор — пробен период');
  assert.equal(
    now.currentPeriodEnd.toISOString().slice(0, 10),
    addMonthsUtc(now.currentPeriodStart, 3).toISOString().slice(0, 10),
  );
  assert.equal(
    (await prisma.subscription.findUniqueOrThrow({ where: { id: before.id } })).status,
    'CANCELLED',
  );
  assert.equal(await prisma.payment.count({ where: { organizationId: companyId } }), 0);
  assert.equal(await prisma.document.count({ where: { typeCode: '380' } }), 0, 'без фактура');
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'billing.subscription.granted', organizationId: companyId },
  });
  assert.equal(log.actorId, masterId);
  assert.deepEqual(log.details, {
    planCode: 'business',
    months: 3,
    previousPlanCode: 'free',
    replacedPaid: false,
    note: 'Партньор — пробен период',
  });

  // Функциите на плана: SAF-T е в „Бизнес“, не в безплатния.
  assert.equal(await orgHasFeature(companyId, 'saf-t'), true);
  // Няма прихващане при следваща поръчка — кредитът е само от плащане.
  assert.equal(await currentCredit(companyId, 'pro', 'MONTH'), null);
  // „План“ на фирмата казва, че е даден и до кога.
  const plan = await (await http.get(owner, `/app/o/${companyId}/plan`)).text();
  const until = now.currentPeriodEnd.toISOString().slice(0, 10).split('-').reverse().join('.');
  assert.match(plan, new RegExp(`даден до ${until.replace(/\./g, '\\.')}`));
});

test('само мастър: собственикът на фирмата не може да си даде план', async () => {
  const res = await http.post(owner, `/admin/firmi/${companyId}/plan`, {
    planCode: 'business',
    months: '120',
    note: 'Сам си давам',
  });
  assert.equal(res.status, 404);
  assert.equal((await active(companyId)).grantNote, 'Партньор — пробен период');
});

test('откази: план от друг вид, непознат план, грешен срок, без причина, прекратена фирма', async () => {
  const run = (input: Partial<Parameters<typeof grantPlan>[0]>) =>
    grantPlan({
      organizationId: companyId,
      actorId: masterId,
      planCode: 'pro',
      months: 1,
      note: 'Проба',
      replacePaid: false,
      ...input,
    });
  const code = (expected: string) => (error: unknown) =>
    error instanceof GrantError && error.code === expected;
  await assert.rejects(run({ planCode: 'firm' }), code('audience'));
  await assert.rejects(run({ planCode: 'nyama' }), code('plan'));
  await assert.rejects(run({ organizationId: 'clxxxxxxxxxxxxxxxxxxxxxxx' }), code('notFound'));

  const back = `/admin/r/organizations/${companyId}`;
  for (const [fields, error] of [
    [{ planCode: 'pro', months: '0', note: 'Проба' }, 'months'],
    [{ planCode: 'pro', months: '1', note: '' }, 'note'],
    [{ planCode: 'firm', months: '1', note: 'Проба' }, 'audience'],
  ] as const) {
    const res = await http.post(master, `/admin/firmi/${companyId}/plan`, fields);
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), `${back}?greshka=grant.${error}`);
  }
  assert.equal((await active(companyId)).planCode, 'business', 'нищо не е сменено');

  await prisma.organization.update({
    where: { id: companyId },
    data: { terminatedAt: new Date(), purgeAfter: new Date(Date.now() + 30 * DAY) },
  });
  await assert.rejects(run({}), code('terminated'));
  await prisma.organization.update({
    where: { id: companyId },
    data: { terminatedAt: null, purgeAfter: null },
  });
});

test('действащ платен период се заменя само с изрична отметка', async () => {
  const paidSub = await prisma.$transaction(async (tx) => {
    await tx.subscription.updateMany({
      where: { organizationId: companyId, status: 'ACTIVE' },
      data: { status: 'CANCELLED' },
    });
    const sub = await tx.subscription.create({
      data: {
        organizationId: companyId,
        planCode: 'pro',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 20 * DAY),
        provider: 'REVOLUT',
      },
    });
    await tx.payment.create({
      data: {
        organizationId: companyId,
        subscriptionId: sub.id,
        amountCents: 1188,
        netCents: 990,
        provider: 'REVOLUT',
        status: 'COMPLETED',
        planCode: 'pro',
        interval: 'MONTH',
        paidAt: new Date(),
      },
    });
    return sub;
  });
  await assert.rejects(
    grantPlan({
      organizationId: companyId,
      actorId: masterId,
      planCode: 'business',
      months: 'forever',
      note: 'Подарък',
      replacePaid: false,
    }),
    (error: unknown) => error instanceof GrantError && error.code === 'paidActive',
  );
  assert.equal((await active(companyId)).id, paidSub.id);
  await grantPlan({
    organizationId: companyId,
    actorId: masterId,
    planCode: 'business',
    months: 'forever',
    note: 'Подарък',
    replacePaid: true,
  });
  const now = await active(companyId);
  assert.equal(now.planCode, 'business');
  assert.equal(now.granted, true);
  const log = await prisma.auditLog.findFirstOrThrow({
    where: { action: 'billing.subscription.granted', organizationId: companyId },
    orderBy: { at: 'desc' },
  });
  assert.equal((log.details as { replacedPaid: boolean }).replacedPaid, true);
});

test('кантора: даденият план се брои като платен — без таван на фирмите-клиенти', async () => {
  assert.equal((await planLimits(prisma, firmId)).paid, false);
  await grantPlan({
    organizationId: firmId,
    actorId: masterId,
    planCode: 'firm',
    months: 12,
    note: 'Партньорска кантора',
    replacePaid: false,
  });
  const limits = await planLimits(prisma, firmId);
  assert.equal(limits.paid, true);
});

test('изтича като платен — към началния план; безсрочният е за 100 години', async () => {
  const granted = await active(firmId);
  assert.equal(await expireSubscriptions(new Date(granted.currentPeriodEnd.getTime() + DAY)), 1);
  assert.equal(
    (await prisma.subscription.findUniqueOrThrow({ where: { id: granted.id } })).status,
    'PAST_DUE',
  );
  const fallback = await active(firmId);
  assert.equal(fallback.planCode, 'firm');
  assert.equal(fallback.granted, false);

  await grantPlan({
    organizationId: firmId,
    actorId: masterId,
    planCode: 'firm',
    months: 'forever',
    note: 'Завинаги',
    replacePaid: false,
  });
  const forever = await active(firmId);
  assert.ok(forever.currentPeriodEnd.getUTCFullYear() >= new Date().getUTCFullYear() + 100);
});

test('мастърът прекратява дадения план → началния план; само даден се прекратява така', async () => {
  const card = await (await http.get(master, `/admin/r/organizations/${companyId}`)).text();
  assert.match(card, new RegExp(`action="/admin/firmi/${companyId}/plan/prekrati"`));
  const res = await http.post(master, `/admin/firmi/${companyId}/plan/prekrati`, {});
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location') ?? '', /plan=ended/);
  const now = await active(companyId);
  assert.equal(now.planCode, 'free');
  assert.equal(now.granted, false);
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'billing.subscription.grantEnded', organizationId: companyId },
    }),
    1,
  );
  await assert.rejects(
    endGrant({ organizationId: companyId, actorId: masterId }),
    (error: unknown) => error instanceof GrantError && error.code === 'notGranted',
  );
  const again = await http.post(master, `/admin/firmi/${companyId}/plan/prekrati`, {});
  assert.equal(
    again.headers.get('location'),
    `/admin/r/organizations/${companyId}?greshka=grant.notGranted`,
  );
});

test('едновременна замяна на абонамента (плащане/cron) → разбираем отказ „conflict“, не 500 и не deadlock', async () => {
  // Даден план, после външна транзакция като activatePayment: отменя действащия, а grantPlan започва
  // точно между отмяната и новия абонамент.
  await grantPlan({
    organizationId: companyId,
    actorId: masterId,
    planCode: 'pro',
    months: 1,
    note: 'Начало',
    replacePaid: false,
  });
  let releaseOuter!: () => void;
  const gate = new Promise<void>((resolve) => (releaseOuter = resolve));
  let cancelled!: () => void;
  const cancelledDone = new Promise<void>((resolve) => (cancelled = resolve));
  const outer = prisma.$transaction(
    async (tx) => {
      await tx.subscription.updateMany({
        where: { organizationId: companyId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      cancelled();
      await gate;
      await tx.subscription.create({
        data: {
          organizationId: companyId,
          planCode: 'business',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * DAY),
          provider: 'REVOLUT',
        },
      });
    },
    { timeout: 20_000, maxWait: 20_000 },
  );
  await cancelledDone;
  const granting = grantPlan({
    organizationId: companyId,
    actorId: masterId,
    planCode: 'business',
    months: 3,
    note: 'Едновременно',
    replacePaid: true,
  }).then(
    () => null,
    (error: unknown) => error,
  );
  await new Promise((resolve) => setTimeout(resolve, 300));
  releaseOuter();
  await outer;
  const error = await granting;
  assert.ok(error instanceof GrantError, `GrantError, не ${String(error)}`);
  assert.equal(error.code, 'conflict');
  assert.equal(
    await prisma.subscription.count({ where: { organizationId: companyId, status: 'ACTIVE' } }),
    1,
    'един действащ абонамент',
  );
  assert.equal((await active(companyId)).provider, 'REVOLUT', 'плащането не е загубено');
});

test('изтрита фирма → 404 (SPEC 71), не пренасочване', async () => {
  await prisma.organization.update({ where: { id: firmId }, data: { deletedAt: new Date() } });
  const res = await http.post(master, `/admin/firmi/${firmId}/plan`, {
    planCode: 'firm',
    months: '1',
    note: 'Изтрита',
  });
  assert.equal(res.status, 404);
  const end = await http.post(master, `/admin/firmi/${firmId}/plan/prekrati`, {});
  assert.equal(end.status, 404);
  await prisma.organization.update({ where: { id: firmId }, data: { deletedAt: null } });
});
