// Smoke steps of the accounts without an administrator (scripts/smoke.mjs runs them when MAILBOX_PORT is set and the
// server sends its mail to scripts/mail-sink.mjs): a company registers, signs in only after confirming the address
// with the newest link and its own password, forgets the password and sets a new one through the e-mail; a second
// registration with the same address and a forgotten password for an unknown one answer the same as any other.
import assert from 'node:assert/strict';

const link = (text, path) => {
  const m = new RegExp(`https?://[^\\s"<>]+/it/${path}#([A-Za-z0-9_-]{43})`).exec(text);
  assert.ok(m, `link /${path} in the e-mail`);
  return { url: m[0], token: m[1] };
};

export async function accountFlows({ BASE, stamp, step, newPage, sink }) {
  const { page, errors } = await newPage();
  const email = `registrata.${stamp}@example.com`, password = `Registrata${stamp}Pw9`;

  step('self-registration: the e-mail link, the newest one only, with the password chosen');
  let since = Date.now();
  await page.goto(`${BASE}/it/register`);
  await page.fill('input[name="company"]', `Ascensori ${stamp} srl`);
  await page.fill('input[name="city"]', 'Bergamo');
  await page.fill('input[name="name"]', 'Titolare registrato');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.fill('input[name="confirm"]', password);
  await page.check('input[name="privacy"]');
  await page.check('input[name="terms"]');
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main [role="status"] h2');
  const first = await sink.next(email, since);
  assert.ok(first, 'registration e-mail');
  const old = link(first.text, 'verify-email');

  // signing in before the confirmation: refused, and a new link replaces the first one
  since = Date.now();
  await page.goto(`${BASE}/it/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  assert.match(await page.textContent('main .alert-bad'), /Conferma prima/);
  const second = await sink.next(email, since);
  assert.ok(second, 'a new confirmation e-mail');
  const fresh = link(second.text, 'verify-email');
  assert.notEqual(fresh.token, old.token);

  await page.goto(old.url);
  await page.fill('input[name="password"]', password);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  assert.match(await page.textContent('main .alert-bad'), /non è valido/, 'the first link no longer works');
  assert.equal(new URL(page.url()).hash, '', 'the token leaves the address bar');

  // a link from the mail client opens a new page: never the same document with a new fragment
  await page.goto('about:blank');
  await page.goto(fresh.url);
  await page.fill('input[name="password"]', `Altra${stamp}Password9`);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  assert.match(await page.textContent('main .alert-bad'), /Non è la password/, 'another password does not confirm');
  await page.goto('about:blank');
  await page.goto(fresh.url);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  assert.match(await page.textContent('header'), new RegExp(`Ascensori ${stamp} srl`), 'signed in, in its own company');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);

  step('forgotten password: the e-mail link, a new password, the old one refused');
  since = Date.now();
  await page.goto(`${BASE}/it/forgot-password`);
  await page.fill('input[name="email"]', email);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-ok');
  const reset = await sink.next(email, since);
  assert.ok(reset, 'reset e-mail');
  const next = `Nuova${stamp}Password9`;
  await page.goto(link(reset.text, 'reset-password').url);
  await page.fill('input[name="next"]', next);
  await page.fill('input[name="confirm"]', next);
  await Promise.all([page.waitForURL(/\/it\/login\?reset=1$/), page.click('main form button[type="submit"]')]);
  await page.waitForSelector('main .alert-ok');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', next);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);

  step('same answers for a known and an unknown address; the owner of a known one hears it');
  since = Date.now();
  await page.goto(`${BASE}/it/register`);
  for (const [k, v] of [['company', 'Doppione srl'], ['name', 'Qualcuno'], ['email', email], ['password', next], ['confirm', next]]) await page.fill(`input[name="${k}"]`, v);
  await page.check('input[name="privacy"]');
  await page.check('input[name="terms"]');
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main [role="status"] h2');
  const exists = await sink.next(email, since);
  assert.ok(exists && /\/it\/forgot-password/.test(exists.text) && !/verify-email#/.test(exists.text), 'the "already registered" e-mail');
  const nobody = `nessuno.${stamp}@example.com`;
  since = Date.now();
  await page.goto(`${BASE}/it/forgot-password`);
  await page.fill('input[name="email"]', nobody);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-ok');
  assert.equal(await sink.next(nobody, since, 1500), null, 'no e-mail for an unknown address');
  assert.deepEqual(errors, [], 'browser errors');
}
