// The smoke test's tools: Playwright from the local install or the global one, and the browser steps every part of the
// test uses (a page that records console errors, sign-in and sign-out, React hydration, the draft order's files).
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
export function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require(`${execSync('npm root -g').toString().trim()}/playwright`);
  }
}

export const step = (s) => process.stdout.write(`▸ ${s}\n`);

export function smokeKit(BASE) {
  async function newPage(browser) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
    const errors = [];
    // with the page's address: an intermittent error (React #418 twice in many runs) says where it happened
    page.on('pageerror', (e) => errors.push(`pageerror ${page.url()} ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${page.url()} ${m.text()}`); });
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
  return { newPage, login, hydrated, orderFiles, logout };
}
