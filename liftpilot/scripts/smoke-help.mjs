// The smoke test's round-48 steps: the public guide (/guida: 200, one H1, the structured data, the footer's link and the
// credit), the survey sheet that keeps its data without signal (offline while saving: the form stays, with the alert, and
// saves when the network is back), «Segnala un problema» (sent from an error page's address, read and handled by the
// administrator; with the mail sink, the administrators' e-mail says that a report arrived, never its text) and «Primi
// passi» on the Rilievi home of a company that has nothing yet.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function guidePage({ BASE, page }) {
  step('the quick guide');
  const res = await page.goto(`${BASE}/it/guida`);
  assert.equal(res.status(), 200);
  assert.equal(await page.locator('h1').count(), 1, 'one H1');
  const types = await page.evaluate(() => [...globalThis.document.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((s) => JSON.parse(s.textContent ?? '{}')['@graph'].map((n) => n['@type'])));
  for (const t of ['Organization', 'WebSite', 'BreadcrumbList', 'HowTo']) assert.ok(types.includes(t), `JSON-LD ${t}`);
  assert.match(await page.getAttribute('link[rel="canonical"]', 'href') ?? '', /\/it\/guida$/);
  assert.match(await page.getAttribute('meta[name="keywords"]', 'content') ?? '', /Carbon Stealth/);
  assert.equal(await page.locator('footer a[href="/it/guida"]').count(), 1, 'the footer leads to the guide');
  assert.equal(await page.locator('.footer-credit[lang="en"] a[href="https://carbonstealth.eu"][target="_blank"]').count(), 1, 'the credit');
}

export async function rilievoOffline({ BASE, page, errors }) {
  step('a survey sheet saved without signal keeps its data');
  await page.goto(`${BASE}/it/app/rilievi/nuovo`);
  await page.waitForSelector('form[data-live="1"]');
  await page.fill('input[name="indirizzo"]', 'Via del Pozzo 7, Bergamo');
  await page.fill('input[name="matricola"]', '0770077');
  const save = page.locator('form[data-scheda-form] .savebar button[type="submit"]').first();
  await page.context().setOffline(true);
  await save.click();
  const alert = page.locator('[role="alert"]', { hasText: 'Connessione assente' });
  await alert.waitFor();
  assert.equal(await page.inputValue('input[name="indirizzo"]'), 'Via del Pozzo 7, Bergamo', 'the data stay in the form');
  assert.equal(await page.evaluate(() => globalThis.document.activeElement?.getAttribute('role')), 'alert', 'the alert has the focus');
  assert.ok(await page.locator('.rv-dirty').isVisible(), 'still unsaved: the question before leaving stays');
  await page.context().setOffline(false);
  await Promise.all([page.waitForURL(/\/it\/app\/rilievi\/[a-z0-9]+\?ok=schedaCreated$/), save.click()]);
  // the browser's own line for the request that could not leave is expected here, nothing else
  for (let i = errors.length - 1; i >= 0; i--) if (/ERR_INTERNET_DISCONNECTED/.test(errors[i])) errors.splice(i, 1);
}

export async function reportFlow({ BASE, page, stamp, sink, ADMIN }) {
  step('«Segnala un problema»: sent, read and handled by the administrator');
  const text = `Smoke ${stamp}: il salvataggio\nnon riesce.`;
  await page.goto(`${BASE}/it/app/segnala?codice=smoke${stamp}&da=/it/app/rilievi/nuovo?x=1`);
  assert.equal(await page.locator('.feedback-meta dd', { hasText: '/app/rilievi/nuovo' }).count(), 1, 'the page, path only');
  await page.waitForSelector('textarea[name="message"]');
  await page.selectOption('select[name="kind"]', 'BUG');
  await page.fill('textarea[name="message"]', text);
  const since = Date.now();
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('[role="status"]:has-text("Segnalazione inviata")');
  if (sink) {
    const mail = await sink.next(ADMIN.email, since);
    assert.ok(mail, 'the administrators are told');
    assert.match(mail.text, /\/it\/app\/admin\/segnalazioni/);
    assert.ok(!mail.text.includes(`Smoke ${stamp}`), 'never the text of the report');
  }
  await page.goto(`${BASE}/it/app/admin/segnalazioni`);
  const card = page.locator('li[data-feedback]', { hasText: `Smoke ${stamp}` });
  assert.equal(await card.count(), 1);
  assert.equal(await card.locator('.feedback-text').innerText(), text.trim(), 'the text as written, the lines kept');
  await card.locator('button[type="submit"]').click();
  await page.waitForFunction((s) => ![...globalThis.document.querySelectorAll('li[data-feedback]')].some((li) => li.textContent?.includes(s)), `Smoke ${stamp}`);
  await page.goto(`${BASE}/it/app/admin/segnalazioni?stato=tutte`);
  assert.match(await page.locator('li[data-feedback]', { hasText: `Smoke ${stamp}` }).locator('.status-pill').innerText(), /gestita/);
}

export async function firstSteps({ BASE, page }) {
  step('first steps on the home of an empty company');
  await page.goto(`${BASE}/it/app`);
  const panel = page.locator('section[aria-labelledby="primi-passi"]');
  assert.equal(await panel.count(), 1, '«Primi passi»');
  assert.deepEqual(await panel.locator('a.btn').allInnerTexts(), ['Nuova scheda di rilievo', 'Nuovo impianto', 'Leggi la guida'], 'the owner’s buttons');
  // the menu's «Guida» (the same sidebar is the phone's drawer) leaves the work where it is: a new tab, said in words
  const guide = page.locator('.ws-nav a[href="/it/guida"]');
  assert.equal(await guide.getAttribute('target'), '_blank', 'the guide in a new tab');
  assert.equal(await guide.getAttribute('rel'), 'noopener');
  assert.match((await guide.textContent()) ?? '', /Guida \(si apre in una nuova scheda\)/, 'the hint for screen readers');
}
