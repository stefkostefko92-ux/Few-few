// End-to-end check of a running portal in a real Chromium: sign-in, a full sheet, search, print, PDF,
// an invitation accepted by a new technician, and accessibility (axe-core, WCAG 2.1 AA) on every page,
// in the light and the dark theme. Screenshots land in tests/e2e/shots/ (git-ignored).
//
//   RILIEVI_URL=http://127.0.0.1:4330 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
//
// The account needs users:manage (MASTER or ADMIN). It creates real records — run it against a local
// or staging portal, never production.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.env.RILIEVI_URL ?? 'http://127.0.0.1:4330').replace(/\/+$/, '');
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
if (!email || !password) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD (an account with users:manage).');
  process.exit(2);
}
const shots = join(here, 'shots');
mkdirSync(shots, { recursive: true });
const axeSource = readFileSync(
  createRequire(import.meta.url).resolve('axe-core/axe.min.js'),
  'utf8',
);
const failures = [];
const fail = (message) => {
  failures.push(message);
  console.error(`✘ ${message}`);
};

async function audit(page, name) {
  // page.evaluate is not subject to the page CSP, so axe runs without weakening it.
  await page.evaluate(axeSource);
  const result = await page.evaluate(() =>
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
    }),
  );
  for (const violation of result.violations) {
    if (violation.impact === 'serious' || violation.impact === 'critical') {
      fail(`${name}: ${violation.id} (${violation.impact}) × ${violation.nodes.length}`);
    }
  }
}

async function signIn(page, who, secret) {
  await page.goto(`${base}/accesso`);
  await page.fill('#email', who);
  await page.fill('#password', secret);
  await page.click('form button[type=submit]');
  await page.waitForURL(/\/(schede|account)/);
}

// The real input sits under its label (visually a tick box); a DOM click is what a tap on the label does,
// and it is not intercepted by the sticky save bar when the field scrolls under it.
const tick = (page, name, value) =>
  page.locator(`input[name=${name}][value=${value}]`).evaluate((input) => {
    if (!input.checked) input.click();
  });

const browser = await chromium.launch();
let sheetUrl = '';
try {
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${scheme}: page error ${error.message}`));
    await page.goto(`${base}/accesso`);
    await audit(page, `${scheme} login`);
    await page.screenshot({ path: join(shots, `${scheme}-login.png`), fullPage: true });
    await signIn(page, email, password);

    if (scheme === 'light') {
      await page.goto(`${base}/schede/nuova`);
      const fields = {
        indirizzo: 'Via Giuseppe Verdi 14, 20121 Milano',
        marca: 'Schindler',
        matricola: '0033871',
        numeroImpianto: String(Date.now()).slice(-6),
        portataKg: '630',
        capienzaPersone: '8',
        fermate: '6',
        ubicazioneCassettina: '-1',
        parcheggio: 'Cortile interno',
        funiDiametroMm: '10,5',
        funiTrefoli: '8',
        funiNumero: '4',
        funiLunghezzaM: '42,75',
        limitatoreTipo: 'Montanari',
        funicellaDiametroMm: '6',
        funicellaLunghezzaM: '45',
        tenditore: 'A peso',
        caviNumero: '2',
        caviConduttori: '24',
        caviLunghezzaM: '30',
        noteQuadretto: 'Interruttore generale da sostituire',
        noteImpianto: 'Бележка на български — città, perché',
        noteBottoniere: 'Pulsante usurato al piano 2',
        lavoriExtra: 'Buono di lavoro n. 512',
      };
      for (const [key, value] of Object.entries(fields)) await page.fill(`#f-${key}`, value);
      await tick(page, 'ubicazioneMacchina', 'ALTO');
      await tick(page, 'tipoImpianto', 'ELETTRICO');
      await tick(page, 'tipoPorte', 'AUTOMATICHE');
      await tick(page, 'serrature', 'si');
      await page.fill('#f-serratureNumero', '6');
      await page.fill('#f-serratureTipo', 'Elettromeccaniche');
      await page.click('.actions button[type=submit]');
      await page.waitForURL(/\/schede\/[a-z0-9]+$/);
      sheetUrl = page.url();
      if (!(await page.textContent('.plate')).includes(fields.numeroImpianto))
        fail('plate without the number');

      await page.goto(`${base}/schede`);
      await page.fill('#q', '3387 verdi');
      await page.waitForFunction(
        () => document.querySelectorAll('[data-results] .row-link').length > 0,
      );
      const pdf = await page.request.get(`${sheetUrl}/pdf`);
      const body = await pdf.body();
      if (pdf.status() !== 200 || body.subarray(0, 5).toString() !== '%PDF-') fail('PDF download');
    }

    for (const [name, path] of [
      ['list', '/schede?q=verdi'],
      ['new', '/schede/nuova'],
      ['sheet', new URL(sheetUrl).pathname],
      ['users', '/utenti'],
      ['account', '/account'],
    ]) {
      await page.goto(base + path);
      await audit(page, `${scheme} ${name}`);
      await page.screenshot({ path: join(shots, `${scheme}-${name}.png`), fullPage: true });
    }
    await page.goto(`${sheetUrl}/stampa`);
    await audit(page, `${scheme} print`);
    await page.screenshot({ path: join(shots, `${scheme}-print.png`), fullPage: true });

    const phone = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await phone.newPage();
    await signIn(mobile, email, password);
    for (const [name, path] of [
      ['list', '/schede?q=verdi'],
      ['sheet', new URL(sheetUrl).pathname],
    ]) {
      await mobile.goto(base + path);
      const overflow = await mobile.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      if (overflow) fail(`${scheme} mobile ${name}: horizontal scroll`);
      // The phone layout hides labels behind icons: check that every control keeps its name.
      await audit(mobile, `${scheme} mobile ${name}`);
      await mobile.screenshot({
        path: join(shots, `${scheme}-mobile-${name}.png`),
        fullPage: true,
      });
    }
    await phone.close();
    await context.close();
  }

  // An invitation, accepted in a fresh browser: the technician signs in and cannot manage users.
  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await signIn(adminPage, email, password);
  await adminPage.goto(`${base}/utenti/invita`);
  const invited = `tecnico.e2e.${Date.now()}@rilievi.test`;
  await adminPage.fill('#email', invited);
  await adminPage.selectOption('#role', 'TECNICO');
  await adminPage.click('form button[type=submit]');
  const link = await adminPage.inputValue('#link');
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(link.replace(/^https?:\/\/[^/]+/, base));
  await audit(guestPage, 'invite');
  await guestPage.fill('#name', 'Tecnico E2E');
  await guestPage.fill('#password', 'Fune-Trefolo-Tenditore-7');
  await guestPage.fill('#confirm', 'Fune-Trefolo-Tenditore-7');
  await guestPage.click('form button[type=submit]');
  await guestPage.waitForURL(/\/schede/);
  const users = await guestPage.goto(`${base}/utenti`);
  if (users?.status() !== 403) fail(`technician sees /utenti (${users?.status()})`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`✔ e2e: all flows pass, no serious accessibility violations. Screenshots: ${shots}`);
