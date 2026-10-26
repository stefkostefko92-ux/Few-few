// Scenes of the guide's screenshots: the public pages, the demo company with its Titolare and colleagues, the beta's
// invitations and self-registration.
import assert from 'node:assert/strict';
import { step } from '../../smoke-kit.mjs';
import { BASE, COMPANY, DOMAIN, PEOPLE, TESTER, adopt, as, fresh, goto, hydrated, linkIn, open, sink, text } from './ambiente.mjs';
import { between, shot } from './scatto.mjs';

export async function publicPages() {
  step('public pages: home, prices, sign-in, registration without an invitation, terms, data, guide, 404');
  const { ctx, page } = await fresh();
  await goto(page, '/it');
  await shot('home', page, { clip: await between(page, 'header, .site-head, nav', '#prezzi') });
  await goto(page, '/it/pricing');
  await shot('pricing', page, { clip: await between(page, 'main .pub-head, header.pub-head', 'main .pub-section') });
  await goto(page, '/it/login');
  await page.waitForSelector('main form');
  await shot('login', page);
  await page.fill('input[name="email"]', PEOPLE.owner.email);
  await page.fill('input[name="password"]', 'password-sbagliata');
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('main .alert-bad');
  await shot('login-error', page);
  await open(page, `${BASE}/it/register`);
  await page.waitForSelector('main [role="status"] h2');
  await shot('register-invite-only', page);
  for (const [id, path, height] of [['privacy', '/it/privacy', 1000], ['privacy-version', '/it/privacy/5', 1000], ['data', '/it/data', 1100], ['guida', '/it/guida', 1100]]) {
    await goto(page, path);
    await shot(id, page, { clip: { x: 0, y: 0, width: 1440, height } });
  }
  await page.goto(`${BASE}/it/pagina-che-non-esiste`);
  await page.waitForSelector('main h1');
  await shot('404', page);
  await ctx.close();
}

export async function company() {
  step('the platform administrator makes the company with its Titolare');
  const admin = await as('admin');
  await goto(admin.page, '/it/app/admin');
  await hydrated(admin.page, 'main form:has(input[name="ownerEmail"]) button[type="submit"]');
  for (const [k, v] of Object.entries({ name: COMPANY, vatNumber: '01234567897', city: 'Bergamo', ownerName: PEOPLE.owner.name, ownerEmail: PEOPLE.owner.email })) {
    await admin.page.fill(`input[name="${k}"]`, v);
  }
  await admin.page.click('main form:has(input[name="ownerEmail"]) button[type="submit"]');
  await admin.page.waitForSelector('.secret');
  const temp = await text(admin.page.locator('.secret'));

  step('the Titolare: first sign-in with the temporary password, his own password, the terms');
  const o = await fresh();
  await o.page.goto(`${BASE}/it/login`);
  await o.page.fill('input[name="email"]', PEOPLE.owner.email);
  await o.page.fill('input[name="password"]', temp);
  await Promise.all([o.page.waitForURL(/\/it\/app\/account\?first=1$/), o.page.click('main form button[type="submit"]')]);
  await hydrated(o.page, 'main form button[type="submit"]');
  await o.page.fill('input[name="current"]', temp);
  await o.page.fill('input[name="next"]', PEOPLE.owner.password);
  await o.page.fill('input[name="confirm"]', PEOPLE.owner.password);
  await shot('app-account', o.page);
  await o.page.click('main form button[type="submit"]');
  await o.page.waitForSelector('.alert-ok');
  await goto(o.page, '/it/app');
  await hydrated(o.page, 'main form:has(input[name="clauses"]) button');
  for (const k of ['accept', 'business', 'drafts', 'clauses']) await o.page.check(`main input[name="${k}"]`);
  await o.page.fill('main form:has(input[name="clauses"]) input[name="password"]', PEOPLE.owner.password);
  await shot('app-terms', o.page, { clip: { x: 0, y: 0, width: 1440, height: 1050 } });
  await o.page.click('main form:has(input[name="clauses"]) button');
  await o.page.waitForSelector('main form:has(input[name="clauses"])', { state: 'detached' });
  adopt('owner', o, PEOPLE.owner.password);

  step('forgotten password: the form answered, the link of the e-mail');
  const anon = await fresh();
  await goto(anon.page, '/it/forgot-password');
  await anon.page.fill('input[name="email"]', PEOPLE.owner.email);
  const since = Date.now();
  await anon.page.click('main form button[type="submit"]');
  await anon.page.waitForSelector('main .alert-ok');
  await shot('forgot-password', anon.page);
  const mail = await sink.next(PEOPLE.owner.email, since);
  assert.ok(mail, 'the reset e-mail');
  await open(anon.page, linkIn(mail, 'reset-password'));
  await anon.page.waitForSelector('input[name="next"]');
  await anon.page.fill('input[name="next"]', PEOPLE.owner.password);
  await anon.page.fill('input[name="confirm"]', PEOPLE.owner.password);
  await shot('reset-password', anon.page);
  await anon.ctx.close();

  step('the colleagues: invited by e-mail, each chooses the password from the link');
  const form = 'main form:has(input[name="email"][maxlength="254"]):has(select[name="role"])';
  for (const who of ['chief', 'engineer', 'technician', 'sales']) {
    const p = PEOPLE[who];
    await goto(o.page, '/it/app/team');
    await hydrated(o.page, 'main form:has(input[name="email"]) button[type="submit"]');
    const sent = Date.now();
    await o.page.fill(`${form} input[name="name"]`, p.name);
    await o.page.fill(`${form} input[name="email"]`, p.email);
    await o.page.selectOption(`${form} select[name="role"]`, p.role);
    await o.page.click(`${form} button[type="submit"]`);
    await o.page.waitForSelector(`${form} .alert-ok, ${form} .alert-bad`);
    assert.equal(await o.page.locator(`${form} .alert-bad`).count(), 0, `invitation of ${p.name}: ${await o.page.locator(`${form} .alert-bad`).allTextContents()}`);
    const invitation = await sink.next(p.email, sent);
    assert.ok(invitation, `invitation e-mail of ${p.name}`);
    const c = await fresh();
    await open(c.page, linkIn(invitation, 'invite'));
    await c.page.waitForSelector('main form input[name="next"]');
    await c.page.fill('input[name="next"]', p.password);
    await c.page.fill('input[name="confirm"]', p.password);
    if (who === 'chief') await shot('invite', c.page, { clip: await between(c.page, 'main h1', 'main form') });
    await Promise.all([c.page.waitForURL(/\/it\/app$/), c.page.click('main form button[type="submit"]')]);
    adopt(who, c, p.password);
  }
}

export async function beta() {
  step('beta: the administrator invites two testers; the registration form of one link, the confirmation page of the other');
  const admin = await as('admin');
  const SECTION = 'section[aria-labelledby="beta-title"]';
  const invite = async (address, note) => {
    await goto(admin.page, '/it/app/admin');
    await hydrated(admin.page, `${SECTION} form button[type="submit"]`);
    const since = Date.now();
    await admin.page.fill(`${SECTION} input[name="email"]`, address);
    await admin.page.fill(`${SECTION} input[name="note"]`, note);
    await admin.page.click(`${SECTION} form:has(input[name="note"]) button[type="submit"]`);
    await admin.page.waitForSelector(`${SECTION} .secret`);
    const mail = await sink.next(address, since);
    assert.ok(mail, `invitation e-mail to ${address}`);
    return linkIn(mail, 'register');
  };
  const first = await invite(`tester.uno@${DOMAIN}`, 'Richiesta del 12/10/2026 via e-mail');
  const second = await invite(TESTER.email, 'Richiesta del 14/10/2026 via telefono');

  // the first link: the form filled in, not sent
  const anon = await fresh();
  await open(anon.page, first);
  await anon.page.waitForFunction((a) => globalThis.document.querySelector('main input[name="email"]')?.value === a, `tester.uno@${DOMAIN}`);
  for (const [k, v] of Object.entries({ company: 'Impianti Esempio Como S.r.l.', vatNumber: '09876543217', city: 'Como', name: 'Elena Villa', password: 'Esempio-Villa-2026', confirm: 'Esempio-Villa-2026' })) {
    if (await anon.page.locator(`input[name="${k}"]`).count()) await anon.page.fill(`input[name="${k}"]`, v);
  }
  await shot('register-form', anon.page, { clip: await between(anon.page, 'main h1', 'main form', 40) });

  // the second: registered, the e-mail's link, the clauses approved with the password
  await open(anon.page, second);
  await anon.page.waitForFunction((a) => globalThis.document.querySelector('main input[name="email"]')?.value === a, TESTER.email);
  for (const [k, v] of Object.entries({ company: TESTER.company, city: TESTER.city, name: TESTER.name, password: TESTER.password, confirm: TESTER.password })) {
    await anon.page.fill(`input[name="${k}"]`, v);
  }
  for (const k of ['accept', 'business', 'drafts']) await anon.page.check(`input[name="${k}"]`);
  const since = Date.now();
  await anon.page.click('main form button[type="submit"]');
  await anon.page.waitForSelector('main [role="status"] h2, main #register-error');
  const mail = await sink.next(TESTER.email, since);
  assert.ok(mail, 'registration e-mail');
  await open(anon.page, linkIn(mail, 'verify-email'));
  await anon.page.waitForSelector('main input[name="clauses"]');
  await anon.page.check('main input[name="clauses"]');
  await anon.page.fill('main input[name="password"]', TESTER.password);
  await shot('verify-email', anon.page, { clip: { x: 0, y: 0, width: 1440, height: 1300 } });
  await Promise.all([anon.page.waitForURL(/\/it\/app$/), anon.page.click('main form button[type="submit"]')]);
  await anon.ctx.close();
}
