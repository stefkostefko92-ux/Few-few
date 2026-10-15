// End-to-end check of a running portal in a real Chromium: the public pages and an access request
// accepted by the MASTER (site.mjs), sign-in, a company with its logo, a full sheet (the fields that
// appear with the door type, the alarm, one measurement row per stop that follows "Fermate" while it
// is typed, the order forms and data sheets, Mastech and the hydraulic lift — mastech.mjs), search,
// print (the sections chosen for it), PDF, the order of the sections in the
// company settings (impostazioni.mjs), the same data filled in real time in every direction
// (tempo-reale.mjs), the company ADMIN invited by the MASTER and a technician invited by that ADMIN
// who sees the company's sheets (inviti.mjs), and accessibility (axe-core, WCAG 2.1 AA) on every page,
// in the light and the dark theme. Screenshots land in tests/e2e/shots/ (git-ignored).
//
//   RILIEVI_URL=http://127.0.0.1:4330 E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
//
// The account must be a MASTER (companies are theirs). It creates real records — run it against a
// local or staging portal, never production.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { audit, fail, failures, italianOnly, signIn as signInAt, tick } from './helpers.mjs';
import { checkSite } from './site.mjs';
import { checkInvites } from './inviti.mjs';
import { checkLinkedData, confirmDifferences } from './collegati.mjs';
import { checkMastech } from './mastech.mjs';
import { checkMovilift } from './movilift.mjs';
import { checkSettings } from './impostazioni.mjs';
import { checkRealTime } from './tempo-reale.mjs';

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
const signIn = (page, who, secret) => signInAt(page, base, who, secret);
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

try {
  // The public side first: the landing page and the policy, in Italian only, and an access request,
  // accepted by the MASTER as a new company with its administrator invited.
  await checkSite(browser, { base, shots, email, password });
  for (const scheme of ['light', 'dark']) {
    const context = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => fail(`${scheme}: page error ${error.message}`));
    await page.goto(`${base}/accesso`);
    await audit(page, `${scheme} login`);
    await italianOnly(page, `${scheme} login`);
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
        ubicazioneCassettina: 'Piano -1, vano contatori',
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
      await tick(page, 'telesoccorsoInstallare', 'si');
      await tick(page, 'perifericaInstallare', 'no');
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
      // The forms: the MoviLift order first, then the Pelazza order (the same question, the other
      // make), the argano data sheet and the 2SG sheet, prefilled from the survey.
      await checkMovilift(page, scheme);
      await checkMastech(page, scheme, aziendaName);
      await tick(page, 'quadroMarca', 'PELAZZA');
      if (await page.locator('#f-om').isVisible()) fail('MoviLift order shown for Pelazza');
      await tick(page, 'quadroOrdine', 'si');
      if ((await page.inputValue('#f-oq-nFermate')) !== '6')
        fail('Pelazza order without the stops');
      if (!(await page.isChecked('#f-oq-porteAutomatiche')))
        fail('Pelazza order without the doors');
      await tick(page, 'oq-ordine', 'si');
      await page.fill('#f-oq-quantita', '1');
      await tick(page, 'arganoPreventivo', 'si');
      if ((await page.inputValue('#f-pa-portata')) !== '630') fail('argano sheet without the load');
      if ((await page.inputValue('#f-pa-indirizzo')) !== fields.indirizzo)
        fail('argano sheet without the address');
      if ((await page.inputValue('#f-pa-macchina')) !== 'Alto')
        fail('argano sheet without the machine room');
      await tick(page, 'sospensioni', 'si');
      await page.fill('#f-sospensioniNumero', '6');
      if (!(await page.isChecked('#f-sg-automatico')))
        fail('2SG sheet without the automatic doors');
      if (!(await page.inputValue('#f-sg-riferimento')).includes(fields.numeroImpianto))
        fail('2SG sheet without the reference of the lift');
      await page.fill('#f-sg-antePianoNr', '12');
      await checkLinkedData(page, scheme);
      await page.click('.actions button[type=submit]');
      await confirmDifferences(page, scheme);
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
      for (const path of ['ordine-quadro', 'dati-argano', 'sospensioni-2sg']) {
        const order = await page.request.get(`${sheetUrl}/${path}`);
        const bytes = await order.body();
        if (order.status() !== 200 || bytes.subarray(0, 5).toString() !== '%PDF-')
          fail(`${path} PDF`);
      }
      const pdf = await page.request.get(`${sheetUrl}/pdf`);
      const body = await pdf.body();
      if (pdf.status() !== 200 || body.subarray(0, 5).toString() !== '%PDF-') fail('PDF download');
      if (!body.toString('latin1').includes('/Subtype /Image'))
        fail('PDF without the company logo');
      await page.goto(`${sheetUrl}/stampa`);
      if (!(await page.locator('.paper__logo').count())) fail('print without the company logo');
      if (!(await page.textContent('.paper__by')).trim()) fail('print without the author');
      if ((await page.locator('.ptable tbody tr').count()) !== 6) fail('print without 6 stop rows');
      if (!(await page.textContent('.paper')).includes("Modulo d'ordine quadri"))
        fail('print without the panel order');
      if (await page.locator('.paper__section h2', { hasText: /^Cavi$/ }).count())
        fail('print keeps the section left out of it');
      // The head: the address and the work order under the title; the identification is not repeated.
      if (!(await page.textContent('.paper__address')).includes('Via Giuseppe Verdi'))
        fail('print without the address in the head');
      if (!(await page.textContent('.paper__buono')).includes(fields.buonoLavoro))
        fail('print without the work order in the head');
      if (
        await page.locator('.paper__section h2', { hasText: /^(Impianto|Dati di targa)$/ }).count()
      )
        fail('print repeats the plate data as a section');

      await checkSettings(page, {
        base,
        aziendaId: aziendaPath.split('/').pop(),
        sheetPath: new URL(sheetUrl).pathname,
      });
      await checkRealTime(context, { base, aziendaName, sheetUrl, scheme });
    }

    for (const [name, path] of [
      ['list', '/schede?q=verdi'],
      ['new', '/schede/nuova'],
      ['sheet', new URL(sheetUrl).pathname],
      ['edit', `${new URL(sheetUrl).pathname}/modifica`],
      ['users', '/utenti'],
      ['invite', '/utenti/invita'],
      ['companies', '/aziende'],
      ['company', aziendaPath],
      ['new-company', '/aziende/nuova'],
      ['log', '/registro'],
      ['settings', `/impostazioni?azienda=${aziendaPath.split('/').pop()}`],
      ['requests', '/richieste?stato=ALL'],
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

  // The MASTER invites the company's ADMIN; the ADMIN invites a technician (inviti.mjs).
  await checkInvites({ browser, base, shots, email, password, aziendaName, sheetUrl });
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} problem(s).`);
  process.exit(1);
}
console.log(`✔ e2e: all flows pass, no serious accessibility violations. Screenshots: ${shots}`);
