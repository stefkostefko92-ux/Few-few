import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, startApp, stopApp } from './harness.js';
import { placeOrder, sessionCsrf, staff } from './people.js';

before(startApp);
after(stopApp);

/** A customer row straight in the base: never signed in, no plan history, no project. */
function quietCustomer(email: string, extra: { bannedAt?: Date; banReason?: string } = {}) {
  return prisma.user.create({
    data: { email, name: 'Тих Клиент', passwordHash: 'x', emailVerifiedAt: new Date(), ...extra },
  });
}

test('the account sheet: title above the tabs, a way back, empty tables say so, a blocked plan is grey', async () => {
  const owner = await staff('OWNER', 'sheet.owner@example.test');
  const quiet = await quietCustomer('sheet.quiet@example.test', {
    bannedAt: new Date(),
    banReason: 'тест',
  });
  const { body, status } = await owner.browser.get(`/admin/accounts/${quiet.id}`);
  assert.equal(status, 200);
  assert.ok(body.indexOf('<h1>') < body.indexOf('class="subnav subnav-admin"'), 'h1 first');
  assert.match(body, /<a class="back-link" href="\/admin\/accounts">/);
  assert.match(body, /Планът още не е сменян\./);
  assert.match(body, /Още няма опити за вход\./);
  const head = body.slice(body.indexOf('<div class="acc-head">'), body.indexOf('acc-meta'));
  assert.match(
    head,
    /<span class="chip"><svg[^>]*><use href="#i-minus"\/><\/svg>\s*Тестов период<\/span>/,
  );
  assert.doesNotMatch(head, /chip-ok/, 'a blocked account has no green plan chip');
  // the destructive forms name the account; deleting asks only for the typed e-mail
  assert.match(body, /\/sessions\/revoke#security" data-confirm="[^"]*sheet\.quiet@example\.test/);
  assert.doesNotMatch(body, /\/delete" class="form" data-confirm=/);
  assert.match(body, /<template id="confirm-dialog"><dialog class="confirm"/);
});

test('the audit log reads as words: the action, the details and the e-mail instead of the id', async () => {
  const owner = await staff('OWNER', 'words.owner@example.test');
  const target = await quietCustomer('words.target@example.test');
  const ban = await owner.browser.post(`/admin/accounts/${target.id}/ban`, {
    _csrf: await sessionCsrf(owner.browser, `/admin/accounts/${target.id}`),
    reason: 'Злоупотреба с поръчки',
  });
  assert.equal(ban.status, 302);
  const { body } = await owner.browser.get('/admin/audit?action=admin.account');
  assert.match(
    body,
    /<span class="audit-label">Блокиран акаунт<\/span><code class="audit-code">admin\.account\.banned<\/code>/,
  );
  assert.match(body, /причина: „Злоупотреба с поръчки“/);
  assert.match(
    body,
    new RegExp(`<a href="/admin/accounts/${target.id}">words\\.target@example\\.test</a>`),
  );
  assert.doesNotMatch(body, /\{&#34;reason|\{"reason/, 'no raw JSON');
  assert.doesNotMatch(body, new RegExp(`>${target.id}<`), 'no bare id where the e-mail is known');
  const sheet = await owner.browser.get(`/admin/accounts/${target.id}`);
  assert.match(sheet.body, /<ol class="audit-list">[\s\S]*Блокиран акаунт/);
  const none = await owner.browser.get('/admin/audit?action=zzzz');
  assert.match(none.body, /<p class="empty">Няма записи, които отговарят на условието\.<\/p>/);
  assert.doesNotMatch(none.body, /audit-table/);
});

test('the accounts list: a page past the last goes to the last, headers sort, empty cells are marked', async () => {
  const owner = await staff('OWNER', 'list.owner@example.test');
  await quietCustomer('list.quiet@example.test');
  const far = await owner.browser.get('/admin/accounts?page=999&sort=email&dir=asc');
  assert.equal(far.status, 302);
  assert.match(far.location, /^\/admin\/accounts\?.*sort=email&dir=asc&page=1$/);
  const { body } = await owner.browser.get('/admin/accounts?sort=email&dir=asc');
  assert.match(
    body,
    /<th aria-sort="ascending"><a class="th-sort" href="\/admin\/accounts\?[^"]*sort=email&amp;dir=desc/,
  );
  assert.match(body, /1–\d+ от \d+ · Страница 1 от 1/);
  assert.doesNotMatch(body, /Изчисти филтрите/);
  const row = body.slice(body.indexOf('list.quiet@example.test'));
  assert.match(row, /data-label="Последен вход" class="is-blank"/);
  assert.match(row, /data-label="Проекти" class="num is-blank"/);
  const filtered = await owner.browser.get('/admin/accounts?plan=TRIAL');
  assert.match(
    filtered.body,
    /<a class="btn btn-quiet" href="\/admin\/accounts">[\s\S]*?Изчисти филтрите<\/a>/,
  );
});

test('orders and the dashboard: the rejection names the customer, the open orders show their sum', async () => {
  const owner = await staff('OWNER', 'dash2.owner@example.test');
  await placeOrder('dash2.buyer@example.test', { option: 'm12', buyer: 'business' });
  const orders = await owner.browser.get('/admin/requests');
  assert.match(
    orders.body,
    /data-confirm="Да отхвърля ли поръчката на dash2\.buyer@example\.test \(12 месеца\)\?"/,
  );
  assert.match(orders.body, /<table class="stack stack-kv orders-table">/);
  const dash = await owner.browser.get('/admin');
  for (const group of ['Планове', 'Чака екипа', 'Движение'])
    assert.match(dash.body, new RegExp(`<h2 class="stat-h" id="g-[a-z]+">${group}</h2>`));
  assert.match(dash.body, /<span class="stat-note">[\d\s  ]+(,\d\d)?[\s ]€ без ДДС<\/span>/);
  assert.match(dash.body, /Нови за 7 дни[\s\S]*Нови за 30 дни/);
  assert.match(dash.body, /<div class="section-grid dash-grid">/);
});
