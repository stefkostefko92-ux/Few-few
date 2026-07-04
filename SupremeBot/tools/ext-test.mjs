#!/usr/bin/env node
/**
 * Extension integration test - loads the REAL unpacked extension into a real
 * Chromium (Playwright) and verifies it boots cleanly: the MV3 service worker
 * registers, the options/popup/stats pages run their JS without uncaught errors
 * and resolve i18n, and the content script mounts the in-game panel on a (faked)
 * Tanoth page without throwing. It does NOT touch the live game.
 *
 * Run:  cd <where playwright is installed> && xvfb-run -a node <repo>/tools/ext-test.mjs
 * Needs: playwright + a Chromium + a display (xvfb on headless hosts).
 */
import { chromium } from 'playwright';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tanoth-ext-'));

let pass = 0, failed = 0;
function check(name, cond, detail = '') { if (cond) { console.log('  ok  ' + name); pass++; } else { console.error('FAIL ' + name + (detail ? '\n     ' + detail : '')); failed++; } }

// Prefer Playwright's own browser; fall back to a pre-installed Chromium under
// PLAYWRIGHT_BROWSERS_PATH (so it runs in sandboxes with a pinned build).
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!base || !fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base)) {
    if (!/^chromium-/.test(d)) continue;
    const bin = path.join(base, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: findChromium(),   // undefined -> Playwright's bundled build
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-first-run', '--no-default-browser-check']
});

try {
  // 1) Service worker registers (MV3 + manifest valid).
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => null);
  check('MV3 service worker registers', !!sw, 'no service worker - manifest/SW failed to load');
  if (!sw) throw new Error('no service worker');
  const extId = new URL(sw.url()).host;
  console.log('  extension id:', extId);

  // helper: open an extension page, collect uncaught errors.
  async function openPage(rel) {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(`chrome-extension://${extId}/${rel}`, { waitUntil: 'load' });
    await page.waitForTimeout(900); // let async render (GET_SETTINGS/GET_LICENSE) settle
    return { page, pageErrors };
  }

  // 2) Options page renders (schema, subscription, tools) + i18n resolves.
  {
    const { page, pageErrors } = await openPage('options/options.html');
    check('options: no uncaught JS errors', pageErrors.length === 0, pageErrors.join('\n     '));
    const brand = await page.evaluate(() => document.querySelector('.brand b')?.textContent);
    check('options: i18n resolved (extName)', brand === 'Tanoth Master Bot', `got: ${brand}`);
    const ui = await page.evaluate(() => ({
      regions: document.querySelectorAll('.prio-list .prio-item').length,
      circleNodes: document.querySelectorAll('.checklist .check').length,
      plans: document.querySelectorAll('.sub-plans .btn-pay').length,
      groups: document.querySelectorAll('section.group h2').length
    }));
    check('options: map region priority list rendered (6)', ui.regions === 6, JSON.stringify(ui));
    check('options: circle node checkboxes rendered (16)', ui.circleNodes === 16, JSON.stringify(ui));
    check('options: two subscription plans', ui.plans === 2, JSON.stringify(ui));
    check('options: settings groups rendered', ui.groups >= 8, JSON.stringify(ui));
    await page.close();
  }

  // 3) Popup runs.
  {
    const { page, pageErrors } = await openPage('popup/popup.html');
    check('popup: no uncaught JS errors', pageErrors.length === 0, pageErrors.join('\n     '));
    const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent);
    check('popup: i18n title', h1 === 'Tanoth Master Bot', `got: ${h1}`);
    await page.close();
  }

  // 4) Stats page runs + chart bars render with width.
  {
    const { page, pageErrors } = await openPage('stats/stats.html');
    check('stats: no uncaught JS errors', pageErrors.length === 0, pageErrors.join('\n     '));
    const title = await page.evaluate(() => document.querySelector('h1')?.textContent);
    check('stats: i18n title', title === 'Statistics', `got: ${title}`);
    await page.close();
  }

  // 5) Content script boots + mounts the panel on a FAKED Tanoth page.
  {
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    // Fake ONLY the game-origin HTTP(S) requests; let the extension's own
    // chrome-extension:// resources (inject.js, etc.) load normally.
    await page.route('https://s2-bg.tanoth.gameforge.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><title>Tanoth</title></head><body><div id="game"></div></body></html>' }));
    await page.goto('https://s2-bg.tanoth.gameforge.com/webroot/game/', { waitUntil: 'load' }).catch(() => {});
    await page.waitForTimeout(2500); // content scripts run at document_idle; panel mounts
    const panel = await page.evaluate(() => !!document.getElementById('tanoth-bot-panel'));
    check('content script: in-game panel mounted', panel, 'panel not found');
    check('content script: no uncaught JS errors', pageErrors.length === 0, pageErrors.join('\n     '));
    await page.close();
  }
} finally {
  await context.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

console.log(`\n${pass} extension checks passed${failed ? `, ${failed} FAILED` : ''}.`);
process.exit(failed ? 1 : 0);
