// Smoke steps of the accounts without an administrator (scripts/smoke.mjs runs them when MAILBOX_PORT is set and the
// server sends its mail to scripts/mail-sink.mjs): a company registers, signs in only after confirming the address
// with the newest link and its own password, forgets the password and sets a new one through the e-mail; a sign-out
// ends the session on the server; a registration with the address of a colleague never confirmed changes nothing until
// the inbox confirms it; a second registration with the same address and a forgotten password for an unknown one answer
// the same as any other.
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
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await page.check(`input[name="${k}"]`);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main [role="status"] h2');
  const first = await sink.next(email, since);
  assert.ok(first, 'registration e-mail');
  assert.ok(/\/it\/privacy#terms/.test(first.text), 'the terms accepted, in the registration e-mail');
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
  assert.match(await page.textContent('main .alert-bad'), /La password non è corretta/, 'another password does not confirm');
  await page.goto('about:blank');
  await page.goto(fresh.url);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  assert.match(await page.textContent('header'), new RegExp(`Ascensori ${stamp} srl`), 'signed in, in its own company');

  step('a user added by a self-registered company confirms the address at the first sign-in');
  const member = `collega.${stamp}@example.com`;
  await page.goto(`${BASE}/it/app/team`);
  await page.fill('main form input[name="name"]', 'Collega di prova');
  await page.fill('main form input[name="email"]', member);
  await page.click('main form:has(input[name="email"]) button[type="submit"]');
  const temp = (await page.locator('.secret').first().textContent())?.trim() ?? '';
  assert.equal(temp.length, 16);
  await page.waitForSelector('main form .note[role="status"]');
  await page.reload();
  assert.match(await page.textContent('main table'), /deve confermare l’e-mail/, 'the member is shown as not confirmed');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
  since = Date.now();
  await page.fill('input[name="email"]', member);
  await page.fill('input[name="password"]', temp);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  assert.match(await page.textContent('main .alert-bad'), /Conferma prima/, 'no session before the confirmation');
  const invite = await sink.next(member, since);
  assert.ok(invite, 'confirmation e-mail of the member');
  await page.goto('about:blank');
  await page.goto(link(invite.text, 'verify-email').url);
  await page.fill('input[name="password"]', temp);
  await Promise.all([page.waitForURL(/\/it\/app\/account\?first=1$/), page.click('main form button[type="submit"]')]);
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);

  step('a sign-out ends the session on the server: a copied cookie no longer opens the app');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  const copied = await page.context().cookies();
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
  const { page: other } = await newPage();
  await other.context().addCookies(copied);
  await other.goto(`${BASE}/it/app`);
  assert.match(new URL(other.url()).pathname, /^\/it\/login/, 'the copied cookie after the sign-out');
  await other.close();

  step('a registration with the address of a colleague never confirmed: nothing changes until the inbox confirms it');
  const held = `trattenuto.${stamp}@example.com`, heldPw = `Trattenuto${stamp}Pw9`;
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await page.goto(`${BASE}/it/app/team`);
  await page.fill('main form input[name="name"]', 'Collega mai confermato');
  await page.fill('main form input[name="email"]', held);
  await page.click('main form:has(input[name="email"]) button[type="submit"]');
  await page.waitForSelector('main form .note[role="status"]');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
  since = Date.now();
  await page.goto(`${BASE}/it/register`);
  for (const [k, v] of [['company', `Azienda trattenuta ${stamp}`], ['name', 'Titolare della casella'], ['email', held], ['password', heldPw], ['confirm', heldPw]]) await page.fill(`input[name="${k}"]`, v);
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await page.check(`input[name="${k}"]`);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main [role="status"] h2');
  const offer = await sink.next(held, since);
  assert.ok(offer && /mai confermato/.test(offer.text), 'the e-mail says that the account never confirmed goes with the confirmation');
  // the colleague is still in the company: a registration alone takes nothing
  await page.goto(`${BASE}/it/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await page.goto(`${BASE}/it/app/team`);
  assert.match(await page.textContent('main table'), new RegExp(held.replace(/\./g, '\\.')), 'the colleague before the confirmation');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
  // the inbox's owner confirms: their company is made, the colleague never confirmed is released
  await page.goto('about:blank');
  await page.goto(link(offer.text, 'verify-email').url);
  await page.fill('input[name="password"]', heldPw);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  assert.match(await page.textContent('header'), new RegExp(`Azienda trattenuta ${stamp}`), 'signed in, in the new company');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await page.goto(`${BASE}/it/app/team`);
  assert.doesNotMatch(await page.textContent('main table'), new RegExp(held.replace(/\./g, '\\.')), 'the colleague released by the confirmation');
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
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await page.check(`input[name="${k}"]`);
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
