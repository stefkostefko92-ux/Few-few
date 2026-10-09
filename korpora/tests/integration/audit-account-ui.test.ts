import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { totpCode } from '../../src/auth/totp.js';
import { orderNo } from '../../src/plans/order-number.js';
import {
  Browser,
  CUSTOMER_PASSWORD,
  forgetMailTo,
  linkIn,
  mailTo,
  prisma,
  startApp,
  stopApp,
} from './harness.js';
import { customer, placeOrder, sessionCsrf } from './people.js';

before(startApp);
after(stopApp);

/** The answer without what differs by the address: the typed email and the one-time form token. */
const same = (body: string, email: string) =>
  body.replaceAll(email, 'EMAIL').replace(/name="_csrf" value="[^"]+"/g, '');

test('sign-in is paused after five wrong tries the same way with and without an account', async () => {
  await customer('paused@example.test');
  const real = new Browser();
  const ghost = new Browser();
  for (let i = 0; i < 6; i++) {
    const a = await real.login('paused@example.test', `Wrong-Password-${i}00`);
    const b = await ghost.login('ghost-paused@example.test', `Wrong-Password-${i}00`);
    assert.equal(a.status, i < 4 ? 401 : 429, `try ${i + 1}`);
    assert.equal(b.status, a.status, `try ${i + 1}: the same status`);
    assert.equal(
      same(b.body, 'ghost-paused@example.test'),
      same(a.body, 'paused@example.test'),
      `try ${i + 1}: the same page`,
    );
  }
  const right = await real.login('paused@example.test', CUSTOMER_PASSWORD);
  assert.equal(right.status, 429);
  assert.match(right.body, /Входът с този имейл е спрян за 15 минути след 5 грешни опита/);
  assert.match(right.body, /href="\/forgot"/);
});

test('the language switch changes the screen only; the profile saves the account language', async () => {
  const b = await customer('lang-switch@example.test');
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: 'lang-switch@example.test' },
  });
  assert.equal(user.locale, 'bg');
  const en = await b.get('/account?lang=en');
  assert.match(en.body, /<html lang="en">/);
  assert.match(en.body, /<option value="en" lang="en" selected>/, 'the field shows the screen');
  assert.match(en.body, /Your emails now come in Bulgarian/);
  const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(stored.locale, 'bg', 'a GET with ?lang= does not change the account');
  // the next page keeps the chosen screen language (the cookie of this device)
  assert.match((await b.get('/account/plan')).body, /<html lang="en">/);
  await b.post('/account/profile', {
    _csrf: await sessionCsrf(b),
    name: 'Тест Клиент',
    locale: 'it',
  });
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).locale, 'it');
  const it = await b.get('/account');
  assert.match(it.body, /<html lang="it">/);
  assert.doesNotMatch(it.body, /id="locale-mail"/, 'screen and emails agree');
});

test('a wrong code while turning 2FA on keeps the same key and QR; the right one then works', async () => {
  const b = await customer('tfa-retry@example.test');
  const start = await b.post('/account/security/2fa/start', {
    _csrf: await sessionCsrf(b, '/account/security'),
    password: CUSTOMER_PASSWORD,
  });
  const secretOf = (html: string) =>
    /<p class="secret"[^>]*>([A-Z2-7 ]+)<\/p>/.exec(html)?.[1]?.replace(/\s+/g, '') ?? '';
  const secret = secretOf(start.body);
  assert.match(
    start.body,
    /<p class="secret"[^>]*>(?:[A-Z2-7]{4} ){7}[A-Z2-7]{4}<\/p>/,
    'by fours',
  );
  const setup = /name="setup" value="([^"]+)"/.exec(start.body)?.[1] ?? '';
  const wrong = await b.post('/account/security/2fa/confirm', {
    _csrf: Browser.csrf(start.body),
    setup,
    code: '000000',
  });
  assert.equal(wrong.status, 400);
  assert.equal(secretOf(wrong.body), secret, 'the same key, not a new one');
  assert.match(wrong.body, /id="tfa-error"/);
  assert.match(wrong.body, /<img src="data:image\/png/);
  // a forged or foreign setup field shows nothing
  const forged = await b.post('/account/security/2fa/confirm', {
    _csrf: Browser.csrf(start.body),
    setup: 'AAAA',
    code: '000000',
  });
  assert.equal(forged.status, 302);
  const ok = await b.post('/account/security/2fa/confirm', {
    _csrf: Browser.csrf(wrong.body),
    setup,
    code: totpCode(secret, Math.floor(Date.now() / 1000)),
  });
  assert.equal(ok.status, 200);
  assert.match(ok.body, /download="korpora-recovery-codes\.txt"/);
  assert.match(ok.body, /href="data:text\/plain;charset=utf-8,Korpora/);
  // the fields that take a recovery code (letters) do not ask for the numeric keyboard
  const page = await b.get('/account/security');
  assert.doesNotMatch(page.body, /id="(?:rc|dis)-code"[^>]*inputmode="numeric"/);
});

test('an older confirmation link and a used one say what happened', async () => {
  const b = new Browser();
  await b.register('Стар Линк', 'old-link@example.test', CUSTOMER_PASSWORD);
  const first = linkIn(
    (await mailTo('old-link@example.test', /Потвърдете имейла/)).text,
    '/verify-email?token=',
  );
  forgetMailTo('old-link@example.test');
  const login = await b.login('old-link@example.test', CUSTOMER_PASSWORD);
  assert.equal(login.status, 403);
  assert.equal((login.body.match(/още не е потвърден/g) ?? []).length, 1, 'said once');
  const second = linkIn(
    (await mailTo('old-link@example.test', /Потвърдете имейла/)).text,
    '/verify-email?token=',
  );
  const old = await b.get(first);
  assert.equal(old.status, 400);
  assert.match(old.body, /заменена от по-нова/);
  assert.match(old.body, /ще ви изпратим нова връзка/);
  assert.equal((await b.confirmEmail(second)).status, 200);
  const again = await b.get(second);
  assert.match(again.body, /<h1>Имейлът вече е потвърден<\/h1>/);
});

test('the plan page names orders by number, says which order replaced which, and asks before cancelling', async () => {
  const email = 'ui-orders@example.test';
  const { c, row: first } = await placeOrder(email, { option: 'm1', buyer: 'business' });
  await c.post('/account/plan/request', {
    _csrf: await sessionCsrf(c, '/account/plan'),
    option: 'm3',
    buyer: 'business',
  });
  assert.equal(c.flash(), 'flash.requestSentReplaces');
  const newer = await prisma.upgradeRequest.findFirstOrThrow({
    where: { user: { email }, status: 'OPEN' },
  });
  const page = await c.get('/account/plan');
  assert.match(page.body, new RegExp(`<span class="order-no">${orderNo(first)}</span>`));
  assert.match(page.body, />\s*Заменена<\/span>/);
  assert.match(page.body, new RegExp(`с поръчка № ${orderNo(newer)}`));
  assert.doesNotMatch(page.body, /Оттеглена/);
  assert.match(page.body, new RegExp(`data-confirm="Да отменя ли поръчка № ${orderNo(newer)}?`));
  assert.doesNotMatch(page.body, /Ако сте потребител, можете да се откажете/, 'no consumer order');
});

test('Lifetime does not read the expiry rule; an expired plan shows no project form', async () => {
  const c = await customer('life@example.test');
  await prisma.user.update({
    where: { email: 'life@example.test' },
    data: { plan: 'LIFETIME', planExpiresAt: null },
  });
  assert.doesNotMatch((await c.get('/account/plan')).body, /Когато планът изтече/);
  await prisma.user.update({
    where: { email: 'life@example.test' },
    data: { plan: 'TRIAL', planExpiresAt: new Date(Date.now() - 86_400_000) },
  });
  const plan = await c.get('/account/plan');
  assert.doesNotMatch(plan.body, /изтекъл на/);
  const app = await c.get('/app');
  assert.doesNotMatch(app.body, /class="newproj-form"/);
  assert.match(app.body, /Още нямате проекти\.<\/p>/);
});

test('the sign-up form shows every error at once, each at its field', async () => {
  const b = new Browser();
  const reply = await b.submit('/register', '/register', { name: '', email: '', password: '' });
  assert.equal(reply.status, 400);
  for (const id of ['err-name', 'err-email', 'err-password', 'err-terms'])
    assert.match(reply.body, new RegExp(`id="${id}"`), id);
  assert.match(reply.body, /id="form-error" tabindex="-1" autofocus/);
});

test('error pages: the expired reset link says so, 404 sends a visitor to sign in, 429 tells when', async () => {
  const anon = new Browser();
  const reset = await anon.get('/reset?token=bogus&lang=it');
  assert.match(reset.body, /<h1>Il link non funziona<\/h1>/);
  const missing = await anon.get('/no-such-page');
  assert.equal(missing.status, 404);
  assert.match(missing.body, /href="\/login"/);
  assert.doesNotMatch(missing.body, /href="\/app"/);
  assert.match(missing.body, /<nav class="langs"/);
  const signedIn = await customer('signed-404@example.test');
  assert.match((await signedIn.get('/no-such-page')).body, /href="\/app"/);
  const flood = new Browser();
  let last = await flood.submit('/forgot', '/forgot', { email: 'x@example.test' });
  for (let i = 0; i < 6 && last.status !== 429; i++)
    last = await flood.submit('/forgot', '/forgot', { email: 'x@example.test' });
  assert.equal(last.status, 429);
  assert.match(last.body, /Опитайте отново след \d+ минут/);
});

test('a ban reason in Bulgarian is labelled so on an English screen', async () => {
  await customer('banned-en@example.test');
  await prisma.user.update({
    where: { email: 'banned-en@example.test' },
    data: { bannedAt: new Date(), banReason: 'Нарушаване на условията' },
  });
  const b = new Browser();
  await b.get('/login?lang=en');
  const reply = await b.login('banned-en@example.test', CUSTOMER_PASSWORD);
  assert.equal(reply.status, 403);
  assert.match(reply.body, /Reason \(as written by our team, in Bulgarian\)/);
  assert.match(reply.body, /<blockquote lang="bg">Нарушаване на условията<\/blockquote>/);
});
