// The smoke test's rights matrix (round 42, /app/permessi), with the self-registered company of smoke-accounts.mjs: its
// owner (Titolare) and the colleague it invited, a Tecnico by default. The owner sees the matrix (its own column lit
// and locked, the rights never given locked for every colleague), takes the calculations away from the Tecnico and
// saves with the dialog's confirmation: the Tecnico can no longer open the calculator of the owner's installation, nor
// sees the way to it; the activity log has the change. «Ripristina predefiniti» for the Tecnico and a save give it back.
// The platform's administrator opens the same company's matrix from /app/admin and changes it; the owner's log says it
// was the platform. The 404 provoked on purpose are cleared from the console's errors.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const cell = (role, cap) => `td.pm-cell[data-role="${role}"][data-cap="${cap}"] input`;

/** A save of the matrix through the dialog; the status says how many rights changed. */
async function saveMatrix(page, n) {
  await page.click('.pm-savebar button.btn-primary');
  await page.waitForSelector('dialog.pm-dialog[open]');
  assert.equal(await page.locator('dialog.pm-dialog .pm-changes li').count(), n, 'the dialog lists the changes');
  await page.click('dialog.pm-dialog button.btn-primary');
  await page.waitForSelector('.pm-msg.ok');
  assert.match(await page.textContent('.pm-msg.ok'), new RegExp(`${n} permess[oi] salvat[oi]`));
}

export async function permessiFlow({ BASE, page, errors, kit, owner, tecnico, admin, company }) {
  const { login, logout, hydrated } = kit;
  step('permissions: the owner takes the calculations away from the Tecnico, who can no longer open the calculator');
  await login(page, owner.email, owner.password);
  // an installation of the owner's company, opened on its calculator
  await page.goto(`${BASE}/it/app/projects/new?kind=replacement`);
  await page.fill('input[name="name"]', 'Impianto dei permessi');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const calcUrl = page.url(), projectUrl = calcUrl.replace(/\/calc$/, '');
  await page.goto(`${BASE}/it/app/permessi`);
  assert.equal(await page.locator('.ws-nav a[href$="/app/permessi"][aria-current="page"]').count(), 1, 'Permessi in the sidebar');
  await hydrated(page, cell('TECHNICIAN', 'calc:create'));
  // the owner's column: lit and locked; what a colleague never has: locked; the company's data only for the Capotecnico
  assert.ok(await page.isChecked(cell('OWNER', 'calc:create')) && await page.isDisabled(cell('OWNER', 'calc:create')), 'the owner\'s column');
  assert.ok(await page.isDisabled(cell('CHIEF_TECHNICIAN', 'users:manage')) && !(await page.isChecked(cell('CHIEF_TECHNICIAN', 'users:manage'))));
  assert.ok(await page.isDisabled(cell('ENGINEER', 'company:export')) && await page.isEnabled(cell('CHIEF_TECHNICIAN', 'company:export')));
  assert.ok(await page.isChecked(cell('TECHNICIAN', 'calc:create')) && !(await page.isChecked(cell('TECHNICIAN', 'progetto:edit'))), 'the default matrix');
  await page.click(cell('TECHNICIAN', 'calc:create'));
  assert.match(await page.textContent('.pm-msg'), /1 modifica non salvata/);
  await saveMatrix(page, 1);
  await page.goto(`${BASE}/it/app/audit`);
  assert.match(await page.textContent('main table'), /Permessi cambiati[\s\S]*Tecnico · Fare i calcoli dell’argano[^:]*: sì → no/, 'the change in the activity log');
  await logout(page);

  await login(page, tecnico.email, tecnico.password);
  assert.equal((await page.goto(calcUrl)).status(), 404, 'the calculator of a Tecnico without the calculations');
  await page.goto(projectUrl);
  assert.equal(await page.locator(`main a[href$="${new URL(calcUrl).pathname}"]`).count(), 0, 'no way to the calculator');
  assert.equal(await page.locator('.ws-nav a[href$="/app/permessi"]').count(), 0, 'no Permessi for a colleague');
  assert.equal((await page.goto(`${BASE}/it/app/permessi`)).status(), 404, 'the matrix of a colleague');
  errors.length = 0; // provoked on purpose
  await page.goto(`${BASE}/it/app`);
  await logout(page);

  step('permissions: «Ripristina predefiniti» gives the Tecnico the calculations back');
  await login(page, owner.email, owner.password);
  await page.goto(`${BASE}/it/app/permessi`);
  await hydrated(page, 'th[data-role="TECHNICIAN"] .pm-reset');
  await page.click('th[data-role="TECHNICIAN"] .pm-reset');
  assert.ok(await page.isChecked(cell('TECHNICIAN', 'calc:create')));
  await saveMatrix(page, 1);
  await logout(page);
  await login(page, tecnico.email, tecnico.password);
  assert.equal((await page.goto(calcUrl)).status(), 200, 'the calculator again');
  await page.goto(`${BASE}/it/app`);
  await logout(page);

  step('permissions: the platform changes the company\'s matrix; the owner\'s log says it was the platform');
  await login(page, admin.email, admin.password);
  await page.goto(`${BASE}/it/app/admin`);
  await Promise.all([page.waitForURL(/\/app\/admin\/permessi\/[a-z0-9]+$/), page.click(`tr:has-text("${company}") a.admin-perm`)]);
  assert.match(await page.textContent('h1'), new RegExp(company));
  await hydrated(page, cell('SALES', 'prices:view'));
  await page.click(cell('SALES', 'prices:view'));
  await saveMatrix(page, 1);
  await logout(page);
  await login(page, owner.email, owner.password);
  await page.goto(`${BASE}/it/app/audit`);
  // the newest entries first: the owner's sign-in, then the platform's change
  assert.match(await page.textContent('main table tbody tr:has-text("Piattaforma LiftPilot")'),
    /Permessi cambiati[\s\S]*Piattaforma LiftPilot[\s\S]*Commerciale · Vedere i prezzi e il listino: sì → no/, 'the platform\'s change, attributed to it');
  await page.goto(`${BASE}/it/app`);
  await logout(page);
}
