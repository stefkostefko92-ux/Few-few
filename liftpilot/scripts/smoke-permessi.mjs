// The smoke test's rights matrix (round 42, /app/permessi), with the self-registered company of smoke-accounts.mjs: its
// owner (Titolare) and the colleague it invited, a Tecnico by default. The owner sees the matrix (its own column always
// granted and locked, the rights never given locked for every colleague with the rule written under the action), sees
// which rights go with a prerequisite, takes the calculations away from the Tecnico and saves with the dialog's
// confirmation (the outcome takes the focus): the Tecnico can no longer open the calculator of the owner's installation —
// a page in the application says the role lacks that right —, nor sees the way to it; the activity log has the change.
// «Ripristina predefiniti» for the Tecnico and a save give it back; the Tecnico creates a whole project, which he does
// not draw, and lands on its page (never a 404). The platform's administrator opens the same company's matrix from
// /app/admin and changes it on the owner's request; the owner's log says it was the platform, and on which request. In
// its own company (/app/permessi) the platform saves with no request to refer to. The 404 provoked on purpose are cleared
// from the console's errors.
import assert from 'node:assert/strict';
import { step } from './smoke-kit.mjs';

const cell = (role, cap) => `td.pm-cell[data-role="${role}"][data-cap="${cap}"] input`;

/** A save of the matrix through the dialog; the status says how many rights changed. */
async function saveMatrix(page, n, request = null) {
  await page.click('.pm-savebar button.btn-primary');
  await page.waitForSelector('dialog.pm-dialog[open]');
  assert.equal(await page.locator('dialog.pm-dialog .pm-changes li').count(), n, 'the dialog lists the changes');
  // the platform saves only with the reference of the owner's written request (terms, artt. 4 and 9)
  assert.equal(await page.locator('dialog.pm-dialog #pm-request').count(), request ? 1 : 0, 'the request\'s reference only for the platform');
  if (request) {
    assert.ok(await page.locator('dialog.pm-dialog button.btn-primary').isDisabled(), 'no save without the reference');
    await page.fill('dialog.pm-dialog #pm-request', request);
  }
  await page.click('dialog.pm-dialog button.btn-primary');
  await page.waitForSelector('.pm-msg.ok');
  assert.match(await page.textContent('.pm-msg.ok'), new RegExp(`${n} permess[oi] salvat[oi]`));
}

export async function permessiFlow({ BASE, page, errors, kit, owner, tecnico, admin, company }) {
  const { login, logout, hydrated } = kit;
  step('permissions: the owner takes the calculations away from the Tecnico, who can no longer open the calculator');
  await login(page, owner.email, owner.password);
  // an installation of the owner's company, opened on its «Calcolo argano»
  await page.goto(`${BASE}/it/app/projects/new`);
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
  // the owner's column says what it is; a row locked for colleagues says its rule
  assert.equal(await page.locator(`td.pm-cell[data-role="OWNER"][data-cap="calc:create"] .pm-lockbadge`).count(), 1, 'the owner\'s check with its lock');
  assert.match(await page.textContent('.pm-legend'), /sempre concesso \(Titolare\)/);
  assert.match(await page.textContent('tr:has(td.pm-cell[data-cap="users:manage"]) th.pm-action'), /Solo del Titolare/);
  // the company's right names both things it gives: the logo and the order of the survey sheets' sections
  assert.match(await page.textContent('tr:has(td.pm-cell[data-cap="company:edit"]) th.pm-action'), /Cambiare il logo dell’azienda e l’ordine delle sezioni delle schede di rilievo/);
  // a prerequisite taken away takes its dependents, and a line says which; discarded
  await page.click(cell('TECHNICIAN', 'projects:view'));
  assert.match(await page.textContent('.pm-cascade'), /Tolti anche a Tecnico[^:]*:.*Calcolo argano: scegliere il tipo di intervento/);
  await page.click('.pm-savebar button.btn-ghost');
  assert.ok(await page.isChecked(cell('TECHNICIAN', 'projects:view')) && await page.isChecked(cell('TECHNICIAN', 'calc:create')));
  await page.click(cell('TECHNICIAN', 'calc:create'));
  assert.match(await page.textContent('.pm-msg'), /1 modifica non salvata/);
  await saveMatrix(page, 1);
  assert.equal(await page.locator('.pm-msg:focus').count(), 1, 'the outcome of the save has the focus');
  await page.goto(`${BASE}/it/app/audit`);
  assert.match(await page.textContent('main table'), /Permessi cambiati[\s\S]*Tecnico · Calcolo argano: scegliere il tipo di intervento[^→]*: concesso → non concesso/, 'the change in the activity log');
  await logout(page);

  await login(page, tecnico.email, tecnico.password);
  // the calculator of a Tecnico without the calculations: a page in the application names the right, not the public 404
  assert.equal((await page.goto(calcUrl)).status(), 200);
  assert.match(page.url(), /\/it\/app\/permesso\?p=calc%3Acreate$/, 'the page of the right not given');
  assert.match(await page.textContent('main h1'), /Permesso non concesso/);
  assert.match(await page.textContent('main .lead'), /Tecnico[\s\S]*«Calcolo argano: scegliere il tipo di intervento/);
  assert.equal(await page.locator('.ws-shell').count(), 1, 'inside the application');
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
  assert.match(page.url(), /\/calc$/);
  // an installation created by a Tecnico opens on its «Calcolo argano» (round 45: his to make, of any type); the
  // Progetto, which he does not draw, is not linked from its empty page (never /progetto's 404)
  await page.goto(`${BASE}/it/app/projects/new`);
  assert.equal(await page.locator('main form .alert-info').count(), 0, 'the calculation is his: nothing said of a colleague');
  await page.fill('input[name="name"]', 'Impianto del Tecnico');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  await page.goto(page.url().replace(/\/calc$/, ''));
  assert.equal(await page.locator('main a[href*="/progetto"]').count(), 0, 'no way to the form he cannot fill');
  await page.goto(`${BASE}/it/app`);
  await logout(page);

  step('permissions: the platform changes the company\'s matrix on the owner\'s request; the owner\'s log says it was the platform, and on which request');
  await login(page, admin.email, admin.password);
  await page.goto(`${BASE}/it/app/admin`);
  await Promise.all([page.waitForURL(/\/app\/admin\/permessi\/[a-z0-9]+$/), page.click(`tr:has-text("${company}") a.admin-perm`)]);
  assert.match(await page.textContent('h1'), new RegExp(company));
  await hydrated(page, cell('SALES', 'prices:view'));
  await page.click(cell('SALES', 'prices:view'));
  await saveMatrix(page, 1, '12/10/2026 — prezzi del Commerciale');
  await logout(page);
  await login(page, owner.email, owner.password);
  await page.goto(`${BASE}/it/app/audit`);
  // the newest entries first: the owner's sign-in, then the platform's change
  assert.match(await page.textContent('main table tbody tr:has-text("Piattaforma LiftPilot")'),
    /Permessi cambiati[\s\S]*Piattaforma LiftPilot[\s\S]*Commerciale · Vedere i prezzi e il listino: concesso → non concesso · su richiesta del Titolare: 12\/10\/2026 — prezzi del Commerciale/,
    'the platform\'s change, attributed to it, with the owner\'s request');
  await page.goto(`${BASE}/it/app`);
  await logout(page);

  step('permissions: the platform changes its own company\'s matrix on /app/permessi, with no request to refer to');
  await login(page, admin.email, admin.password);
  await page.goto(`${BASE}/it/app/admin`);
  assert.equal(await page.locator('a.admin-perm[href$="/app/permessi"]').count(), 1, 'its own company\'s Permessi: /app/permessi');
  await page.goto(`${BASE}/it/app/permessi`);
  await hydrated(page, cell('SALES', 'prices:view'));
  // whatever the box says now, changed and then put back: the platform's own company keeps its matrix
  const was = await page.isChecked(cell('SALES', 'prices:view'));
  await page.click(cell('SALES', 'prices:view'));
  await saveMatrix(page, 1);
  await page.goto(`${BASE}/it/app/audit`);
  const own = await page.textContent('main table tbody tr:has-text("Permessi cambiati")');
  assert.match(own, /Piattaforma LiftPilot[\s\S]*Commerciale · Vedere i prezzi e il listino/, 'its own change, attributed to the platform');
  assert.doesNotMatch(own, /su richiesta del Titolare/, 'no request in its own company');
  await page.goto(`${BASE}/it/app/permessi`);
  await hydrated(page, cell('SALES', 'prices:view'));
  await page.click(cell('SALES', 'prices:view'));
  await saveMatrix(page, 1);
  assert.equal(await page.isChecked(cell('SALES', 'prices:view')), was, 'put back');
  await page.goto(`${BASE}/it/app`);
  await logout(page);
}
