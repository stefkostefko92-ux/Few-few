// A person's page in a real Chromium, as the MASTER and as the company ADMIN: companies and roles,
// name and email, password, access (axe-core WCAG 2.1 AA). The MASTER's own page has no way to switch
// itself off, and the MASTER is not in the ADMIN's list.
import { join } from 'node:path';
import { audit, fail } from './helpers.mjs';

export async function checkPeople({ base, shots, masterPage, adminPage, techEmail }) {
  await masterPage.goto(`${base}/utenti`);
  const href = await masterPage
    .locator('tr', { hasText: techEmail })
    .locator('a.row-link')
    .getAttribute('href');
  if (!href) return fail('the MASTER cannot open the technician');
  await masterPage.goto(base + href);
  await audit(masterPage, 'person (master)');
  if (!(await masterPage.locator('form[action$="/aziende"]').count()))
    fail('the MASTER cannot add the person to another company');
  await masterPage.screenshot({ path: join(shots, 'light-person-master.png'), fullPage: true });

  await adminPage.goto(base + href);
  await audit(adminPage, 'person (admin)');
  if (await adminPage.locator('form[action$="/aziende"]').count())
    fail('a company ADMIN can add people to companies');
  await adminPage.screenshot({ path: join(shots, 'light-person-admin.png'), fullPage: true });

  await adminPage.goto(`${base}/utenti`);
  if (await adminPage.locator('td', { hasText: 'Master' }).count())
    fail('the MASTER shows in the list of a company ADMIN');

  await masterPage.goto(`${base}/utenti`);
  const own = await masterPage
    .locator('tr', { has: masterPage.locator('.badge', { hasText: /^Tu$/ }) })
    .locator('a.row-link')
    .getAttribute('href');
  if (!own) return fail('the MASTER cannot open its own account');
  await masterPage.goto(base + own);
  await audit(masterPage, 'own account (master)');
  if (await masterPage.locator('form[action$="/stato"]').count())
    fail('the MASTER can switch itself off');
  if (!(await masterPage.locator('form[action$="/account"]').count()))
    fail('the MASTER cannot change its own name and email');
}
