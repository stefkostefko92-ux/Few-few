// End-to-end smoke test against a running LiftPilot (local or staging), with a real browser:
//   health → public page (no console or CSP errors) → sign-in → the two modules → a machine replacement → its
//   calculation, which starts empty (its draft kept, resumed, discarded; smoke-blank.mjs) → saved snapshot with reproduced hash → calculation report (PDF) → its machine room surveyed, the
//   relazione tecnica and the drawing set (scripts/smoke-replacement.mjs) → the replacement becomes a whole
//   project, its data entered (a draft taken up again) → shaft design by hand (a distance changed on its plan, the landing door
//   set apart from the car door), its DXF, a calculation from it with the plan in its report → data of the installation,
//   client and company logos, drawing set issued from
//   that calculation (sheets, PDF) and its revision → the installation in one form with its live 3D simulation and a SICOR
//   machine from the catalogue (drawn as it is), saved
//   in one go (shaft design and calculation together), with its documents → new user who must change the password → a
//   second company that cannot open the first company's calculation, shaft design, DXF, drawing set or lift design →
//   with MAILBOX_PORT: self-registration, confirmation, forgotten password (scripts/smoke-accounts.mjs), the server
//   sending its mail to scripts/mail-sink.mjs on that port (SMTP_HOST=127.0.0.1, SMTP_PORT=<port>, MAIL_FROM set).
// Usage: BASE_URL=http://localhost:3100 ADMIN_EMAIL=… ADMIN_PASSWORD=… [MAILBOX_PORT=2526] node scripts/smoke.mjs
// Playwright is not a dependency of the app: the local install is used, else the global one.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { startMailSink } from './mail-sink.mjs';
import { accountFlows } from './smoke-accounts.mjs';
import { secondCompany } from './smoke-isolation.mjs';
import { loadPlaywright, smokeKit, step } from './smoke-kit.mjs';
import { blankCalc, projectData } from './smoke-blank.mjs';
import { priceList } from './smoke-prices.mjs';
import { replacementRoom } from './smoke-replacement.mjs';

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
  step('health');
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.app, 'liftpilot');

  step('public page');
  const { page, errors } = await newPage(browser);
  const res = await page.goto(`${BASE}/it`);
  assert.equal(res.status(), 200);
  assert.ok((res.headers()['content-security-policy'] ?? '').includes("'nonce-"), 'CSP with nonce');
  assert.equal(await page.locator('h1').count(), 1);

  step('sign-in and installation');
  await login(page, ADMIN.email, ADMIN.password);
  // the dashboard offers the two modules; a machine replacement opens straight on its calculation
  await page.goto(`${BASE}/it/app`);
  assert.equal(await page.locator('.app-modules .app-module').count(), 2, 'two modules');
  await page.goto(`${BASE}/it/app/projects/new?kind=replacement`);
  assert.ok(await page.isChecked('input[name="kind"][value="REPLACEMENT"]'), 'replacement chosen');
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
  const href = await page.getAttribute('a[href*="/relazione"]', 'href');
  const pdf = await page.request.get(`${BASE}${href}`);
  assert.equal(pdf.status(), 200);
  assert.equal(pdf.headers()['content-type'], 'application/pdf');
  const body = await pdf.body();
  assert.equal(body.subarray(0, 5).toString('latin1'), '%PDF-');

  step('draft order of the advised machine (Word and PDF)');
  assert.match(await page.textContent('main'), /l’argano verificato in questo calcolo/, 'the order is for the machine the calculation verified');
  await orderFiles(page, '/api/calculations/');
  const { roomUrl, roomId } = await replacementRoom({ BASE, page, hydrated, calcUrl, stamp });

  step('the top bar searches the installations on the server: every word, in the name, the address or the plant number');
  await page.fill('.ws-search-wide input[name="q"]', `Smoke ${stamp}`);
  await Promise.all([page.waitForURL(/\/it\/app\?q=/), page.press('.ws-search-wide input[name="q"]', 'Enter')]);
  await page.waitForSelector('.dash-row');
  assert.equal(await page.locator('.dash-row').count(), 1, 'one installation found');
  assert.match(await page.textContent('.dash-row'), new RegExp(`Smoke ${stamp}`));
  // this run's two installations are in Milano (this one and the replacement of smoke-replacement.mjs)
  await page.goto(`${BASE}/it/app?q=${encodeURIComponent(`milano ${stamp}`)}`);
  assert.equal(await page.locator('.dash-row').count(), 2, 'the municipality and a word of the name');
  await page.goto(`${BASE}/it/app?q=${encodeURIComponent(`smoke MILANO ${stamp}`)}`);
  assert.equal(await page.locator('.dash-row').count(), 1, 'every word, whatever its case');
  await page.goto(`${BASE}/it/app?q=${encodeURIComponent(`Torino ${stamp}`)}`);
  assert.equal(await page.locator('.dash-row').count(), 0, 'every word must be found');
  // % and _ are text, not LIKE's wildcards: with this run's word they find none of its two installations
  for (const w of ['%', '_', '%%']) {
    await page.goto(`${BASE}/it/app?q=${encodeURIComponent(`${w} ${stamp}`)}`);
    assert.equal(await page.locator('.dash-row').count(), 0, `«${w}» is not a wildcard`);
  }

  step('the replacement becomes a whole project');
  await page.goto(projectUrl);
  assert.match(await page.textContent('.titles'), /Sostituzione argano/);
  assert.equal(await page.locator('.lift-home').count(), 0, 'no whole-project sections on a replacement');
  await Promise.all([page.waitForURL(/\/progetto$/, { timeout: 30000 }), page.click('button:has-text("Passa a progetto completo")')]);
  await page.goto(projectUrl);
  assert.match(await page.textContent('.titles'), /Progetto completo/);

  step('the installation in one form: the project data entered, the plan edited on the drawing, live simulation, save');
  await page.goto(`${projectUrl}/progetto`);
  // the calculation's load, speed, roping and machine place carried over; the shaft, the floors and the scheme of the
  // machine below to enter
  await projectData({ page, hydrated, bottom: 'head', draft: true });
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
  await page.waitForSelector('.lift-stage.live, .lift-stage.failed', { timeout: 120000 });
  await page.click('.scenario-tabs button[data-scenario="brake"]');
  await page.waitForSelector('.sim-chart svg path.line');
  await page.check('#auto-P');
  await page.waitForSelector('.lift-calc .auto-value .badge');
  await page.waitForSelector('.lift-work .advice .advice-card');
  // the acceptance test: the replacement's standards carried over (EN 81-20/50 for the whole installation on top), now
  // UNI 10411-11 alone with the machine and the ropes replaced; the checks of what stays are existing
  assert.ok(await page.isChecked('.collaudo label:has-text("tutto l’impianto") input'), 'the replacement’s test standards carried over');
  await page.uncheck('.collaudo label:has-text("tutto l’impianto") input');
  await page.selectOption('.collaudo select', '10411-11');
  await page.check('.collaudo .parti-grid label[data-part="ropes"] input');
  await page.waitForSelector('.lift-checks tr.existing .status-pill.existing');
  assert.match(await page.textContent('.lift-work .lift-verdict .badge'), /UNI 10411-11/, 'standard of the acceptance test');
  // the renovation keeping the existing sling: every part but the sling (locked), still tested to the UNI 10411 part
  // chosen, never to EN 81-20/50; through a new lift and back it is the same
  const rif = '.lift-form .seg-row button:has-text("Rifacimento con arcata esistente")';
  await page.click(rif);
  await page.waitForSelector('.collaudo .parti-grid label[data-part="sling"] input:disabled');
  assert.ok(await page.isChecked('.collaudo .parti-grid label[data-part="car"] input'), 'the car replaced');
  assert.equal(await page.locator('.lift-form .collaudo select option[value="en81"]').count(), 0, 'EN 81-20/50 not offered');
  await page.waitForFunction(() => /arcata esistente/.test(globalThis.document.querySelector('.lift-work .lift-verdict')?.textContent ?? ''));
  await page.click('.lift-form .seg-row button:has-text("Nuovo impianto")');
  await page.waitForFunction(() => /EN 81-20\/50/.test(globalThis.document.querySelector('.lift-work .lift-verdict .badge')?.textContent ?? ''));
  await page.click(rif);
  await page.waitForSelector('.collaudo .parti-grid label[data-part="sling"] input:disabled');
  assert.equal(await page.inputValue('.collaudo select'), '10411-11', 'the part of UNI 10411 kept');
  await page.waitForFunction(() => /UNI 10411-11/.test(globalThis.document.querySelector('.lift-work .lift-verdict .badge')?.textContent ?? ''));
  // the machine from SICOR's catalogue: the proposal takes one of its models, which the room's drawings, the 3D and the
  // relazione show as it is (src/lib/catalog/shapes.ts); the saved design must reproduce it on the server
  await page.evaluate(() => { const d = globalThis.document.querySelector('#auto-machine')?.closest('details'); if (d) d.open = true; });
  await page.check('#auto-machine');
  await page.selectOption('#cat-brand', 'SICOR');
  await page.waitForFunction(() => [...globalThis.document.querySelectorAll('.lift-calc p.hint')].some((p) => /SICOR (SH|MR)\d/.test(p.textContent ?? '')));
  // Panev's brackets: the bill shows the landing doors' pair; a counterweight rail support chosen by hand follows into
  // the bill and into the saved design
  await page.waitForSelector('.lift-work .panev-bom tbody td.code');
  assert.match(await page.textContent('.lift-work .panev-bom'), /A 65 170 7[\s\S]*B 65 320/, 'door pair in the bill');
  await page.selectOption('.lift-form select:has(option[value="SU 220 200"])', 'SU 220 200');
  await page.waitForFunction(() => /SU 220 200[\s\S]*SG 80 190/.test(globalThis.document.querySelector('.lift-work .panev-bom')?.textContent ?? ''));
  await page.fill('.lift-work .savebar input', 'Progetto di prova');
  await Promise.all([page.waitForURL(/\/lift-designs\/[a-z0-9]+$/, { timeout: 60000 }), page.click('.lift-work .savebar button.btn-primary')]);
  const liftUrl = page.url();
  await page.waitForSelector('.lift-view .lift-facts');
  assert.equal(await page.locator('main > .alert-warn, main > .alert-bad').count(), 0, 'the running engines reproduce the saved design');
  assert.match(await page.textContent('.lift-view .lift-verdict .badge'), /UNI 10411-11/, 'the saved standard');
  assert.match(await page.textContent('.lift-view .lift-verdict'), /arcata esistente/, 'the renovation saved');
  assert.match(await page.textContent('.lift-view .panev-bom'), /SU 220 200/, 'the support chosen by hand, saved');

  step('its documents: report with the plan, DXF, order, export');
  const liftRelHref = await page.getAttribute('.doc-links a[href*="/relazione"]', 'href');
  const liftRel = await page.request.get(`${BASE}${liftRelHref}`);
  assert.equal(liftRel.status(), 200);
  const liftRelBody = await liftRel.body();
  assert.equal(liftRelBody.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(liftRelBody.length > body.length, 'the report with the plan is larger');
  const dxfHref = await page.getAttribute('.doc-links a[href$="/dxf"]', 'href');
  const dxfText = await (await page.request.get(`${BASE}${dxfHref}`)).text();
  assert.ok(dxfText.includes('CABINA') && dxfText.trimEnd().endsWith('EOF'), 'DXF with the layer of the car');
  const designUrl = `${BASE}${await page.getAttribute('.doc-links a[href*="/app/shaft-designs/"]', 'href')}`;
  // the draft order of the machine the design verified
  assert.match(await page.textContent('main'), /l’argano verificato in questo progetto/, 'the order is for the machine the design verified');
  await orderFiles(page, '/api/lift-designs/');
  // the saved project exported: the drawing set as a draft PDF, every view as DXF and DWG
  for (const [format, magic] of [['pdf', '%PDF-'], ['dxf', '  0\nSECTION'], ['dwg', 'AC1015']]) {
    const res = await page.request.get(`${BASE}${await page.getAttribute(`a[href^="/api/lift-designs/"][href$="/${format}"]`, 'href')}`);
    assert.equal(res.status(), 200, format);
    assert.equal((await res.body()).subarray(0, magic.length).toString('latin1'), magic, format);
  }

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
  await page.goto(liftUrl);
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
  assert.ok(sheet1.includes("Rifacimento con l’arcata esistente"), 'the renovation in the test’s note');
  await page.goto(`${setUrl}?p=${sheets}`);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  const checksSheet = await page.textContent('.sheet-page svg.sheet-svg');
  assert.ok(checksSheet?.includes('VERIFICHE DEL PROGETTO') && checksSheet.includes('Guide di cabina: tensioni'), 'the checks on the last sheet');
  const setPdfHref = await page.getAttribute('a[href$="/pdf"]', 'href');
  const setPdf = await page.request.get(`${BASE}${setPdfHref}`);
  assert.equal(setPdf.status(), 200);
  assert.equal((await setPdf.body()).subarray(0, 5).toString('latin1'), '%PDF-');
  await page.goto(`${setUrl}?p=5`);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  await page.fill('main form input[maxlength="120"]', 'Seconda emissione di prova');
  await page.fill('main form:has(input[maxlength="120"]) input[maxlength="12"]', 'S.T.');
  const setPath = new URL(setUrl).pathname;
  await Promise.all([page.waitForURL((u) => /\/drawing-sets\/[a-z0-9]+$/.test(u.pathname) && u.pathname !== setPath, { timeout: 60000 }), page.click('main form:has(input[maxlength="120"]) button[type="submit"]')]);
  assert.match(await page.textContent('h1'), / R1$/, 'revision R1');
  await page.goto(projectUrl);
  await page.waitForSelector('.lift-home .lift-facts');

  assert.deepEqual(errors, [], 'browser errors');
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

  await priceList({ BASE, page, hydrated, stamp, liftUrl, roomUrl });

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
  // a Tecnico sees no prices and manages nobody
  assert.equal((await page.goto(`${BASE}/it/app/prices`)).status(), 404, 'price list of a Tecnico');
  assert.equal((await page.goto(`${BASE}/it/app/team`)).status(), 404, 'team page of a Tecnico');
  assert.equal((await page.request.get(`${BASE}/api/company/export`)).status(), 403, 'company export by a Tecnico');
  errors.length = 0; // provoked on purpose
  await page.goto(`${BASE}/it/app`);
  await logout(page);

  // the isolation check below provokes a 404 on purpose: the console must be clean up to here
  assert.deepEqual(errors, [], 'browser errors');
  await secondCompany({ BASE, page, kit: { login, logout, hydrated }, ADMIN, stamp,
    urls: { calcUrl, href, designUrl, dxfHref, setUrl, setPdfHref, liftUrl, liftRelHref, roomUrl, roomId } });

  if (sink) await accountFlows({ BASE, stamp, step, sink, newPage: () => newPage(browser), ADMIN_EMAIL: ADMIN.email });
  else step('accounts without an administrator: skipped (no MAILBOX_PORT)');

  step('all good');
} finally {
  await browser.close();
  await sink?.close();
}
