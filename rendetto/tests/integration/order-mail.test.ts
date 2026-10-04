import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { forgetMailTo, mailTo, prisma, STAFF_INBOX, startApp, stopApp } from './harness.js';
import { placeOrder, sessionCsrf, staff, withdraw } from './people.js';

before(startApp);
after(stopApp);

const { changePlan } = await import('../../src/services/admin-plan.js');
const { resendOrderMail } = await import('../../src/services/plan-requests.js');
const { LEGAL_UPDATED } = await import('../../src/company.js');

test('a new order replaces the open one: the customer and the team are told which, with the terms attached', async () => {
  const email = 'replace@example.test';
  const { c, row: first } = await placeOrder(email, { option: 'm1', buyer: 'consumer' });
  forgetMailTo(email);
  const second = await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    option: 'm3',
    buyer: 'consumer',
  });
  assert.equal(second.status, 302);
  const orders = await prisma.upgradeRequest.findMany({
    where: { user: { email } },
    orderBy: { createdAt: 'asc' },
  });
  assert.deepEqual(
    orders.map((o) => [o.id === first.id, o.status]),
    [
      [true, 'CANCELLED'],
      [false, 'OPEN'],
    ],
  );
  const confirmation = await mailTo(email, /Потвърждение на поръчката/);
  assert.match(confirmation.text, new RegExp(`заменя поръчка № ${first.id}, която е отменена`));
  const notice = await mailTo(STAFF_INBOX, /Нова поръчка в Rendetto: Premium за 3 месеца/);
  assert.match(notice.text, new RegExp(`Заменя поръчка № ${first.id} \\(отменена\\)`));

  // a durable medium: the accepted terms come as a file, not only as a link to the live page
  const [terms, ...others] = confirmation.attachments ?? [];
  assert.equal(others.length, 0);
  assert.ok(terms, 'the terms are attached');
  assert.equal(terms.filename, `rendetto-terms-${LEGAL_UPDATED.terms}-bg.html`);
  assert.match(terms.contentType, /^text\/html/);
  assert.match(terms.content, /<!doctype html>[\s\S]*Карбон Стелт ЕДПК/i);
});

test('a receipt that did not go out is resent with the outcome stored at the withdrawal', async () => {
  const { actor } = await staff('MANAGER', 'mail.manager@example.test');
  const email = 'resend-manual@example.test';
  const { c, row } = await placeOrder(email, { option: 'm1', buyer: 'consumer' });
  // the team changes the plan by hand while the order is still open: the withdrawal is theirs to settle
  assert.deepEqual(await changePlan(actor, row.userId, { plan: 'TRIAL', days: 5, notify: false }), {
    ok: true,
  });
  assert.equal((await withdraw(c, row.id)).status, 302);
  const stored = await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(stored.withdrawalOutcome, 'manual');
  const notice = await mailTo(STAFF_INBOX, /Отказ от договора в Rendetto: resend-manual@/);
  assert.match(notice.text, /Планът НЕ е върнат автоматично/);

  // SMTP refused the receipt: nothing marked as sent, and the withdrawal is older than 10 minutes
  await prisma.upgradeRequest.update({
    where: { id: row.id },
    data: { withdrawalAckSentAt: null, withdrawnAt: new Date(Date.now() - 11 * 60_000) },
  });
  forgetMailTo(email);
  assert.ok((await resendOrderMail()) >= 1);
  const receipt = await mailTo(email, /Получихме отказа ви/);
  assert.match(receipt.text, /Ще прекратим плана, който получихте с тази поръчка\./);
  assert.doesNotMatch(
    receipt.text,
    /Поръчката е прекратена\./,
    'not re-derived as never activated',
  );
  assert.ok(
    (await prisma.upgradeRequest.findUniqueOrThrow({ where: { id: row.id } })).withdrawalAckSentAt,
  );

  const requests = await (
    await staff('MANAGER', 'mail.manager2@example.test')
  ).browser.get('/admin/requests?status=all');
  const line = new RegExp(`${email}[\\s\\S]*?</tr>`).exec(requests.body)?.[0] ?? '';
  assert.match(line, /Планът не е върнат автоматично — проверете го\./);
});
