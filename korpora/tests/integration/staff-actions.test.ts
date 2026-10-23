import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Browser,
  CUSTOMER_PASSWORD,
  linkIn,
  mailTo,
  outbox,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { customer, sessionCsrf, staff } from './people.js';

before(startApp);
after(stopApp);

const idOf = async (email: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;

test('two bans sent at the same moment leave one active ban and one audit entry', async () => {
  const { banAccount } = await import('../../src/services/admin-security.js');
  const admin = await staff('ADMIN', 'twin-ban.admin@example.test');
  await customer('twin-ban@example.test');
  const id = await idOf('twin-ban@example.test');
  const results = await Promise.all(
    [1, 2].map(() => banAccount(admin.actor, id, { reason: 'Двоен клик по бутона' })),
  );
  assert.deepEqual(results.map((r) => (r.ok ? 'banned' : r.key)).sort(), [
    'admin.errors.alreadyBanned',
    'banned',
  ]);
  assert.equal(await prisma.accountBan.count({ where: { userId: id, liftedAt: null } }), 1);
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'admin.account.banned', targetId: id } }),
    1,
  );
});

test('an email changed by the team ends the links sent before and tells the old address only if confirmed', async () => {
  const admin = await staff('ADMIN', 'edit-mail.admin@example.test');
  const edit = async (id: string, form: Record<string, string>) => {
    const csrf = await sessionCsrf(admin.browser, `/admin/accounts/${id}`);
    const reply = await admin.browser.post(`/admin/accounts/${id}/edit`, { _csrf: csrf, ...form });
    assert.equal(reply.status, 302);
    assert.equal(admin.browser.flash(), 'flash.accountSaved');
  };

  // never confirmed: the address may be someone else's (a typo) and does not learn the new one
  const typo = 'edit-mail-typo@example.test';
  await new Browser().register('Без Потвърждение', typo, CUSTOMER_PASSWORD);
  await edit(await idOf(typo), {
    name: 'Без Потвърждение',
    email: 'edit-mail-fixed@example.test',
    locale: 'bg',
  });

  // confirmed, with a reset link and a change of its own still open
  const old = 'edit-mail@example.test';
  const c = await customer(old);
  const id = await idOf(old);
  await new Browser().submit('/forgot', '/forgot', { email: old });
  const reset = linkIn((await mailTo(old, /Нова парола/)).text, '/reset?token=');
  const changed = await c.post('/account/email', {
    _csrf: await sessionCsrf(c),
    email: 'edit-mail-own@example.test',
    password: CUSTOMER_PASSWORD,
  });
  assert.equal(changed.status, 302);
  const own = linkIn(
    (await mailTo('edit-mail-own@example.test', /Потвърдете новия/)).text,
    '/verify-email?token=',
  );
  assert.equal((await new Browser().get(reset)).status, 200, 'the reset link works before');

  await edit(id, {
    name: 'Тест Клиент',
    email: 'edit-mail-new@example.test',
    locale: 'bg',
    emailVerified: 'yes',
  });
  assert.match((await mailTo(old, /е сменен/)).text ?? '', /edit-mail-new@example\.test/);
  assert.equal(
    (await new Browser().get(reset)).status,
    400,
    'the reset link went to the old address',
  );
  assert.equal(
    (await new Browser().confirmEmail(own)).status,
    400,
    'a change confirmed later does not undo the team’s edit',
  );
  assert.equal(await prisma.emailToken.count({ where: { userId: id, usedAt: null } }), 0);
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id } })).email,
    'edit-mail-new@example.test',
  );
  assert.ok(
    !outbox.some((m) => m.to === typo && /е сменен/.test(m.subject)),
    'the unconfirmed address was not told',
  );
});

test('an invitation is the account, its plan history, the link and the audit entry together or none of them', async () => {
  const { createAccount } = await import('../../src/services/admin-create.js');
  const owner = await staff('OWNER', 'invite.owner@example.test');
  const email = 'invite-atomic@example.test';
  const input = { email, name: 'Поканен Клиент', role: 'CUSTOMER', plan: 'TRIAL', locale: 'bg' };
  const counts = async () =>
    Promise.all([
      prisma.user.count(),
      prisma.planChange.count(),
      prisma.emailToken.count(),
      prisma.auditLog.count(),
    ]);
  const before = await counts();
  // the link cannot be written: nothing of the account may stay behind, or a retry says „taken“
  await prisma.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION korpora_test_refuse() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN RAISE EXCEPTION 'refused by the test'; END $$`,
  );
  await prisma.$executeRawUnsafe(
    'CREATE TRIGGER korpora_test_refuse BEFORE INSERT ON "EmailToken" FOR EACH ROW EXECUTE FUNCTION korpora_test_refuse()',
  );
  try {
    await assert.rejects(createAccount(owner.actor, input));
  } finally {
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS korpora_test_refuse ON "EmailToken"');
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS korpora_test_refuse()');
  }
  assert.deepEqual(await counts(), before, 'no account, plan record, link or audit entry');

  const made = await createAccount(owner.actor, input);
  assert.ok(made.ok, 'the same invitation goes through once the link can be written');
  const id = await idOf(email);
  assert.equal(await prisma.planChange.count({ where: { userId: id } }), 1);
  assert.equal(
    await prisma.emailToken.count({ where: { userId: id, purpose: 'RESET_PASSWORD' } }),
    1,
  );
  assert.equal(
    await prisma.auditLog.count({ where: { action: 'admin.account.created', targetId: id } }),
    1,
  );
  const link = linkIn((await mailTo(email, /Създадохме ви акаунт/)).text, '/reset?token=');
  assert.equal((await new Browser().get(link)).status, 200, 'the invitation sets the password');
});

test('the audit page with exactly one page of entries offers no next page', async () => {
  const { audit, SYSTEM_ACTOR } = await import('../../src/audit.js');
  const analyst = await staff('ANALYST', 'audit-page.analyst@example.test');
  const fill = async (n: number) => {
    for (let i = 0; i < n; i++) await audit(SYSTEM_ACTOR, { action: 'test.fill' });
  };
  const rows = (body: string) => body.match(/<td data-label="#" class="num mono-sm">/g)?.length;
  // the pager's own link: the language links repeat the address, `?before=` included
  const nextPage = (body: string) =>
    /class="pager"[\s\S]*?href="(\/admin\/audit\?before=\d+)"/.exec(body)?.[1];
  const written = await prisma.auditLog.count();
  assert.ok(written <= 100, 'the earlier tests wrote less than a page');
  await fill(100 - written);
  let page = await analyst.browser.get('/admin/audit');
  assert.equal(page.status, 200);
  assert.equal(rows(page.body), 100);
  assert.equal(nextPage(page.body), undefined, 'a full page and nothing after it');

  await fill(1);
  page = await analyst.browser.get('/admin/audit');
  const next = nextPage(page.body);
  assert.ok(next, 'the 101st entry is on the next page');
  const second = await analyst.browser.get(next);
  assert.equal(second.status, 200);
  assert.equal(rows(second.body), 1);
  assert.equal(nextPage(second.body), undefined);
});
