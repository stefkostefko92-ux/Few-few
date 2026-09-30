// End-to-end smoke test against a running Argano (local or staging), with a real browser:
//   health → public page (no console or CSP errors) → sign-in → installation → calculation → saved snapshot with
//   reproduced hash → calculation report (PDF) → new user who must change the password → a second company that
//   cannot open the first company's calculation.
// Usage: BASE_URL=http://localhost:3100 ADMIN_EMAIL=… ADMIN_PASSWORD=… node scripts/smoke.mjs
// Playwright is not a dependency of the app: the local install is used, else the global one.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

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
async function logout(page) {
  await Promise.all([page.waitForURL(/\/it\/login$/), page.click('header form button[type="submit"]')]);
}

const browser = await chromium.launch();
try {
  step('health');
  const health = await (await fetch(`${BASE}/api/health`)).json();
  assert.equal(health.status, 'ok');
  assert.equal(health.app, 'argano');

  step('public page');
  const { page, errors } = await newPage(browser);
  const res = await page.goto(`${BASE}/it`);
  assert.equal(res.status(), 200);
  assert.ok((res.headers()['content-security-policy'] ?? '').includes("'nonce-"), 'CSP with nonce');
  assert.equal(await page.locator('h1').count(), 1);

  step('sign-in and installation');
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto(`${BASE}/it/app/projects/new`);
  await page.fill('input[name="name"]', `Smoke ${stamp}`);
  await page.fill('input[name="city"]', 'Milano');
  await Promise.all([page.waitForURL(/\/projects\/(?!new)[a-z0-9]+$/), page.click('main form button[type="submit"]')]);

  step('calculation');
  await page.click('a[href$="/calc"]');
  await page.waitForSelector('.verdict .big');
  await page.fill('#n_D', '600');
  await page.waitForTimeout(300);
  await Promise.all([page.waitForURL(/\/calculations\/[a-z0-9]+$/, { timeout: 30000 }), page.click('.savebar button.primary')]);
  const calcUrl = page.url();
  assert.match(await page.textContent('dl.meta-grid'), /riprodotto/, 'hash reproduced');

  step('calculation report (PDF)');
  const href = await page.getAttribute('a[href*="/relazione"]', 'href');
  const pdf = await page.request.get(`${BASE}${href}`);
  assert.equal(pdf.status(), 200);
  assert.equal(pdf.headers()['content-type'], 'application/pdf');
  const body = await pdf.body();
  assert.equal(body.subarray(0, 5).toString('latin1'), '%PDF-');

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

  step('all good');
} finally {
  await browser.close();
}
