// Smoke steps of the beta by invitation (round 48, REGISTRATION_MODE=invite — the server's default): /register without an
// invitation, or with a link that is not good, shows how to ask for one and no form; the platform administrator invites
// the testers from /app/admin («Inviti alla beta»), each link shown once on the screen and the same one in the e-mail,
// its token in the fragment (/register#<token>, never sent to the server); after the registrations the list says which
// company used which invitation (scripts/smoke-accounts.mjs).
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const SECTION = 'section[aria-labelledby="beta-title"]';

export async function betaPanel({ BASE, page }) {
  step('/register during the beta: without an invitation, or with a bad link, how to ask for one and no form');
  for (const [url, bad] of [[`${BASE}/it/register`, false], [`${BASE}/it/register#${'Z'.repeat(43)}`, true], [`${BASE}/it/register#nulla`, true]]) {
    // a new document each time: the browser reads the fragment, the page asks the server about the token
    await page.goto('about:blank');
    await page.goto(url);
    await page.waitForSelector('main [role="status"] h2');
    const main = await page.textContent('main');
    assert.match(main, /La registrazione è su invito durante la beta/, url);
    assert.match(main, /info@carbonstealth\.eu/, `${url}: where to ask`);
    assert.equal(await page.locator('main input[name="company"]').count(), 0, `${url}: no form`);
    assert.equal(/non è valido, è già stato usato o è scaduto/.test(main), bad, `${url}: the bad link said`);
    assert.equal(await page.locator('main a[href$="/it/login"]').count() > 0, true, `${url}: the sign-in`);
    assert.equal(new URL(page.url()).hash, '', `${url}: the token leaves the address bar`);
  }
}

/** The administrator invites each address (in order; an address may come twice): the link of each invitation, the same
 *  on the screen once and in the e-mail. */
export async function inviteTesters({ BASE, page, kit, ADMIN, sink, stamp, addresses }) {
  step('the platform administrator invites the testers: the link once on the screen and the same in the e-mail');
  await kit.login(page, ADMIN.email, ADMIN.password);
  const links = [];
  for (const [i, address] of addresses.entries()) {
    await page.goto(`${BASE}/it/app/admin`);
    await kit.hydrated(page, `${SECTION} form button[type="submit"]`);
    const since = Date.now();
    await page.fill(`${SECTION} input[name="email"]`, address);
    await page.fill(`${SECTION} input[name="note"]`, `Smoke ${stamp} · ${i + 1}`);
    await page.click(`${SECTION} form:has(input[name="note"]) button[type="submit"]`);
    await page.waitForSelector(`${SECTION} .secret`);
    const shown = ((await page.textContent(`${SECTION} .secret`)) ?? '').trim();
    assert.match(shown, /\/it\/register#[A-Za-z0-9_-]{43}$/, 'the link on the screen, its token in the fragment');
    const mail = await sink.next(address, since);
    assert.ok(mail, `the invitation e-mail to ${address}`);
    assert.ok(mail.text.includes(shown), 'the same link in the e-mail');
    assert.doesNotMatch(mail.text, new RegExp(`Smoke ${stamp}`), 'the note never reaches the tester');
    links.push(shown);
  }
  await page.reload();
  for (const address of new Set(addresses)) assert.match(await page.textContent(SECTION), new RegExp(address.replace(/\./g, '\\.')), 'listed');
  assert.ok((await page.locator(`${SECTION} .status-pill:has-text("In attesa")`).count()) >= addresses.length, 'waiting');
  await kit.logout(page);
  return links;
}

/** After the registrations: each confirmed one shows its company on the invitation it used. */
export async function invitesUsed({ BASE, page, kit, ADMIN, companies }) {
  step('the invitations used name the company they made; a used one has no actions left');
  await kit.login(page, ADMIN.email, ADMIN.password);
  await page.goto(`${BASE}/it/app/admin`);
  for (const c of companies) {
    const row = page.locator(`${SECTION} tr:has(.status-pill:has-text("Usato — ${c}"))`);
    assert.equal(await row.count(), 1, `used by ${c}`);
    assert.equal(await row.locator('button').count(), 0, `${c}: neither «Invia di nuovo» nor «Revoca»`);
  }
  await kit.logout(page);
}
