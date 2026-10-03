import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  customer,
  mailTo,
  placeOrder,
  prisma,
  sessionCsrf,
  staff,
  startApp,
  stopApp,
} from './harness.js';

before(startApp);
after(stopApp);

const { changePlan } = await import('../../src/services/admin-plan.js');
const { LEGAL_UPDATED } = await import('../../src/company.js');
const { resendOrderMail } = await import('../../src/services/plan-requests.js');
const { exportOwnData } = await import('../../src/services/account-self.js');
const STAFF_INBOX = 'info@carbonstealth.eu';
const DAY = 86_400_000;

test('the order form says it is an order with an obligation to pay; the early-start box is not ticked', async () => {
  const c = await customer('form@example.test');
  const page = await c.get('/account/plan');
  assert.match(
    page.body,
    /<button class="btn btn-primary" type="submit">Поръчка със задължение за плащане<\/button>/,
  );
  assert.match(page.body, /name="buyer" value="consumer" checked required/);
  assert.match(page.body, /<input type="checkbox" name="early" value="yes">/);
  assert.match(page.body, /href="\/terms#withdrawal"/);
  // за потребители първа е крайната цена: 12 месеца = 240 € + 20 % ДДС
  assert.match(page.body, /<td class="num"><b>288\s€<\/b><\/td>/);
});

test('an order without the buyer type is refused; one from a business carries no withdrawal', async () => {
  const c = await customer('nobuyer@example.test');
  await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    option: 'm1',
  });
  assert.equal(
    await prisma.upgradeRequest.count({ where: { user: { email: 'nobuyer@example.test' } } }),
    0,
  );
  const { c: firm, row } = await placeOrder('firm@example.test', {
    option: 'm3',
    buyer: 'business',
    early: 'yes',
  });
  assert.equal(row.buyerType, 'BUSINESS');
  assert.equal(row.earlyStartRequestedAt, null, 'early start is a consumer request only');
  const mail = await mailTo('firm@example.test', /Потвърждение на поръчката/);
  assert.match(mail.text, /правото на отказ на потребителите не се прилага/);
  assert.doesNotMatch(mail.text, /Стандартен формуляр за отказ/);
  const page = await firm.get('/account/plan');
  assert.doesNotMatch(page.body, /Откажете се от договора тук<\/a>/);
  const refused = await firm.get(`/account/plan/withdraw/${row.id}`);
  assert.equal(refused.status, 302);
});

test('a consumer order is confirmed on a durable medium with the model form; activation waits for the period', async () => {
  const manager = await staff('MANAGER', 'orders.manager@example.test');
  const { row } = await placeOrder('consumer@example.test', { option: 'm12', buyer: 'consumer' });
  assert.equal(row.termsVersion, LEGAL_UPDATED.terms);
  const mail = await mailTo('consumer@example.test', /Потвърждение на поръчката/);
  assert.match(
    mail.text,
    /Договорът е сключен на \d+ \S+ \d{4} г\. в \d{1,2}:\d{2} \(UTC\+0[23]:00\)/,
  );
  assert.match(mail.text, /288\s€ с ДДС 20\s% \(240\s€ без ДДС\)/);
  assert.match(mail.text, /Стандартен формуляр за отказ/);
  assert.match(mail.text, /— До Карбон Стелт ЕДПК \(Carbon Stealth VCC\), ул\. „Самуил“ № 3/);
  assert.match(mail.text, /Ненужното се зачертава\./);
  assert.match(mail.text, /Не поискахте ранно начало/);
  // търговецът — с правната форма и телефона (чл. 6, пар. 1, б. „в“ от Директива 2011/83)
  assert.match(
    mail.text,
    /Търговец: Карбон Стелт ЕДПК \(Carbon Stealth VCC\), еднолично дружество с променлив капитал, ЕИК 208725180, ул\. „Самуил“ № 3, 2670 Бобов дол, обл\. Кюстендил, България, тел\. \+359 877 414 874, info@carbonstealth\.eu\./,
  );
  assert.match(mail.text, /\(в сила от \d+ \S+ \d{4} г\.\): http:\/\/127\.0\.0\.1:\d+\/terms\n/);
  assert.ok(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).confirmationSentAt,
  );
  await mailTo(STAFF_INBOX, /Нова поръчка в Rendetto/);

  const csrf = await sessionCsrf(
    manager.browser,
    `/admin/accounts/${row.userId}?request=${row.id}`,
  );
  // тестът свършва след 2 дни — платеното би започнало в срока за отказ
  await prisma.user.update({
    where: { id: row.userId },
    data: { planExpiresAt: new Date(Date.now() + 2 * DAY) },
  });
  const early = await manager.browser.post(`/admin/accounts/${row.userId}/plan`, {
    _csrf: csrf,
    plan: 'PREMIUM',
    mode: 'months',
    months: '12',
    requestId: row.id,
  });
  assert.equal(early.status, 302);
  const still = await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(still.status, 'OPEN', 'not activated inside the withdrawal period');
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: row.userId } })).plan, 'TRIAL');

  const actor = {
    type: 'HUMAN' as const,
    id: manager.id,
    label: 'Екип MANAGER',
    role: 'MANAGER' as const,
  };
  const after = new Date(row.createdAt.getTime() + 25 * DAY);
  assert.deepEqual(
    await changePlan(
      actor,
      row.userId,
      { plan: 'LIFETIME', notify: false, requestId: row.id },
      after,
    ),
    { ok: false, key: 'admin.errors.orderMismatch' },
    'a 12-month order is not fulfilled with Lifetime',
  );
  const later = await changePlan(
    actor,
    row.userId,
    { plan: 'PREMIUM', mode: 'months', months: 12, notify: false, requestId: row.id },
    after,
  );
  assert.deepEqual(later, { ok: true });
  const change = await prisma.planChange.findFirstOrThrow({ where: { requestId: row.id } });
  assert.deepEqual([change.toPlan, change.months], ['PREMIUM', 12]);
});

test('a confirmation that did not go out is sent again by maintenance', async () => {
  const { row } = await placeOrder('retry@example.test', { option: 'm1', buyer: 'consumer' });
  await prisma.upgradeRequest.update({
    where: { id: row.id },
    data: { confirmationSentAt: null, createdAt: new Date(Date.now() - 60 * 60_000) },
  });
  const sent = await resendOrderMail();
  assert.ok(sent >= 1);
  assert.ok(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).confirmationSentAt,
  );
});

test('the data export holds the orders with their message and the audit entries about the person', async () => {
  const { row } = await placeOrder('export@example.test', {
    option: 'm1',
    buyer: 'business',
    message: 'Фирма ЕООД, ЕИК 000000000',
  });
  const data = (await exportOwnData(row.userId)) as {
    orders: Array<{ message: string | null; buyer: string }>;
    auditLog: Array<{ action: string; by: string }>;
  };
  assert.equal(data.orders[0]?.message, 'Фирма ЕООД, ЕИК 000000000');
  assert.equal(data.orders[0]?.buyer, 'BUSINESS');
  assert.ok(data.auditLog.some((a) => a.action === 'plan.request.created' && a.by === 'you'));
});

test('an account with an unconfirmed email cannot order: the contract goes by email', async () => {
  const c = await customer('unconfirmed@example.test');
  await prisma.user.update({
    where: { email: 'unconfirmed@example.test' },
    data: { emailVerifiedAt: null },
  });
  const page = await c.get('/account/plan');
  assert.doesNotMatch(page.body, /Поръчка със задължение за плащане/);
  await c.post('/account/plan/request', {
    _csrf: Browser.csrf(page.body),
    option: 'm1',
    buyer: 'consumer',
  });
  assert.equal(
    await prisma.upgradeRequest.count({ where: { user: { email: 'unconfirmed@example.test' } } }),
    0,
  );
});

test('a team member’s export keeps their actions on other accounts, without the other person’s details', async () => {
  const support = await staff('SUPPORT', 'support.export@example.test');
  await customer('banned.export@example.test');
  const victim = await prisma.user.findUniqueOrThrow({
    where: { email: 'banned.export@example.test' },
  });
  const { banAccount } = await import('../../src/services/admin-security.js');
  const actor = {
    type: 'HUMAN' as const,
    id: support.id,
    label: 'Екип SUPPORT',
    role: 'SUPPORT' as const,
  };
  assert.deepEqual(
    await banAccount(actor, victim.id, { reason: 'Споделен акаунт с друга фирма' }),
    {
      ok: true,
    },
  );
  const data = (await exportOwnData(support.id)) as {
    auditLog: Array<{ action: string; detail: unknown; target: unknown }>;
  };
  const ban = data.auditLog.find((a) => a.action === 'admin.account.banned');
  assert.ok(ban, 'the action itself is listed');
  assert.deepEqual([ban.detail, ban.target], [null, null]);
});
