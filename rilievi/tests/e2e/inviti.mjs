// The people of a company in a real browser: the MASTER invites the company's ADMIN, the ADMIN invites
// a technician into the same company (never another one); the technician sees the company's sheet but
// not the people or the companies; then the people pages themselves (people.mjs) and the technician's
// two-step sign-in (due-fattori.mjs).
import { audit, fail, signIn as signInAt } from './helpers.mjs';
import { checkTwoFactor } from './due-fattori.mjs';
import { checkPeople } from './people.mjs';

async function acceptInvite(context, base, link, name) {
  const page = await context.newPage();
  await page.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await audit(page, `invite ${name}`);
  await page.fill('#name', name);
  await page.fill('#password', 'Fune-Trefolo-Tenditore-7');
  await page.fill('#confirm', 'Fune-Trefolo-Tenditore-7');
  await page.click('form button[type=submit]');
  await page.waitForURL(/\/schede/);
  return page;
}

export async function checkInvites({
  browser,
  base,
  shots,
  email,
  password,
  aziendaName,
  sheetUrl,
}) {
  const signIn = (page, who, secret) => signInAt(page, base, who, secret);
  const master = await browser.newContext();
  const masterPage = await master.newPage();
  await signIn(masterPage, email, password);
  await masterPage.goto(`${base}/utenti/invita`);
  const stamp = Date.now();
  await masterPage.fill('#email', `admin.e2e.${stamp}@rilievi.test`);
  await masterPage.fill('#name', 'Amministratore E2E');
  await masterPage.selectOption('#azienda', { label: aziendaName });
  await masterPage.selectOption('#role', 'ADMIN');
  await masterPage.click('form button[type=submit]');
  const adminLink = await masterPage.inputValue('#link');
  const adminContext = await browser.newContext();
  const adminPage = await acceptInvite(adminContext, base, adminLink, 'Amministratore E2E');
  await adminPage.goto(`${base}/utenti/invita`);
  if (await adminPage.locator('#azienda').count()) fail('a company ADMIN can pick another company');
  await adminPage.fill('#email', `tecnico.e2e.${stamp}@rilievi.test`);
  await adminPage.fill('#name', 'Tecnico E2E');
  await adminPage.selectOption('#role', 'TECNICO');
  await adminPage.click('form button[type=submit]');
  const techLink = await adminPage.inputValue('#link');
  const techContext = await browser.newContext();
  const techPage = await acceptInvite(techContext, base, techLink, 'Tecnico E2E');
  const users = await techPage.goto(`${base}/utenti`);
  if (users?.status() !== 403) fail(`technician sees /utenti (${users?.status()})`);
  const companies = await techPage.goto(`${base}/aziende`);
  if (companies?.status() !== 403) fail(`technician sees /aziende (${companies?.status()})`);
  const sheet = await techPage.goto(sheetUrl);
  if (sheet?.status() !== 200)
    fail(`technician cannot open the company's sheet (${sheet?.status()})`);
  await checkPeople({
    base,
    shots,
    masterPage,
    adminPage,
    techEmail: `tecnico.e2e.${stamp}@rilievi.test`,
  });
  await checkTwoFactor({
    base,
    shots,
    techPage,
    techEmail: `tecnico.e2e.${stamp}@rilievi.test`,
    password: 'Fune-Trefolo-Tenditore-7',
  });
}
