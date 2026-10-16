// Smoke steps of the accounts without an administrator (scripts/smoke.mjs runs them when MAILBOX_PORT is set and the
// server sends its mail to scripts/mail-sink.mjs). During the beta (REGISTRATION_MODE=invite, the default) /register
// without an invitation shows how to ask for one, and the platform administrator invites the testers
// (scripts/smoke-beta.mjs); a company registers from its invitation's link, signs in only after confirming the address
// with the newest link, the specific approval of the clauses and its own password (the tick kept after an error), invites a colleague who chooses the password from the link (an address with
// an account elsewhere gets the same answer), forgets the password and sets a new one through the e-mail; a sign-out
// ends the session on the server; a registration with the address of a waiting invitation leaves it waiting in the
// inviting company — no company learns that the address joined another —; a second registration with the same address
// and a forgotten password for an unknown one answer the same as any other. Then the company's rights matrix with its
// owner and the colleague it invited (smoke-permessi.mjs).
// One run registers three times from 127.0.0.1, and the server takes 5 right registrations an hour from one address,
// counted in its memory (src/server/account-actions.ts, register-ip): a second run against the same server process within
// the hour is refused — it stops here saying so; restart the server (or wait an hour) between full runs.
import assert from 'node:assert/strict';
import { betaPanel, inviteTesters, invitesUsed } from './smoke-beta.mjs';
import { permessiFlow } from './smoke-permessi.mjs';

const CONSENTS = ['accept', 'business', 'drafts'];

const link = (text, path) => {
  const m = new RegExp(`https?://[^\\s"<>]+/it/${path}#([A-Za-z0-9_-]{43})`).exec(text);
  assert.ok(m, `link /${path} in the e-mail`);
  return { url: m[0], token: m[1] };
};

/** The registration's answer: the panel that says the e-mail is on its way — or the server's limit, said plainly. */
async function registered(page) {
  await page.waitForSelector('main [role="status"] h2, main #register-error');
  const refused = page.locator('main #register-error');
  if (await refused.count()) {
    const why = (await refused.textContent()) ?? '';
    throw new Error(/Troppi tentativi/.test(why)
      ? 'registration refused by the server\'s limit (5 an hour from one address, in its memory): restart the server or wait an hour, then run the smoke again'
      : `registration refused: ${why}`);
  }
}

/** The registration form of an invitation's link: its address already there and fixed, the rest typed, three ticks. */
async function registerInvited(page, url, address, fields) {
  await page.goto('about:blank');
  await page.goto(url);
  const email = page.locator('main input[name="email"]');
  // the form comes once the page has asked the server about the fragment's token
  await page.waitForFunction((a) => globalThis.document.querySelector('main input[name="email"]')?.value === a, address);
  assert.equal(await email.inputValue(), address, 'the invited address');
  assert.equal(new URL(page.url()).hash, '', 'the token leaves the address bar');
  assert.equal(await email.getAttribute('readonly'), '', 'not to be changed');
  assert.equal(await page.locator('main input[name="invito"][type="hidden"]').count(), 1, 'the invitation goes back with the form');
  assert.equal(await page.locator('main input[name="clauses"]').count(), 0, 'no tick for the clauses here');
  assert.match(await page.textContent('main form'), /approvazione specifica delle clausole[\s\S]*link dell’e-mail/i, 'the clauses come with the link');
  for (const [k, v] of Object.entries(fields)) await page.fill(`input[name="${k}"]`, v);
  for (const k of CONSENTS) await page.check(`input[name="${k}"]`);
  await page.click('main form button[type="submit"]');
  await registered(page);
}

/** The page of a registration's link: the clauses, their tick and the password; in. */
async function approveClauses(page, url, password) {
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForSelector('main input[name="clauses"]');
  await page.check('main input[name="clauses"]');
  await page.fill('main input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
}

export async function accountFlows({ BASE, stamp, step, newPage, sink, ADMIN_EMAIL, ADMIN, kit }) {
  const { page, errors } = await newPage();
  const email = `registrata.${stamp}@example.com`, password = `Registrata${stamp}Pw9`;
  const held = `trattenuto.${stamp}@example.com`, heldPw = `Trattenuto${stamp}Pw9`;

  await betaPanel({ BASE, page });
  // the owner's address twice: its second invitation, still waiting once the address has an account, opens the
  // registration that only gets the «already registered» e-mail (the last step)
  const [invited, heldLink, again] = await inviteTesters({ BASE, page, kit, ADMIN, sink, stamp, addresses: [email, held, email] });

  step('self-registration from the invitation: the e-mail link, the newest one only, the clauses approved with the password chosen');
  let since = Date.now();
  await registerInvited(page, invited, email, { company: `Ascensori ${stamp} srl`, city: 'Bergamo', name: 'Titolare registrato', password, confirm: password });
  const first = await sink.next(email, since);
  assert.ok(first, 'registration e-mail');
  assert.ok(/\/it\/privacy#terms/.test(first.text), 'the terms accepted, in the registration e-mail');
  assert.match(first.text, /approverai specificamente, con la tua password, le clausole/, 'the e-mail announces the approval on the page');
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

  // the page asks the server what the link is: the first one is said not good at once, with no form
  await page.goto(old.url);
  await page.waitForSelector('main .alert-bad');
  assert.match(await page.textContent('main .alert-bad'), /non è valido/, 'the first link no longer works');
  assert.equal(await page.locator('main input[name="password"]').count(), 0, 'nothing to type on a link that is not good');
  assert.equal(new URL(page.url()).hash, '', 'the token leaves the address bar');

  // a link from the mail client opens a new page: never the same document with a new fragment; a registration's link
  // shows the clauses: without their tick nothing is confirmed, and the focus goes to it
  await page.goto('about:blank');
  await page.goto(fresh.url);
  await page.waitForSelector('main input[name="clauses"]');
  assert.match(await page.textContent('main form'), /Ai sensi degli artt\. 1341 e 1342 del codice civile approvo specificamente/, 'the clauses’ text');
  assert.match(await page.textContent('main form button[type="submit"]'), /Approvo le clausole e attivo l’account/);
  await page.fill('main input[name="password"]', password);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  assert.match(await page.textContent('main .alert-bad'), /spunta tutte le conferme/, 'the approval is required');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.getAttribute('name')), 'clauses', 'the focus on the tick');
  // ticked, with another password: refused, and the tick stays as the person left it after the form's reset
  await page.check('main input[name="clauses"]');
  await page.fill('main input[name="password"]', `Altra${stamp}Password9`);
  await page.click('main form button[type="submit"]');
  await page.waitForFunction(() => /La password non è corretta/.test(globalThis.document.querySelector('main .alert-bad')?.textContent ?? ''));
  assert.equal(await page.isChecked('main input[name="clauses"]'), true, 'the tick kept after the error');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.id), 'verify-error', 'the focus on the message');
  await page.fill('main input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  assert.match(await page.textContent('.ws-user'), new RegExp(`Ascensori ${stamp} srl`), 'signed in, in its own company');

  step('a colleague invited by a self-registered company chooses the password from the link; an address with an account elsewhere gets the same answer');
  const member = `collega.${stamp}@example.com`, memberPw = `Collega${stamp}Pw9`;
  const invite = async (name, address) => {
    await page.goto(`${BASE}/it/app/team`);
    await page.fill('main form input[name="name"]', name);
    await page.fill('main form input[name="email"]', address);
    await page.click('main form:has(input[name="email"]) button[type="submit"]');
    await page.waitForSelector('main form .alert-ok[role="status"]');
    return (await page.textContent('main form .alert-ok[role="status"]')).replace(address, '<address>');
  };
  since = Date.now();
  const answerNew = await invite('Collega di prova', member);
  // the platform's administrator has an account in another company: the same answer, a notice instead of the link
  const answerTaken = await invite('Già altrove', ADMIN_EMAIL);
  assert.equal(answerTaken, answerNew, 'the same answer for an address with an account elsewhere');
  assert.equal(await page.locator('.secret').count(), 0, 'no password goes through the owner');
  await page.reload();
  assert.match(await page.textContent('section[aria-labelledby="invites-title"] > table'), new RegExp(member.replace(/\./g, '\\.')), 'the invitation waits');
  const notice = await sink.next(ADMIN_EMAIL, since);
  assert.ok(notice && /già un account/.test(notice.text) && !/\/it\/invite#/.test(notice.text), 'a notice, with nothing to take');
  const mail = await sink.next(member, since);
  assert.ok(mail, 'the invitation e-mail');
  assert.doesNotMatch(mail.text, new RegExp(`Ascensori ${stamp}`), 'the e-mail names no company');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);
  await page.goto('about:blank');
  await page.goto(link(mail.text, 'invite').url);
  await page.waitForSelector('main form input[name="next"]');
  assert.match(await page.textContent('main form'), new RegExp(`Ascensori ${stamp} srl ti invita`), 'the page names the company');
  await page.fill('input[name="next"]', memberPw);
  await page.fill('input[name="confirm"]', memberPw);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  assert.match(await page.textContent('.ws-user'), new RegExp(`Ascensori ${stamp} srl`), 'signed in, in the company that invited');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);

  step('a sign-out ends the session on the server: a copied cookie no longer opens the app');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  const copied = await page.context().cookies();
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);
  const { page: other } = await newPage();
  await other.context().addCookies(copied);
  await other.goto(`${BASE}/it/app`);
  assert.match(new URL(other.url()).pathname, /^\/it\/login/, 'the copied cookie after the sign-out');
  await other.close();

  step('a registration with the address of a waiting invitation: confirmed, the invitation still waits in the inviting company');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await invite('Invitato mai entrato', held);
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);
  since = Date.now();
  await registerInvited(page, heldLink, held, { company: `Azienda trattenuta ${stamp}`, name: 'Titolare della casella', password: heldPw, confirm: heldPw });
  const offer = await sink.next(held, since);
  assert.ok(offer, 'the registration e-mail');
  // until the inbox confirms, the invitation still waits in the company
  await page.goto(`${BASE}/it/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await page.goto(`${BASE}/it/app/team`);
  assert.match(await page.textContent('section[aria-labelledby="invites-title"] > table'), new RegExp(held.replace(/\./g, '\\.')), 'the invitation before the confirmation');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);
  await approveClauses(page, link(offer.text, 'verify-email').url, heldPw);
  assert.match(await page.textContent('.ws-user'), new RegExp(`Azienda trattenuta ${stamp}`), 'signed in, in the new company');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app$/), page.click('main form button[type="submit"]')]);
  await page.goto(`${BASE}/it/app/team`);
  assert.match(await page.textContent('section[aria-labelledby="invites-title"] > table'), new RegExp(held.replace(/\./g, '\\.')), 'the invitation after the confirmation, alike');
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);

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
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('.ws-logout button[type="submit"]')]);

  step('same answers for a known and an unknown address; the owner of a known one hears it');
  since = Date.now();
  // the address's second invitation, made before it had an account: the answer of any registration
  await registerInvited(page, again, email, { company: 'Doppione srl', name: 'Qualcuno', password: next, confirm: next });
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
  await invitesUsed({ BASE, page, kit, ADMIN, companies: [`Ascensori ${stamp} srl`, `Azienda trattenuta ${stamp}`] });

  await permessiFlow({ BASE, page, errors, kit, owner: { email, password: next }, tecnico: { email: member, password: memberPw }, admin: ADMIN,
    company: `Ascensori ${stamp} srl` });
  assert.deepEqual(errors, [], 'browser errors');
}
