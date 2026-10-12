// End-to-end check of a running portal in a real Chromium: sign-in, a company with its logo, a full
// sheet (the fields that appear with the door type, the alarm, one measurement row per stop that
// follows "Fermate" while it is typed), search, print, PDF, the company ADMIN invited by the MASTER, a
// technician invited by that ADMIN who sees the company's sheets, and accessibility (axe-core, WCAG 2.1
// AA) on every page, in the light and the dark theme. Screenshots land in tests/e2e/shots/ (git-ignored).
//
//   RILIEVI_URL=http://127.0.0.1:4330 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
//
// The account must be a MASTER (companies are theirs). It creates real records — run it against a
// local or staging portal, never production.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.env.RILIEVI_URL ?? 'http://127.0.0.1:4330').replace(/\/+$/, '');
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
if (!email || !password) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD (a MASTER account).');
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
let aziendaPath = '';
const aziendaName = `Ascensori E2E ${Date.now()}`;
// A logo with transparency, as a company would upload it.
const logoFile = join(shots, 'logo-e2e.png');
await sharp({
  create: {
    width: 900,
    height: 260,
    channels: 4,
    background: { r: 15, g: 50, b: 120, alpha: 0.85 },
  },
})
  .png()
  .toFile(logoFile);

async function acceptInvite(context, link, name) {
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
      // The company first: name and logo, by the MASTER.
      await page.goto(`${base}/aziende/nuova`);
      await page.fill('#name', aziendaName);
      await page.setInputFiles('#logo', logoFile);
      await page.click('form button[type=submit]');
      await page.waitForURL(/\/aziende\/[a-z0-9]+$/);
      aziendaPath = new URL(page.url()).pathname;
      if (!(await page.locator('.logo-paper img').count())) fail('company page without its logo');

      await page.goto(`${base}/schede/nuova`);
      await page.selectOption('#f-azienda', { label: aziendaName });
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
        buonoLavoro: 'BL 2026/512',
        operatoreMarca: 'Selcom',
        lucePorte: '800 x 2000',
        operatoreTensione: '24 V DC',
      };
      // The door operator fields appear with automatic doors: tick first, then fill.
      if (await page.locator('#f-operatoreMarca').isVisible())
        fail('door operator shown too early');
      await tick(page, 'tipoPorte', 'AUTOMATICHE');
      for (const [key, value] of Object.entries(fields)) await page.fill(`#f-${key}`, value);
      await tick(page, 'ubicazioneMacchina', 'ALTO');
      await tick(page, 'tipoImpianto', 'ELETTRICO');
      await tick(page, 'doppioAccesso', 'si');
      await tick(page, 'serrature', 'si');
      await page.fill('#f-serratureNumero', '6');
      await page.fill('#f-serratureTipo', 'Elettromeccaniche');
      await tick(page, 'luceVanoSostituire', 'si');
      await tick(page, 'telesoccorso', 'si');
      await tick(page, 'telesoccorsoStato', 'MANCA_PERIFERICA');
      await tick(page, 'allarmePortineria', 'no');
      // The old push-button panels: one row per stop, following "Fermate" while it is typed.
      await tick(page, 'bottoniereMisure', 'si');
      const rows = () => page.locator('[data-misura]:visible').count();
      if ((await rows()) !== 6) fail(`measurement rows for 6 stops: ${await rows()}`);
      await page.fill('#f-fermate', '8');
      if ((await rows()) !== 8) fail(`measurement rows for 8 stops: ${await rows()}`);
      // Typed in a row that the smaller number then hides: it stays in the page, the server skips it.
      await page.fill('#f-mb-8-lunghezzaMm', 'not a number');
      await page.fill('#f-fermate', '6');
      if ((await rows()) !== 6) fail(`measurement rows back to 6 stops: ${await rows()}`);
      await page.fill('#f-mb-1-piano', 'S1');
      await page.fill('#f-mb-1-lunghezzaMm', '320,5');
      await page.fill('#f-mb-1-larghezzaMm', '105');
      await page.fill('#f-mb-1-interasseSuperiore', '60 mm');
      await page.fill('#f-mb-1-interasseInferiore', '58 mm');
      await tick(page, 'mb-1-display', 'si');
      await page.click('.actions button[type=submit]');
      await page.waitForURL(/\/schede\/[a-z0-9]+$/);
      sheetUrl = page.url();
      if (!(await page.textContent('.plate')).includes(fields.numeroImpianto))
        fail('plate without the number');
      if ((await page.locator('.mtable tbody tr').count()) !== 6) fail('sheet without 6 stop rows');

      await page.goto(`${base}/schede`);
      await page.fill('#q', '3387 verdi');
      await page.waitForFunction(
        () => document.querySelectorAll('[data-results] .row-link').length > 0,
      );
      const pdf = await page.request.get(`${sheetUrl}/pdf`);
      const body = await pdf.body();
      if (pdf.status() !== 200 || body.subarray(0, 5).toString() !== '%PDF-') fail('PDF download');
      if (!body.toString('latin1').includes('/Subtype /Image'))
        fail('PDF without the company logo');
      await page.goto(`${sheetUrl}/stampa`);
      if (!(await page.locator('.paper__logo').count())) fail('print without the company logo');
      if (!(await page.textContent('.paper__by')).trim()) fail('print without the author');
      if ((await page.locator('.ptable tbody tr').count()) !== 6) fail('print without 6 stop rows');
    }

    for (const [name, path] of [
      ['list', '/schede?q=verdi'],
      ['new', '/schede/nuova'],
      ['sheet', new URL(sheetUrl).pathname],
      ['users', '/utenti'],
      ['invite', '/utenti/invita'],
      ['companies', '/aziende'],
      ['company', aziendaPath],
      ['new-company', '/aziende/nuova'],
      ['log', '/registro'],
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

  // The MASTER invites the company's ADMIN; the ADMIN invites a technician into the same company.
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
  const adminPage = await acceptInvite(adminContext, adminLink, 'Amministratore E2E');
  await adminPage.goto(`${base}/utenti/invita`);
  if (await adminPage.locator('#azienda').count()) fail('a company ADMIN can pick another company');
  await adminPage.fill('#email', `tecnico.e2e.${stamp}@rilievi.test`);
  await adminPage.fill('#name', 'Tecnico E2E');
  await adminPage.selectOption('#role', 'TECNICO');
  await adminPage.click('form button[type=submit]');
  const techLink = await adminPage.inputValue('#link');
  const techContext = await browser.newContext();
  const techPage = await acceptInvite(techContext, techLink, 'Tecnico E2E');
  const users = await techPage.goto(`${base}/utenti`);
  if (users?.status() !== 403) fail(`technician sees /utenti (${users?.status()})`);
  const companies = await techPage.goto(`${base}/aziende`);
  if (companies?.status() !== 403) fail(`technician sees /aziende (${companies?.status()})`);
  const sheet = await techPage.goto(sheetUrl);
  if (sheet?.status() !== 200)
    fail(`technician cannot open the company's sheet (${sheet?.status()})`);
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`✔ e2e: all flows pass, no serious accessibility violations. Screenshots: ${shots}`);
