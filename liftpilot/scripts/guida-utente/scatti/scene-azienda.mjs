// Scenes of the guide's screenshots: the company's own pages (logo, rights, prices, subscription, colleagues, activity
// log, norms), the reports and the platform administrator's pages, the terms' states the pages cannot reach.
import assert from 'node:assert/strict';
import { step } from '../../smoke-kit.mjs';
import { COMPANY, DOMAIN, PEOPLE, as, fresh, goto, hydrated, linkIn, open, sink, skip } from './ambiente.mjs';
import { logoPng } from './disegni.mjs';
import { shot } from './scatto.mjs';

const cell = (role, cap) => `td.pm-cell[data-role="${role}"][data-cap="${cap}"] input`;

/** Invites a colleague from the team page of `page`; the invitation e-mail (`mail` false: none is waited for). */
async function invite(page, p, mail = true) {
  await goto(page, '/it/app/team');
  await hydrated(page, 'main form.panel button[type="submit"]');
  const f = 'main form.panel:has(input[name="email"])';
  const since = Date.now();
  await page.fill(`${f} input[name="name"]`, p.name);
  await page.fill(`${f} input[name="email"]`, p.email);
  await page.selectOption(`${f} select[name="role"]`, p.role);
  await page.click(`${f} button[type="submit"]`);
  await page.waitForSelector(`${f} .alert-ok, ${f} .alert-bad`);
  return mail ? sink.next(p.email, since) : null;
}

export async function azienda() {
  step('company pages: logo, permissions matrix, prices, subscription, colleagues, activity log, norms');
  const { page } = await as('owner');

  // «Permesso non concesso»: a colleague without the right of the page he opens (the Tecnico has no prices)
  const tec = await as('technician');
  await goto(tec.page, '/it/app/prices');
  await tec.page.waitForSelector('main h1:has-text("Permesso non concesso")');
  await shot('app-permesso', tec.page);

  // the company page with its logo
  await goto(page, '/it/app/company');
  await page.setInputFiles('input[name="logo"]', { name: 'logo-ascensori-esempio.png', mimeType: 'image/png', buffer: logoPng(20, 120, 150) });
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('.logo-preview img');
  await goto(page, '/it/app/company');
  await page.waitForSelector('.logo-preview img');
  await shot('azienda-pagina', page, { clip: { x: 0, y: 0, width: 1440, height: 1150 } });

  // the permissions matrix: changes made and not saved, the dialog that asks, saved (the Capotecnico may export); then the
  // Capotecnico's right to link surveys put back
  await goto(page, '/it/app/permessi');
  await hydrated(page, cell('TECHNICIAN', 'calc:create'));
  await page.click(cell('CHIEF_TECHNICIAN', 'company:export'));
  await page.click(cell('CHIEF_TECHNICIAN', 'rilievi:link'));
  await page.click(cell('TECHNICIAN', 'rilievi:link'));
  await page.waitForSelector('.pm-savebar');
  await shot('permessi-matrice', page, { tall: 1500, clipFn: async () => ({ x: 270, y: 0, width: 1170, height: 1100 }), keepBar: true });
  await page.click('.pm-savebar button.btn-primary');
  await page.waitForSelector('dialog.pm-dialog[open]');
  await shot('permessi-conferma', page);
  await page.click('dialog.pm-dialog button.btn-primary');
  await page.waitForSelector('.pm-msg.ok');
  await page.click(cell('CHIEF_TECHNICIAN', 'rilievi:link'));
  await page.click('.pm-savebar button.btn-primary');
  await page.waitForSelector('dialog.pm-dialog[open]');
  await page.click('dialog.pm-dialog button.btn-primary');
  await page.waitForFunction(() => /1 permess[oi] salvat[oi]/.test(globalThis.document.querySelector('.pm-msg.ok')?.textContent ?? ''));

  // the Capotecnico may export the company's data now, not change its logo; and he sees the price list, not changes it
  const chief = await as('chief');
  await goto(chief.page, '/it/app/company');
  await chief.page.waitForSelector('main h1');
  await shot('azienda-sola-lettura', chief.page, { clip: { x: 0, y: 0, width: 1440, height: 1050 } });
  await goto(chief.page, '/it/app/prices');
  await shot('listino-lettura', chief.page, { clip: { x: 0, y: 0, width: 1440, height: 1100 } });

  // the price list of the owner: a price, a free line
  await goto(page, '/it/app/prices');
  const form = 'main form:has(input[name^="p:"])', free = 'section[aria-labelledby="pg-free"]';
  await hydrated(page, `${form} button[type="submit"]`);
  await page.locator('main input[name="p:car"]').fill('12.500,00');
  const n = await page.locator(`${free} input[name$=":text"]`).count();
  await page.click(`${free} button:has-text("Aggiungi una voce")`);
  await page.fill(`main input[name="c:${n}:text"]`, 'Ponteggio per il vano');
  await page.fill(`main input[name="c:${n}:price"]`, '150,00');
  await page.selectOption(`main select[name="c:${n}:basis"]`, 'STOP');
  await page.click(`${form} button[type="submit"]`);
  await page.waitForSelector('main .alert-ok');
  await shot('listino-pagina', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });

  // the subscription (the band under the top bar exists only in a trial, with a failed payment or read-only)
  await goto(page, '/it/app/billing');
  await page.waitForSelector('main .status-pill');
  await shot('abbonamento-pagina', page, { clip: { x: 0, y: 0, width: 1440, height: 1150 } });
  if (await page.locator('.billing-banner').count()) await shot('abbonamento-fascia', page.locator('.billing-banner').first(), { pad: 4 });
  else skip('abbonamento-fascia', 'no band «Abbonamento»: the server has no billing (free beta)');

  // the colleagues: one more who chooses a password, one invitation waiting; a new password asked (by e-mail)
  const extra = { name: 'Elena Villa', email: `elena.villa@${DOMAIN}`, role: 'SALES', password: 'Esempio-Villa-2026' };
  const mail = await invite(page, extra);
  assert.ok(mail, 'the invitation e-mail of the colleague');
  const c = await fresh();
  await open(c.page, linkIn(mail, 'invite'));
  await c.page.waitForSelector('input[name="next"]');
  await c.page.fill('input[name="next"]', extra.password);
  await c.page.fill('input[name="confirm"]', extra.password);
  await Promise.all([c.page.waitForURL(/\/it\/app$/), c.page.click('main form button[type="submit"]')]);
  await c.ctx.close();
  await invite(page, { name: 'Matteo Pozzi', email: `matteo.pozzi@${DOMAIN}`, role: 'TECHNICIAN' });
  await goto(page, '/it/app/team');
  await hydrated(page, 'main form.panel button[type="submit"]');
  await page.locator('tr:has-text("Elena Villa") button:has-text("Nuova password")').click();
  await page.waitForSelector('tr:has-text("Elena Villa") .note[role="status"], tr:has-text("Elena Villa") .secret');
  await shot('utenti-pagina', page, { clip: { x: 0, y: 0, width: 1440, height: 1700 } });
  // the temporary password shown once (a server without mail, or the platform administrator): taken on the
  // administrator's own team page, the account made for it deleted again
  const admin = await as('admin');
  const moro = { name: 'Davide Moro', email: `davide.moro@${DOMAIN}`, role: 'TECHNICIAN' };
  await invite(admin.page, moro, false);
  const f = 'main form.panel:has(input[name="email"])';
  await admin.page.waitForSelector(`${f} .secret`);
  await shot('utenti-password', admin.page.locator(`${f} .alert-ok`), { pad: 10 });
  await admin.page.reload();
  await hydrated(admin.page, 'main form.panel button[type="submit"]');
  const row = `tr:has-text("${moro.email}")`;
  await Promise.all([admin.page.waitForLoadState('networkidle'), admin.page.locator(`${row} button:has-text("Disattiva")`).click()]);
  await admin.page.locator(`${row} details summary`).click();
  await admin.page.locator(`${row} details button[type="submit"]`).click();
  await admin.page.waitForLoadState('networkidle');

  // the activity log and the norms' register
  for (const [id, path, height] of [['registro-pagina', '/it/app/audit', 1100], ['norme-pagina', '/it/app/norme', 1200]]) {
    await goto(page, path);
    await page.waitForSelector('main table');
    await shot(id, page, { clip: { x: 0, y: 0, width: 1440, height } });
  }
}

export async function admin() {
  step('reports sent by colleagues, handled by the administrator; the companies; the rights of a company on request');
  const send = async (who, kind, message, from) => {
    const { page } = await as(who);
    await goto(page, `/it/app/segnala?da=${encodeURIComponent(from)}`);
    await page.waitForSelector('textarea[name="message"]');
    await page.selectOption('select[name="kind"]', kind);
    await page.fill('textarea[name="message"]', message);
    if (who === 'technician') await shot('app-segnala', page, { clip: { x: 0, y: 0, width: 1440, height: 1000 } });
    await page.click('main form button[type="submit"]');
    await page.waitForSelector('[role="status"]:has-text("Segnalazione inviata")');
    if (who === 'technician') await shot('app-segnala-sent', page, { clip: { x: 0, y: 0, width: 1440, height: 800 } });
  };
  await send('technician', 'BUG', 'Nel rilievo del locale macchina, dopo aver salvato, la pagina torna in cima e non vedo più il messaggio di conferma.', '/it/app/rilievi/nuovo');
  await send('sales', 'QUESTION', 'Posso vedere i prezzi del listino anche dal telefono? Non trovo la voce nel menu.', '/it/app/impianti');
  const { page } = await as('admin');
  await goto(page, '/it/app/admin/segnalazioni');
  await page.waitForSelector('li[data-feedback]');
  await shot('admin-segnalazioni-list', page, { clip: { x: 0, y: 0, width: 1440, height: 1000 } });
  await page.locator('li[data-feedback]', { hasText: 'Posso vedere i prezzi' }).locator('button[type="submit"]').click();
  await page.waitForFunction(() => ![...globalThis.document.querySelectorAll('li[data-feedback]')].some((li) => li.textContent?.includes('Posso vedere i prezzi')));
  await goto(page, '/it/app/admin/segnalazioni?stato=tutte');
  await page.waitForSelector('li[data-feedback]');
  await shot('admin-segnalazioni-all', page, { clip: { x: 0, y: 0, width: 1440, height: 1000 } });

  await goto(page, '/it/app/admin');
  await hydrated(page, 'section[aria-labelledby="beta-title"] form button[type="submit"]');
  await shot('admin-top', page, { clip: { x: 0, y: 0, width: 1440, height: 1200 } });
  await shot('admin-table', page.locator('main > .table-panel'), { pad: 10 });
  // the matrix of the demo company, a right changed and not saved; the dialog with the owner's written request
  await Promise.all([page.waitForURL(/\/app\/admin\/permessi\/[a-z0-9]+$/), page.click(`tr:has-text("${COMPANY}") a.admin-perm`)]);
  await hydrated(page, cell('SALES', 'prices:view'));
  await page.click(cell('SALES', 'prices:view'));
  await page.waitForSelector('.pm-savebar');
  await shot('admin-permessi-matrix', page, { tall: 1500, clipFn: async () => ({ x: 270, y: 0, width: 1170, height: 1100 }), keepBar: true });
  await page.click('.pm-savebar button.btn-primary');
  await page.waitForSelector('dialog.pm-dialog[open]');
  await page.fill('dialog.pm-dialog #pm-request', 'E-mail del Titolare del 20/10/2026 — prezzi nascosti al Commerciale');
  await shot('admin-permessi-confirm', page);
  await page.keyboard.press('Escape');
}

/** The states the pages cannot reach (a terms version older than the one in force), set in the demo database and put back. */
export async function termini() {
  const url = process.env.DEMO_DATABASE_URL ?? '';
  if (!/\/lp_demo(\?|$)/.test(url)) {
    skip(['terms-banner', 'app-terms-clauses'], 'they need an owner who accepted an older terms version, or the one in force without the clauses: set DEMO_DATABASE_URL (a database named lp_demo)');
    return;
  }
  step('terms banner and the clauses’ approval: the owner’s row set in the demo database, put back after');
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const { page } = await as('owner');
    const was = await db.user.findUniqueOrThrow({ where: { email: PEOPLE.owner.email }, select: { id: true, termsVersion: true, clausesApprovedAt: true, termsNoticeVersion: true, termsNoticeAt: true } });
    try {
      // an older version accepted, not yet told about the new one: the band under the top bar
      await db.user.update({ where: { id: was.id }, data: { termsVersion: '5', termsNoticeVersion: null, termsNoticeAt: null } });
      await goto(page, '/it/app/rilievi');
      await page.waitForSelector('.terms-banner');
      await shot('terms-banner', page, { clip: { x: 0, y: 0, width: 1440, height: 420 } });
      // the version in force accepted without the clauses: they are approved once, with the password
      await db.user.update({ where: { id: was.id }, data: { termsVersion: was.termsVersion, clausesApprovedAt: null } });
      await goto(page, '/it/app/terms');
      await page.waitForSelector('main input[name="clauses"]');
      await page.fill('main input[name="password"]', PEOPLE.owner.password);
      await shot('app-terms-clauses', page, { clip: { x: 0, y: 0, width: 1440, height: 900 } });
    } finally {
      await db.user.update({ where: { id: was.id }, data: { termsVersion: was.termsVersion, clausesApprovedAt: was.clausesApprovedAt, termsNoticeVersion: was.termsNoticeVersion, termsNoticeAt: was.termsNoticeAt } });
    }
  } finally { await db.$disconnect(); }
}
