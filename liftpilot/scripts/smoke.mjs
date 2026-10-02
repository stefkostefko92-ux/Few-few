// End-to-end smoke test against a running LiftPilot (local or staging), with a real browser:
//   health → public page (no console or CSP errors) → sign-in → the two modules → a machine replacement → its
//   calculation → saved snapshot with reproduced hash → calculation report (PDF) → the replacement becomes a whole
//   project → shaft design by hand (a distance changed on its plan, the landing door
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
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { startMailSink } from './mail-sink.mjs';
import { accountFlows } from './smoke-accounts.mjs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(`${execSync('npm root -g').toString().trim()}/playwright`);
  }
}
const { chromium } = loadPlaywright();

const BASE = (process.env.BASE_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@carbonstealth.eu', password: process.env.ADMIN_PASSWORD ?? '' };
if (!ADMIN.password) throw new Error('ADMIN_PASSWORD is required');
const stamp = Date.now().toString(36);
// a 96 × 32 PNG, made for this test
const LOGO_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAgCAIAAABiouoDAAAAfUlEQVR42u3aywmAMBBFUSO2YDlWZR1WZTkWMS7cDRgQowieu8n+8t6QX4mIDuf0FNQZjmWcFi4S2zpLkIq1qljK1Z9J00aCVIwggr40pOsT64mNhgSpGEEEgSCCCCKIIIIIIgjXDqsuGCWIIIJenUFeECWIoKYUvzsk6BY7X3sSQy3KvssAAAAASUVORK5CYII=';
const step = (s) => process.stdout.write(`▸ ${s}\n`);

async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
  return { page, errors };
}
async function login(page, email, password) {
  await page.goto(`${BASE}/it/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForURL(/\/it\/app(\/account\?first=1)?$/), page.click('main form button[type="submit"]')]);
}
/** Waits until React has hydrated the element (its props are attached): a click before that is lost. */
async function hydrated(page, selector) {
  await page.waitForFunction((sel) => {
    const el = globalThis.document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  }, selector);
}
// the draft order of the page's record: a Word document (a ZIP with its main part) and a PDF
async function orderFiles(page, prefix) {
  for (const [format, magic, type] of [['docx', 'PK', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], ['pdf', '%PDF-', 'application/pdf']]) {
    const res = await page.request.get(`${BASE}${await page.getAttribute(`a[href^="${prefix}"][href$="/order/${format}"]`, 'href')}`);
    assert.equal(res.status(), 200, `order ${format}`);
    assert.equal(res.headers()['content-type'], type, `order ${format}`);
    const body = await res.body();
    assert.equal(body.subarray(0, magic.length).toString('latin1'), magic, `order ${format}`);
    if (format === 'docx') assert.ok(body.includes('word/document.xml'), 'order docx: main part');
  }
}

async function logout(page) {
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
}

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

  step('calculation');
  await page.waitForSelector('.verdict .big');
  await page.fill('#n_D', '600');
  // a second standard for the acceptance test, on top of UNI 10411-1: its own result, kept with the calculation
  await page.check('.collaudo label:has-text("tutto l’impianto") input');
  // the machine advised among SICOR's and Montanari's, taken into the new machine's fields
  await page.waitForSelector('.advice .advice-card.best button');
  await page.click('.advice .advice-card.best button');
  await page.waitForSelector('.advice .advice-card.best button[disabled]');
  await page.waitForTimeout(300);
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

  step('the replacement becomes a whole project');
  await page.goto(projectUrl);
  assert.match(await page.textContent('.titles'), /Sostituzione argano/);
  assert.equal(await page.locator('.lift-home').count(), 0, 'no whole-project sections on a replacement');
  await Promise.all([page.waitForURL(/\/progetto$/, { timeout: 30000 }), page.click('button:has-text("Passa a progetto completo")')]);
  await page.goto(projectUrl);
  assert.match(await page.textContent('.titles'), /Progetto completo/);

  step('shaft design by hand, its DXF, a calculation from it and its report');
  await page.goto(`${projectUrl}/vano`);
  await page.click('.shaft-input [role="radio"]:nth-child(2)');
  const size = page.locator('.shaft-input .form-grid input');
  await size.nth(0).fill('1650');
  await size.nth(1).fill('1800');
  await page.waitForSelector('.shaft-output svg.sheet-svg');
  // a distance of the plan changed on the drawing itself: the platform 20 mm further from the left wall
  const hit = page.locator('.shaft-output .ed-hits .hit[aria-label*="Piattaforma: distanza dalla parete sinistra"]').first();
  const was = Number(/^(\d+)/.exec((await hit.getAttribute('aria-label')) ?? '')?.[1]);
  await hit.click();
  await page.fill('.shaft-output .ed-pop input', String(was + 20));
  await page.press('.shaft-output .ed-pop input', 'Enter');
  await page.waitForSelector('.shaft-output table.fixes tr.hand');
  // the landing door 30 mm apart from the car door, on the drawing; the distance between their axes then reads it
  const land = page.locator('.shaft-output .ed-hits .hit[aria-label*="Porta di piano A: inizio della luce"]').first();
  const landWas = Number(/^(\d+)/.exec((await land.getAttribute('aria-label')) ?? '')?.[1]);
  assert.ok(landWas > 0, 'landing door drawn');
  await land.click();
  await page.fill('.shaft-output .ed-pop input', String(landWas + 30));
  await page.press('.shaft-output .ed-pop input', 'Enter');
  await page.waitForSelector('.shaft-output .ed-hits .hit[aria-label^="30 mm"][aria-label*="Porta di piano A"]');
  // the pit in plan: the car buffers 40 mm further apart, on the drawing; the dimension then reads it
  await page.click('.shaft-output [role="tab"]:has-text("Pianta della fossa")');
  const span = page.locator('.shaft-output .ed-hits .hit[aria-label*="Ammortizzatori di cabina: interasse"]').first();
  const spanWas = Number(/^(\d+)/.exec((await span.getAttribute('aria-label')) ?? '')?.[1]);
  assert.ok(spanWas > 0, 'distance between the car buffers drawn');
  await span.click();
  await page.fill('.shaft-output .ed-pop input', String(spanWas + 40));
  await page.press('.shaft-output .ed-pop input', 'Enter');
  await page.waitForSelector(`.shaft-output .ed-hits .hit[aria-label^="${spanWas + 40}"][aria-label*="Ammortizzatori di cabina: interasse"]`);
  await Promise.all([page.waitForURL(/\/shaft-designs\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.btn-primary')]);
  const designUrl = page.url();
  assert.match(await page.textContent('dl.cartiglio'), /riprodotto/, 'design hash reproduced');
  const dxfHref = await page.getAttribute('a[href$="/dxf"]', 'href');
  const dxf = await page.request.get(`${BASE}${dxfHref}`);
  assert.equal(dxf.status(), 200);
  const dxfText = await dxf.text();
  assert.ok(dxfText.includes('CABINA') && dxfText.trimEnd().endsWith('EOF'), 'DXF with the layer of the car');
  await page.click('a[href*="/calc?design="]');
  await page.waitForSelector('.verdict .big');
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  assert.equal(await page.locator('dl.cartiglio a[href*="/shaft-designs/"]').count(), 1, 'calculation linked to the design');
  const planPdf = await page.request.get(`${BASE}${await page.getAttribute('a[href*="/relazione"]', 'href')}`);
  assert.equal(planPdf.status(), 200);
  const planBody = await planPdf.body();
  assert.equal(planBody.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(planBody.length > body.length, 'the report with the plan is larger');
  const designCalcUrl = page.url();

  step('data of the installation, company logo, drawing set and its revision');
  await page.goto(`${projectUrl}/impianto`);
  await page.locator('.plant-form input').first().fill('M 73 (Sx)');
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
  await page.goto(designCalcUrl);
  await page.fill('main form input[maxlength="12"]', 'S.T.');
  await Promise.all([page.waitForURL(/\/drawing-sets\/[a-z0-9]+$/, { timeout: 60000 }), page.click('main form:has(input[maxlength="12"]) button[type="submit"]')]);
  const setUrl = page.url();
  await page.waitForSelector('.sheet-page svg.sheet-svg image');
  assert.equal(await page.locator('.sheet-page svg.sheet-svg image').count(), 2, 'the company\'s and the client\'s logo on sheet 1');
  const sheets = await page.locator('nav.seg-row a').count();
  assert.ok(sheets >= 8, `sheets ${sheets}`);
  const setPdfHref = await page.getAttribute('a[href$="/pdf"]', 'href');
  const setPdf = await page.request.get(`${BASE}${setPdfHref}`);
  assert.equal(setPdf.status(), 200);
  const setBody = await setPdf.body();
  assert.equal(setBody.subarray(0, 5).toString('latin1'), '%PDF-');
  await page.goto(`${setUrl}?p=5`);
  await page.waitForSelector('.sheet-page svg.sheet-svg');
  await page.fill('main form input[maxlength="120"]', 'Seconda emissione di prova');
  await page.fill('main form:has(input[maxlength="120"]) input[maxlength="12"]', 'S.T.');
  const setPath = new URL(setUrl).pathname;
  await Promise.all([page.waitForURL((u) => /\/drawing-sets\/[a-z0-9]+$/.test(u.pathname) && u.pathname !== setPath, { timeout: 60000 }), page.click('main form:has(input[maxlength="120"]) button[type="submit"]')]);
  assert.match(await page.textContent('h1'), / R1$/, 'revision R1');

  step('the installation in one form: live simulation, save, documents');
  await page.goto(`${projectUrl}/progetto`);
  await page.waitForSelector('.lift-facts .lift-verdict');
  await page.waitForSelector('.lift-stage.live, .lift-stage.failed', { timeout: 120000 });
  await page.click('.scenario-tabs > button:nth-child(2)');
  await page.waitForSelector('.sim-chart svg path.line');
  await page.check('#auto-P');
  await page.waitForSelector('.lift-calc .auto-value .badge');
  await page.waitForSelector('.lift-work .advice .advice-card');
  // the acceptance test: UNI 10411-11 with the machine and the ropes replaced; the checks of what stays are existing
  await page.selectOption('.collaudo select', '10411-11');
  await page.check('.collaudo .parti-grid label:nth-child(2) input');
  await page.waitForSelector('.lift-checks tr.existing .status-pill.existing');
  assert.match(await page.textContent('.lift-work .lift-verdict .badge'), /UNI 10411-11/, 'standard of the acceptance test');
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
  assert.equal(await page.locator('main .alert-warn, main .alert-bad').count(), 0, 'the running engines reproduce the saved design');
  assert.match(await page.textContent('.lift-view .lift-verdict .badge'), /UNI 10411-11/, 'the saved standard');
  assert.match(await page.textContent('.lift-view .panev-bom'), /SU 220 200/, 'the support chosen by hand, saved');
  const liftRelHref = await page.getAttribute('.doc-links a[href*="/relazione"]', 'href');
  const liftRel = await page.request.get(`${BASE}${liftRelHref}`);
  assert.equal(liftRel.status(), 200);
  assert.equal((await liftRel.body()).subarray(0, 5).toString('latin1'), '%PDF-');
  const liftDxfHref = await page.getAttribute('.doc-links a[href$="/dxf"]', 'href');
  assert.equal((await page.request.get(`${BASE}${liftDxfHref}`)).status(), 200);
  // the draft order of the machine the design verified
  assert.match(await page.textContent('main'), /l’argano verificato in questo progetto/, 'the order is for the machine the design verified');
  await orderFiles(page, '/api/lift-designs/');
  // the saved project exported: the drawing set as a draft PDF, every view as DXF and DWG
  for (const [format, magic] of [['pdf', '%PDF-'], ['dxf', '  0\nSECTION'], ['dwg', 'AC1015']]) {
    const res = await page.request.get(`${BASE}${await page.getAttribute(`a[href^="/api/lift-designs/"][href$="/${format}"]`, 'href')}`);
    assert.equal(res.status(), 200, format);
    assert.equal((await res.body()).subarray(0, magic.length).toString('latin1'), magic, format);
  }
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
  await logout(page);

  // the isolation check below provokes a 404 on purpose: the console must be clean up to here
  assert.deepEqual(errors, [], 'browser errors');
  step('second company cannot see the first one');
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto(`${BASE}/it/app/admin`);
  const ownerEmail = `titolare.${stamp}@example.com`;
  await page.fill('input[name="name"]', `Ditta ${stamp}`);
  await page.fill('input[name="ownerName"]', 'Titolare di prova');
  await page.fill('input[name="ownerEmail"]', ownerEmail);
  await page.click('main form:has(input[name="ownerEmail"]) button[type="submit"]');
  const ownerTemp = (await page.locator('.secret').first().textContent())?.trim() ?? '';
  await logout(page);
  await login(page, ownerEmail, ownerTemp);
  const ownerNext = `Titolare${stamp}Password9`;
  await page.fill('input[name="current"]', ownerTemp);
  await page.fill('input[name="next"]', ownerNext);
  await page.fill('input[name="confirm"]', ownerNext);
  await page.click('main form button[type="submit"]');
  await page.waitForSelector('.alert-ok');
  const other = await page.goto(calcUrl);
  assert.equal(other.status(), 404, 'calculation of another company');
  const otherPdf = await page.request.get(`${BASE}${href}`);
  assert.equal(otherPdf.status(), 404, 'report of another company');
  assert.equal((await page.goto(designUrl)).status(), 404, 'shaft design of another company');
  assert.equal((await page.request.get(`${BASE}${dxfHref}`)).status(), 404, 'DXF of another company');
  assert.equal((await page.goto(setUrl)).status(), 404, 'drawing set of another company');
  assert.equal((await page.request.get(`${BASE}${setPdfHref}`)).status(), 404, 'drawing set PDF of another company');
  assert.equal((await page.goto(liftUrl)).status(), 404, 'lift design of another company');
  assert.equal((await page.request.get(`${BASE}${liftRelHref}`)).status(), 404, 'report of the lift design of another company');
  for (const format of ['pdf', 'dxf', 'dwg']) assert.equal((await page.request.get(`${BASE}${new URL(liftUrl).pathname.replace(/^\/it\/app/, '/api')}/${format}`)).status(), 404, `${format} export of another company`);

  if (sink) await accountFlows({ BASE, stamp, step, sink, newPage: () => newPage(browser) });
  else step('accounts without an administrator: skipped (no MAILBOX_PORT)');

  step('all good');
} finally {
  await browser.close();
  await sink?.close();
}
