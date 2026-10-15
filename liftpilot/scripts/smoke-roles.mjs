// The smoke test's refusals: an archived installation is read only, and a colleague with the role Tecnico (made by the
// administrator with a temporary password, changed at the first sign-in) sees no prices, manages nobody, cannot export
// the company's data — and, on the survey sheets, reads and edits them but neither moves one to the trash nor opens the
// trash (src/lib/rbac.ts). A right the company could give the role and did not opens the page that says so
// (/app/permesso); what no colleague ever has does not exist (404). The 404 and 403 provoked on purpose are cleared from
// the console's errors.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

export async function archivedReadOnly({ page, hydrated, projectUrl, errors }) {
  step('an archived installation is read only');
  await page.goto(projectUrl);
  await hydrated(page, 'main form:has(input[name="archive"][value="1"]) button');
  await Promise.all([page.waitForLoadState('networkidle'), page.click('main form:has(input[name="archive"][value="1"]) button')]);
  await page.waitForSelector('main form:has(input[name="archive"][value="0"])');
  assert.equal((await page.goto(`${projectUrl}/edit`)).status(), 404, 'edit of an archived installation');
  assert.equal((await page.goto(`${projectUrl}/calc`)).status(), 404, 'new calculation on an archived installation');
  await page.goto(projectUrl);
  await hydrated(page, 'main form:has(input[name="archive"][value="0"]) button');
  await page.click('main form:has(input[name="archive"][value="0"]) button');
  await page.waitForSelector('main form:has(input[name="archive"][value="1"])');
  errors.length = 0; // the two 404 above were provoked on purpose
}

/** A page whose right the company did not give the role: the page in the application that names it. */
async function denied(page, url, right, what) {
  assert.equal((await page.goto(url)).status(), 200, what);
  assert.equal(new URL(page.url()).pathname, '/it/app/permesso', what);
  assert.equal(new URL(page.url()).searchParams.get('p'), right, what);
  assert.match(await page.textContent('main h1'), /Permesso non concesso/, what);
}

export async function technician({ BASE, page, errors, stamp, login, logout, hydrated, rilievoUrl }) {
  step('new user with a temporary password');
  await page.goto(`${BASE}/it/app/team`);
  const userEmail = `tecnico.${stamp}@example.com`;
  await page.fill('main form input[name="name"]', 'Tecnico di prova');
  await page.fill('main form input[name="email"]', userEmail);
  await page.click('main form:has(input[name="email"]) button[type="submit"]');
  const temp = (await page.locator('.secret').first().textContent())?.trim() ?? '';
  assert.equal(temp.length, 16);
  await logout(page);
  await login(page, userEmail, temp);
  assert.match(page.url(), /account\?first=1/, 'must change the password first');
  const next = `Nuova${stamp}Password9`;
  await page.fill('input[name="current"]', temp);
  await page.fill('input[name="next"]', next);
  await page.fill('input[name="confirm"]', next);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('.alert-ok');
  await page.goto(`${BASE}/it/app`);
  assert.match(page.url(), /\/it\/app$/);
  // a Tecnico sees no prices (a right the company may give: its page says so) and manages nobody (never: 404)
  await denied(page, `${BASE}/it/app/prices`, 'prices:view', 'price list of a Tecnico');
  assert.equal((await page.goto(`${BASE}/it/app/team`)).status(), 404, 'team page of a Tecnico');
  // round 45: a Tecnico creates an installation and makes its «Calcolo argano» of any type — here a transformation —; the
  // Progetto is the Progettista's: its page names whose the next step is, /progetto the right it needs
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Impianto del Tecnico ${stamp}`);
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const tecProject = page.url().replace(/\/calc$/, '');
  await hydrated(page, '#Q');
  await page.click('.controls button:has-text("Esempio A")');
  await page.click('label.intervento-tipo[data-tipo="TRASFORMAZIONE_COMPLETA"]');
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.match(await page.textContent('.calc-ruolo'), /Trasformazione completa/, 'a Tecnico saves a transformation');
  await denied(page, `${tecProject}/progetto`, 'progetto:edit', 'the Progetto of a Tecnico');
  await page.goto(tecProject);
  assert.match(await page.textContent('main'), /Il progetto lo disegna un collega che ne ha il permesso/, 'whose the next step is');
  assert.equal((await page.request.get(`${BASE}/api/company/export`)).status(), 403, 'company export by a Tecnico');
  // the survey sheets: read and edited by a Tecnico, never moved to the trash by one
  await page.goto(rilievoUrl);
  assert.equal(await page.locator(`main a[href$="${new URL(rilievoUrl).pathname}/modifica"]`).count(), 1, 'a Tecnico edits a survey sheet');
  assert.equal(await page.locator('main a[href$="/elimina"]').count(), 0, 'no «Elimina» for a Tecnico');
  await denied(page, `${rilievoUrl}/elimina`, 'rilievi:trash', 'trash a survey sheet as a Tecnico');
  await denied(page, `${BASE}/it/app/rilievi/cestino`, 'rilievi:trash-manage', 'the trash of a Tecnico');
  errors.length = 0; // provoked on purpose
  await page.goto(`${BASE}/it/app`);
  await logout(page);
}
