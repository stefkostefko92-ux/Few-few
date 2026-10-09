import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  CUSTOMER_PASSWORD,
  mailTo,
  prisma,
  STAFF_INBOX,
  startApp,
  stopApp,
} from './harness.js';
import { customer, newProject, sessionCsrf, staff, withdraw } from './people.js';

before(startApp);
after(stopApp);

const { runMaintenance } = await import('../../src/services/maintenance.js');
const { exportOwnData } = await import('../../src/services/account-export.js');
const { ORDER_RETENTION_DAYS } = await import('../../src/retention.js');

const DAY = 86_400_000;

/** Three orders of one customer: one replaced, one withdrawn from and one still waiting for payment. */
async function customerWithOrders(email: string) {
  const c = await customer(email);
  const csrf = await sessionCsrf(c, '/account/plan');
  const place = async (form: Record<string, string>) => {
    const reply = await c.post('/account/plan/request', { _csrf: csrf, ...form });
    assert.equal(reply.status, 302);
    return prisma.upgradeRequest.findFirstOrThrow({
      where: { user: { email } },
      orderBy: { createdAt: 'desc' },
    });
  };
  const replaced = await place({ option: 'm3', buyer: 'consumer', message: 'Фирма ЕООД, ЕИК 123' });
  const withdrawn = await place({ option: 'm12', buyer: 'consumer', early: 'yes' });
  assert.equal((await withdraw(c, withdrawn.id)).status, 302);
  const open = await place({ option: 'm6', buyer: 'consumer', message: 'ЕИК 987654321' });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { c, user, ids: [replaced.id, withdrawn.id, open.id], open };
}

/** What stays of an order after the account is gone: the contract, nothing else about the person. */
async function assertContractOnly(ids: string[], name: string, email: string, openId: string) {
  const rows = await prisma.upgradeRequest.findMany({ where: { id: { in: ids } } });
  assert.equal(rows.length, ids.length, 'the orders outlive the account');
  for (const row of rows) {
    assert.equal(row.userId, null, 'no link to a deleted account');
    assert.equal(row.customerName, name, 'the name on the contract');
    assert.equal(row.customerEmail, email, 'the email the contract was confirmed to');
    assert.ok(row.accountDeletedAt, 'the retention clock starts with the deletion');
    assert.equal(row.message, null, 'the free-text message goes with the account');
    assert.ok(row.listPriceCents > 0 && row.termsVersion && row.createdAt, 'amount, terms, date');
  }
  const withdrawn = rows.find((r) => r.status === 'WITHDRAWN');
  assert.ok(
    withdrawn?.withdrawnAt && withdrawn.earlyStartRequestedAt,
    'withdrawal and early start',
  );
  const open = rows.find((r) => r.id === openId);
  assert.equal(
    open?.status,
    'CANCELLED',
    'an order waiting for payment cannot be fulfilled any more',
  );
  assert.equal(open?.handledByLabel, '@account-deleted');
}

test('deleting your own account removes the account and the projects; the orders keep only the contract', async () => {
  const email = 'keep-orders@example.test';
  const { c, user, ids, open } = await customerWithOrders(email);
  const pid = await newProject(c, 'base', 'Шкаф');
  assert.ok(await prisma.planChange.count({ where: { userId: user.id } }));

  const done = await c.post('/account/data/delete', {
    _csrf: await sessionCsrf(c, '/account/data'),
    password: CUSTOMER_PASSWORD,
    confirm: 'yes',
  });
  assert.equal(done.location, '/login');
  assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null);
  assert.equal(await prisma.project.findUnique({ where: { id: pid } }), null, 'projects are gone');
  assert.equal(
    await prisma.planChange.count({ where: { userId: user.id } }),
    0,
    'plan history too',
  );
  await assertContractOnly(ids, user.name, email, open.id);

  // the team learns about the cancelled order: a payment may already be on its way
  const notice = await mailTo(STAFF_INBOX, /изтрит акаунт/i);
  assert.match(notice.text, new RegExp(email.replace('.', '\\.')));
  // the person learns what is kept and for how long
  const bye = await mailTo(email, /изтрит/);
  assert.match(bye.text, /5 години/);
});

test('a staff deletion keeps the orders the same way', async () => {
  const owner = await staff('OWNER', 'retention.owner@example.test');
  const email = 'staff-deleted@example.test';
  const { user, ids, open } = await customerWithOrders(email);
  const csrf = Browser.csrf((await owner.browser.get(`/admin/accounts/${user.id}`)).body);
  await owner.browser.post(`/admin/accounts/${user.id}/delete`, {
    _csrf: csrf,
    confirmEmail: email,
  });
  assert.equal(await prisma.user.findUnique({ where: { id: user.id } }), null);
  await assertContractOnly(ids, user.name, email, open.id);
  // the team's list of orders still opens, with the name from the contract
  const list = await owner.browser.get('/admin/requests?status=all');
  assert.equal(list.status, 200);
  assert.match(list.body, new RegExp(email.replace('.', '\\.')));
});

test('the maintenance deletes the orders of a deleted account five years after the deletion, and only them', async () => {
  const email = 'five-years@example.test';
  const { c, ids } = await customerWithOrders(email);
  await c.post('/account/data/delete', {
    _csrf: await sessionCsrf(c, '/account/data'),
    password: CUSTOMER_PASSWORD,
    confirm: 'yes',
  });
  const [old, young, other] = ids as [string, string, string];
  const now = new Date();
  await prisma.upgradeRequest.update({
    where: { id: old },
    data: { accountDeletedAt: new Date(now.getTime() - (ORDER_RETENTION_DAYS + 1) * DAY) },
  });
  await prisma.upgradeRequest.update({
    where: { id: young },
    data: { accountDeletedAt: new Date(now.getTime() - (ORDER_RETENTION_DAYS - 1) * DAY) },
  });
  // an order of a living account is kept, however old
  const live = await customerWithOrders('still-here@example.test');
  await prisma.upgradeRequest.updateMany({
    where: { id: { in: live.ids } },
    data: { createdAt: new Date(now.getTime() - (ORDER_RETENTION_DAYS + 400) * DAY) },
  });

  await runMaintenance(now);
  assert.equal(await prisma.upgradeRequest.findUnique({ where: { id: old } }), null);
  assert.ok(await prisma.upgradeRequest.findUnique({ where: { id: young } }));
  assert.ok(await prisma.upgradeRequest.findUnique({ where: { id: other } }));
  assert.equal(await prisma.upgradeRequest.count({ where: { id: { in: live.ids } } }), 3);
});

test('the data export and the privacy policy in three languages say what stays and for how long', async () => {
  assert.equal(ORDER_RETENTION_DAYS, 5 * 365);
  const c = await customer('export-retention@example.test');
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'export-retention@example.test' },
  });
  const data = (await exportOwnData(user.id)) as {
    retention?: { ordersAfterAccountDeletion?: { deletedAfterDays?: number; kept?: string[] } };
  };
  const rule = data.retention?.ordersAfterAccountDeletion;
  assert.equal(rule?.deletedAfterDays, ORDER_RETENTION_DAYS);
  assert.ok(rule?.kept?.includes('customerEmail') && !rule.kept.includes('message'));
  const page = await c.get('/account/data');
  assert.match(page.body, /Поръчките остават само с данните на договора/);

  const said = {
    '/privacy': [
      /поръчките остават само с данните на договора/,
      /5 години след изтриването на акаунта/,
    ],
    '/en/privacy': [
      /orders stay with the contract details only/,
      /5 years after the account is deleted/,
    ],
    '/it/privacy': [
      /gli ordini restano solo con i dati del contratto/,
      /5 anni dall'eliminazione dell'account/,
    ],
  } as const;
  for (const [path, patterns] of Object.entries(said)) {
    const html = (await new Browser().get(path)).body.replace(/\s+/g, ' ');
    for (const pattern of patterns) assert.match(html, pattern, path);
  }
});
