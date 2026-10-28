// End-to-end smoke test against a running LiftPilot (local or staging), with a real browser:
//   health → public page (no console or CSP errors, in Italian, the only language) → /en and /bg sent for good to /it → an unknown
//   address: the 404 drawn in Italian → sign-in → «Nuovo impianto» → its «Calcolo argano», which starts empty
//   (its draft kept, resumed, discarded; smoke-blank.mjs) → saved snapshot with reproduced hash → calculation report (PDF) → its
//   machine room surveyed, the drawing set and its relazione tecnica di modifica (scripts/smoke-replacement.mjs) → the installation's page:
//   its type, its sections → a modernisation of its own whose logbook and documented loads answer speed, load and travel
//   «No» (round 47) → a «Calcolo argano» of a modernisation from the saved one (round 45: the renovation keeping the sling,
//   UNI 10411-11; round 46: its logbook's speed locks «Velocità variata», scripts/smoke-intervento.mjs) → the Progetto drawn on it: its data entered (a draft taken up again), a distance of the plan, the landing door
//   set apart from the car door and the car buffers changed on the drawings, live 3D simulation, the test of its base, saved
//   in one go (shaft design and calculation together) with its documents → data of the installation, client and company
//   logos, drawing set issued from it (sheets, PDF) and its revision → the installations' result pill opens the checks behind its number
//   (scripts/smoke-verdict.mjs) → the Progetto's relazione tecnica di modifica (scripts/smoke-rt.mjs) → a «Trasformazione completa»: its Progetto leads to the calculation, the calculation fixed to
//   UNI EN 81-20/50, the Progetto drawn on it, its set (scripts/smoke-progetto.mjs) → the survey sheets: a sheet with its conditions, stops, modules, search, PDFs, print, conflict,
//   trash (scripts/smoke-rilievi.mjs), the company's order of the sections, the linked data with the confirmation, MoviLift, the
//   modules in the print (scripts/smoke-rilievi-sync.mjs), Mastech, the hydraulic lift, the print's choices (smoke-rilievi-sync2.mjs)
//   → a survey and its installation: created from it, prefilled, compared, linked by suggestion, unlinked; the home
//   (scripts/smoke-collega.mjs) → new user who must change the password → a second
//   company that cannot open the first company's calculation, shaft design, DXF, drawing set, lift design or survey sheet (nor its
//   modules) → with MAILBOX_PORT: the beta by invitation (/register without one, the administrator's invitations,
//   scripts/smoke-beta.mjs), self-registration from the link, confirmation with the clauses, forgotten password (scripts/smoke-accounts.mjs), the rights
//   matrix of that company (scripts/smoke-permessi.mjs), the server sending its mail to scripts/mail-sink.mjs on that port.
// Usage: BASE_URL=http://localhost:3100 ADMIN_EMAIL=… ADMIN_PASSWORD=… [MAILBOX_PORT=2526] node scripts/smoke.mjs (Playwright: local or global).
// With MAILBOX_PORT each full run needs a fresh server process (or an hour): it registers 3 times, the server takes 5 an hour per address.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { startMailSink } from './mail-sink.mjs';
import { accountFlows } from './smoke-accounts.mjs';
import { secondCompany } from './smoke-isolation.mjs';
import { loadPlaywright, smokeKit, step } from './smoke-kit.mjs';
import { blankCalc, blankSaves, projectData } from './smoke-blank.mjs';
import { ammodernamento, documentiNo } from './smoke-intervento.mjs';
import { priceList } from './smoke-prices.mjs';
import { progettoFlow } from './smoke-progetto.mjs';
import { publicPages } from './smoke-public.mjs';
import { guidePage, helpAndSearch, notFoundPage, reportFlow, rilievoLostAnswer, rilievoOffline } from './smoke-help.mjs';
import { replacementRoom } from './smoke-replacement.mjs';
import { setSvg } from './smoke-svg.mjs';
import { documentiFlow, sempliceFlow, simulazioneFlow } from './smoke-pagine.mjs';
import { rilieviFlow } from './smoke-rilievi.mjs';
import { rtTrasformazione, rtVano } from './smoke-rt.mjs';
import { rilieviSync } from './smoke-rilievi-sync.mjs';
import { rilieviSync2 } from './smoke-rilievi-sync2.mjs';
import { collegaFlow } from './smoke-collega.mjs';
import { archivedReadOnly, technician } from './smoke-roles.mjs';
import { verdictPopover } from './smoke-verdict.mjs';

const { chromium } = loadPlaywright();
const BASE = (process.env.BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@carbonstealth.eu', password: process.env.ADMIN_PASSWORD ?? '' };
if (!ADMIN.password) throw new Error('ADMIN_PASSWORD is required');
const stamp = Date.now().toString(36);
// a 96 × 32 PNG, made for this test
const LOGO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAgCAIAAABiouoDAAAAfUlEQVR42u3aywmAMBBFUSO2YDlWZR1WZTkWMS7cDRgQowieu8n+8t6QX4mIDuf0FNQZjmWcFi4S2zpLkIq1qljK1Z9J00aCVIwggr40pOsT64mNhgSpGEEEgSCCCCKIIIIIIgjXDqsuGCWIIIJenUFeECWIoKYUvzsk6BY7X3sSQy3KvssAAAAASUVORK5CYII=';

const { newPage, login, hydrated, orderFiles, logout } = smokeKit(BASE);
const MAILBOX = Number(process.env.MAILBOX_PORT ?? 0);
const sink = MAILBOX ? startMailSink(MAILBOX) : null;
if (sink) await sink.ready;
const browser = await chromium.launch();
try {
  const { page, errors } = await publicPages({ BASE, browser, newPage });
  await guidePage({ BASE, page });
  await notFoundPage({ BASE, page, errors });

  step('sign-in and installation');
  await login(page, ADMIN.email, ADMIN.password);
  // the installations' page offers one new installation and the four steps of its work (round 45); a new installation
  // has no module: it opens straight on its «Calcolo argano», where the type of intervention is chosen
  await page.goto(`${BASE}/it/app/impianti`);
  // the interface's mode (round 52): chosen in the top bar, each way, and kept with the user; the rest of the run in
  // «Esperto» (it fills every field, the expert ones too)
  await hydrated(page, '#ws-mode-esperto');
  for (const m of ['semplice', 'esperto']) {
    await page.click(`label[for="ws-mode-${m}"]`);
    await page.waitForSelector(`[data-modalita="${m}"]`);
    await page.waitForTimeout(500);
    await page.reload();
    assert.equal(await page.locator(`[data-modalita="${m}"]`).count(), 1, `«${m}» kept with the user`);
    await hydrated(page, '#ws-mode-esperto');
  }
  assert.equal(await page.locator('main .dash-nuovo a[href$="/app/projects/new"]').count(), 1, 'one new installation');
  assert.equal(await page.locator('main .dash-nuovo .dash-passi li').count(), 6, 'the six steps');
  await page.goto(`${BASE}/it/app/projects/new?kind=replacement`);
  assert.equal(await page.locator('main input[name="kind"]').count(), 0, 'no module to choose (an old ?kind= is ignored)');
  assert.match(await page.textContent('main form'), /Il tipo di intervento e i dati tecnici si danno dopo, nel Calcolo argano/);
  await page.fill('input[name="name"]', `Smoke ${stamp}`);
  await page.fill('input[name="city"]', 'Milano');
  await Promise.all([page.waitForURL(/\/projects\/[a-z0-9]+\/calc$/), page.click('main form button[type="submit"]')]);
  const projectUrl = page.url().replace(/\/calc$/, '');

  await blankCalc({ page, hydrated, example: 'C' });
  step('calculation');
  // the machine below the shaft (the example of the other replacement keeps it above: smoke-replacement.mjs)
  await page.selectOption('#layout', 'bottom');
  await page.fill('#n_D', '600');
  // a second standard for the acceptance test, on top of UNI 10411-1: its own result, kept with the calculation
  await page.check('.collaudo label:has-text("tutto l’impianto") input');
  // the machine advised among SICOR's and Montanari's, taken into the new machine's fields
  await page.waitForSelector('.advice .advice-card.best button');
  await page.click('.advice .advice-card.best button');
  await page.waitForSelector('.advice .advice-card.best button[disabled]');
  // the form has taken the machine (its card is the chosen one): save as soon as the save button accepts it
  await page.waitForSelector('.savebar button.primary:not([disabled])');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const calcUrl = page.url();
  assert.match(await page.textContent('dl.cartiglio'), /UNI 10411-1 · EN 81-20\/50/, 'test standards kept');
  assert.match(await page.textContent('dl.cartiglio'), /riprodotto/, 'hash reproduced');

  step('calculation report (PDF)');
  const href = await page.getAttribute('a[href^="/api/calculations/"][href$="/relazione"]', 'href');
  const pdf = await page.request.get(`${BASE}${href}`);
  assert.equal(pdf.status(), 200);
  assert.equal(pdf.headers()['content-type'], 'application/pdf');
  const body = await pdf.body();
  assert.equal(body.subarray(0, 5).toString('latin1'), '%PDF-');

  step('draft order of the advised machine (Word and PDF)');
  assert.match(await page.textContent('main'), /l’argano verificato in questo calcolo/, 'the order is for the machine the calculation verified');
  await orderFiles(page, '/api/calculations/');
  const { roomUrl, roomId, rt } = await replacementRoom({ BASE, page, hydrated, calcUrl, stamp });

  step('the top bar searches the installations on the server: every word, in the name, the address or the plant number');
  await page.fill('.ws-search-wide input[name="q"]', `Smoke ${stamp}`);
  await Promise.all([page.waitForURL(/\/it\/app\/impianti\?q=/), page.press('.ws-search-wide input[name="q"]', 'Enter')]);
  await page.waitForSelector('.dash-row');
  assert.equal(await page.locator('.dash-row').count(), 1, 'one installation found');
  assert.match(await page.textContent('.dash-row'), new RegExp(`Smoke ${stamp}`));
  // this run's two installations are in Milano (this one and the replacement of smoke-replacement.mjs); % and _ are
  // text, not LIKE's wildcards: with this run's word they find none of its two installations
  for (const [q, n, why] of [[`milano ${stamp}`, 2, 'the municipality and a word of the name'], [`smoke MILANO ${stamp}`, 1, 'every word, whatever its case'],
    [`Torino ${stamp}`, 0, 'every word must be found'], ...['%', '_', '%%'].map((w) => [`${w} ${stamp}`, 0, `«${w}» is not a wildcard`])]) {
    await page.goto(`${BASE}/it/app/impianti?q=${encodeURIComponent(q)}`);
    assert.equal(await page.locator('.dash-row').count(), n, why);
  }

  await blankSaves({ BASE, page, hydrated, stamp });
  step('the installation: its type from «Calcolo argano», its bar and next step, its sections in the order of the work (rounds 45, 53)');
  await page.goto(projectUrl);
  assert.match(await page.textContent('.page-head .titles .tipo-badge'), /Solo argano/, 'the type read from its calculation');
  for (const id of ['sec-calcolo', 'sec-progetto']) assert.equal(await page.locator(`#${id}`).count(), 1, id);
  assert.ok(await page.locator('section[aria-labelledby="sec-calcolo"] tbody tr').count() > 0, 'its «Calcolo argano»');
  // a «Solo argano» with the machine below: its Progetto draws the shaft (no machine room above to survey), still to do
  assert.ok(await page.locator('section[aria-labelledby="sec-progetto"] a[href*="/progetto?calc="]').count() > 0, 'its Progetto: the shaft to draw on it');
  assert.match(await page.getAttribute('.imp-next a.btn-primary', 'href') ?? '', /\/progetto\?calc=/, 'the next step: the Progetto');
  assert.equal(await page.locator('.imp-tabs > li').count(), 7, 'the bar: the overview and six steps');
  assert.equal(await page.locator('button:has-text("Passa a progetto completo")').count(), 0, 'no upgrade any more');

  // round 47 (D1): the documents answer speed, load and travel both ways, in an installation of its own
  await documentiNo({ BASE, page, hydrated, stamp });
  // a «Calcolo argano» of a modernisation from the saved one, its logbook's speed locking «Velocità variata» (round 46)
  await ammodernamento({ page, hydrated, calcUrl });

  step('the Progetto draws on it: the drawing\'s data entered, the plan edited on the drawing, the checks in their tab, save');
  // the calculation's load, speed, roping, machine place, machine and test are the base's: shown, never asked; the shaft,
  // the floors and the scheme of the machine below to enter
  await projectData({ page, hydrated, bottom: 'head', draft: true });
  assert.equal(await page.locator('.lift-form .collaudo').count(), 0, 'no test in the Progetto');
  assert.match(await page.textContent('.lift-form .dal-calcolo'), /Ammodernamento[\s\S]*UNI 10411-11/, 'what it draws on');
  assert.ok(await page.locator('#bk-Qkg[readonly]').count() === 1, 'the rated load the calculation’s');
  await page.waitForSelector('.lift-main svg.sheet-svg');
  // a distance of the plan changed on the drawing itself: the platform 20 mm further from the left wall
  const hit = page.locator('.lift-main .ed-hits .hit[aria-label*="Piattaforma: distanza dalla parete sinistra"]').first();
  const was = Number(/^(\d+)/.exec((await hit.getAttribute('aria-label')) ?? '')?.[1]);
  await hit.click();
  await page.fill('.lift-main .ed-pop input', String(was + 20));
  await page.press('.lift-main .ed-pop input', 'Enter');
  await page.waitForSelector('.lift-main table.fixes tr.hand');
  // the landing door 30 mm apart from the car door, on the drawing; the distance between their axes then reads it
  const land = page.locator('.lift-main .ed-hits .hit[aria-label*="Porta di piano A: inizio della luce"]').first();
  const landWas = Number(/^(\d+)/.exec((await land.getAttribute('aria-label')) ?? '')?.[1]);
  assert.ok(landWas > 0, 'landing door drawn');
  await land.click();
  await page.fill('.lift-main .ed-pop input', String(landWas + 30));
  await page.press('.lift-main .ed-pop input', 'Enter');
  await page.waitForSelector('.lift-main .ed-hits .hit[aria-label^="30 mm"][aria-label*="Porta di piano A"]');
  // the pit in plan: the car buffers 40 mm further apart, on the drawing; the dimension then reads it
  await page.click('.lift-main [role="tab"]:has-text("Pianta della fossa")');
  const span = page.locator('.lift-main .ed-hits .hit[aria-label*="Ammortizzatori di cabina: interasse"]').first();
  const spanWas = Number(/^(\d+)/.exec((await span.getAttribute('aria-label')) ?? '')?.[1]);
  assert.ok(spanWas > 0, 'distance between the car buffers drawn');
  await span.click();
  await page.fill('.lift-main .ed-pop input', String(spanWas + 40));
  await page.press('.lift-main .ed-pop input', 'Enter');
  await page.waitForSelector(`.lift-main .ed-hits .hit[aria-label^="${spanWas + 40}"][aria-label*="Ammortizzatori di cabina: interasse"]`);
  assert.equal(await page.locator('.lift-work .lift-sim, .lift-work .panev-bom').count(), 0, 'the 3D and the bill: their own pages');
  // the acceptance test of its base: UNI 10411-11, the renovation keeping the sling; the checks of what stays are existing
  await page.click('.lato-tabs button:has-text("Verifiche")');
  await page.waitForSelector('.lift-checks tr.existing .status-pill.existing');
  assert.match(await page.textContent('.lift-work .lift-verdict .badge'), /UNI 10411-11/, 'standard of the acceptance test');
  await page.waitForFunction(() => /arcata esistente/.test(globalThis.document.querySelector('.lift-work .lift-verdict')?.textContent ?? ''));
  // a counterweight rail support chosen by hand: into the saved design and its bill («Tavole e documenti»)
  await page.selectOption('.lift-form select:has(option[value="SU 220 200"])', 'SU 220 200');
  await page.fill('.lift-work .savebar input', 'Progetto di prova');
  await Promise.all([page.waitForURL(/\/lift-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click('.lift-work .savebar button.btn-primary')]);
  const liftUrl = page.url();
  await page.waitForSelector('.lift-view .lift-facts');
  assert.equal(await page.locator('main > .alert-warn, main > .alert-bad').count(), 0, 'the running engines reproduce the saved design');
  assert.match(await page.textContent('.lift-view .lift-verdict .badge'), /UNI 10411-11/, 'the saved standard');
  assert.match(await page.textContent('.lift-view .lift-verdict'), /arcata esistente/, 'the renovation saved');

  const { liftRelHref, dxfHref, designUrl } = await documentiFlow({ BASE, page, projectUrl, reportBytes: body.length, orderFiles });
  await simulazioneFlow({ page, projectUrl, liftUrl });
  await sempliceFlow({ page, hydrated, projectUrl });

  await verdictPopover({ BASE, page, hydrated });

  step('data of the installation, company logo, drawing set and its revision');
  await page.goto(`${projectUrl}/impianto`);
  await page.click('.plant-form details summary');
  // a machine name that contradicts the catalogue's machine of the design is flagged as typed; the set would not issue
  const machineName = page.locator('.plant-form details input').first();
  await machineName.fill('M 73 (Sx)');
  await page.waitForSelector('.plant-form details .note.bad[role="alert"]');
  await machineName.fill('');
  await page.click('.plant-form button[type="submit"]');
  await page.waitForSelector('.plant-form [role="status"]');
  // the client's logo, beside its name in the title block
  await page.setInputFiles('.panel input[name="logo"]', { name: 'cliente.png', mimeType: 'image/png', buffer: Buffer.from(LOGO_PNG, 'base64') });
  await page.click('.panel:has(input[name="logo"]) button[type="submit"]');
  await page.waitForSelector('.logo-preview img');
  await page.goto(`${BASE}/it/app/company`);
  await page.setInputFiles('input[name="logo"]', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(LOGO_PNG, 'base64') });
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('.logo-preview img');
  await page.goto(`${projectUrl}/documenti`);
  assert.notEqual(await page.inputValue('main form input[maxlength="12"]'), '', 'initials filled in from the name');
  await page.fill('main form input[maxlength="12"]', 'S.T.');
  await Promise.all([page.waitForURL(/\/drawing-sets\/[a-z0-9]+$/, { timeout: 60000 }), page.click('main form:has(input[maxlength="12"]) button[type="submit"]')]);
  const setUrl = page.url();
  await page.waitForSelector('.sheet-page svg.sheet-svg image');
  assert.equal(await page.locator('.sheet-page svg.sheet-svg image').count(), 2, 'the company’s and the client’s logo on sheet 1');
  const sheets = await page.locator('nav.seg-row a').count();
  assert.ok(sheets >= 8, `sheets ${sheets}`);
  // sheet 1 lists the check of the car rails (UNI EN 81-50, 5.10); here a renovation keeping the sling (UNI 10411-11):
  // the rails are new, so with the note of their check, and the test's note says the sling stays (the rails kept, without
  // the note: tavole.test.ts)
  // (the checks themselves on the set's last sheet, which sheet 1 points to)
  const sheet1 = await page.textContent('.sheet-page svg.sheet-svg');
  assert.ok(sheet1?.includes('VERIFICA DELLE GUIDE DI CABINA') && new RegExp(`VERIFICHE (DEL PROGETTO: FOGLIO|NON SUPERATE: \\d+ — VEDI FOGLIO) ${sheets}`).test(sheet1), 'the rails\' check on sheet 1');
  // (the note wraps on its lines, whose texts join without the space: compared without spaces)
  const flat = (s) => (s ?? '').replace(/\s+/g, '');
  assert.ok(flat(sheet1).includes(flat("Rifacimento con l’arcata esistente:")), 'the renovation in the test’s note');
  assert.ok(flat(sheet1).includes(flat('Intervento: Ammodernamento')), 'the type declared with the calculation in the test’s note');
  await page.goto(`${setUrl}?p=${sheets}`);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  const checksSheet = await page.textContent('.sheet-page svg.sheet-svg');
  assert.ok(checksSheet?.includes('VERIFICHE DEL PROGETTO') && checksSheet.includes('Guide di cabina: tensioni'), 'the checks on the last sheet');
  const setPdfHref = await page.getAttribute('a[href$="/pdf"]', 'href');
  const setPdf = await page.request.get(`${BASE}${setPdfHref}`);
  assert.equal(setPdf.status(), 200);
  assert.equal((await setPdf.body()).subarray(0, 5).toString('latin1'), '%PDF-');
  await setSvg({ BASE, page, sheets });
  await page.goto(`${setUrl}?p=5`);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  await page.fill('main form input[maxlength="120"]', 'Seconda emissione di prova');
  await page.fill('main form:has(input[maxlength="120"]) input[maxlength="12"]', 'S.T.');
  const setPath = new URL(setUrl).pathname;
  await Promise.all([page.waitForURL((u) => /\/drawing-sets\/[a-z0-9]+$/.test(u.pathname) && u.pathname !== setPath, { timeout: 60000 }), page.click('main form:has(input[maxlength="120"]) button[type="submit"]')]);
  assert.match(await page.textContent('h1'), / R1$/, 'revision R1');
  await page.goto(projectUrl);
  await page.waitForSelector('.imp-nav .imp-tabs');
  await rtVano({ page, hydrated, stamp, projectUrl });
  assert.deepEqual(errors, [], 'browser errors');
  await archivedReadOnly({ page, hydrated, projectUrl, errors });
  await priceList({ BASE, page, hydrated, stamp, liftUrl, roomUrl });
  await rtTrasformazione({ page, projectUrl: (await progettoFlow({ BASE, page, hydrated, stamp })).projectUrl });
  const rilievo = await rilieviFlow({ BASE, page, hydrated });
  const rilievoSync = await rilieviSync({ BASE, page, hydrated });
  const mastech = await rilieviSync2({ BASE, page, hydrated });
  await collegaFlow({ BASE, page, hydrated, stamp });
  await rilievoOffline({ BASE, page, errors });
  await reportFlow({ BASE, page, stamp, sink, ADMIN });
  await rilievoLostAnswer({ BASE, page, errors });
  await helpAndSearch({ BASE, page });
  assert.deepEqual(errors, [], 'browser errors');

  await technician({ BASE, page, errors, stamp, login, logout, hydrated, rilievoUrl: rilievo.sheetUrl });

  // the isolation check below provokes a 404 on purpose: the console must be clean up to here
  assert.deepEqual(errors, [], 'browser errors');
  await secondCompany({ BASE, page, kit: { login, logout, hydrated }, ADMIN, stamp,
    urls: { calcUrl, href, designUrl, dxfHref, setUrl, setPdfHref, liftUrl, liftRelHref, roomUrl, roomId, rilievoUrl: rilievo.sheetUrl, rilievoId: rilievo.id,
      rilievoMovilift: rilievoSync.id, rilievoMastech: mastech.id, rt } });

  if (sink) await accountFlows({ BASE, stamp, step, sink, newPage: () => newPage(browser), ADMIN_EMAIL: ADMIN.email, ADMIN, kit: { login, logout, hydrated } });
  else step('accounts without an administrator: skipped (no MAILBOX_PORT)');

  step('all good');
} finally {
  await browser.close();
  await sink?.close();
}
