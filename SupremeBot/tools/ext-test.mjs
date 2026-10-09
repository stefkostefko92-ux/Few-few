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

  // Per-hero settings, through the real service worker: every hero keeps his
  // own settings; a new hero starts from the defaults; forgetting drops him.
  {
    const { page } = await openPage('options/options.html');
    const r = await page.evaluate(async () => {
      const send = (m) => chrome.runtime.sendMessage(m);
      const A = 's1-us:Ragnar', B = 's2-bg:Lagertha';
      const defaults = await send({ type: 'GET_SETTINGS' });
      const a1 = await send({ type: 'BIND_HERO', heroKey: A, name: 'Ragnar', server: 's1-us' });
      const b1 = await send({ type: 'BIND_HERO', heroKey: B, name: 'Lagertha', server: 's2-bg' });
      const aS = await send({ type: 'GET_SETTINGS', heroKey: A });
      aS.general.actionIntervalSec = 45; aS.dungeon.enabled = true;
      await send({ type: 'SAVE_SETTINGS', settings: aS, heroKey: A });
      const aAfter = await send({ type: 'GET_SETTINGS', heroKey: A });
      const bAfter = await send({ type: 'GET_SETTINGS', heroKey: B });
      const defAfter = await send({ type: 'GET_SETTINGS' });
      const list = await send({ type: 'LIST_HEROES' });
      const bad = await send({ type: 'BIND_HERO', heroKey: '__proto__', name: 'x' });
      await send({ type: 'FORGET_HERO', heroKey: B });
      const list2 = await send({ type: 'LIST_HEROES' });
      return {
        newHero: a1.isNew && b1.isNew,
        aSaved: aAfter.general.actionIntervalSec === 45 && aAfter.dungeon.enabled === true,
        bUntouched: bAfter.general.actionIntervalSec === defaults.general.actionIntervalSec,
        defaultsUntouched: defAfter.general.actionIntervalSec === defaults.general.actionIntervalSec,
        listed: list.map((h) => h.key).sort().join('|'),
        badRejected: bad && bad.ok === false,
        forgotten: list2.map((h) => h.key).join('|')
      };
    });
    check('heroes: first visit creates settings from the defaults', r.newHero, JSON.stringify(r));
    check('heroes: a hero keeps his own saved settings', r.aSaved, JSON.stringify(r));
    check('heroes: another hero and the defaults are untouched', r.bUntouched && r.defaultsUntouched, JSON.stringify(r));
    check('heroes: listed, junk key rejected, forget removes', r.listed === 's1-us:Ragnar|s2-bg:Lagertha' && r.badRejected && r.forgotten === 's1-us:Ragnar', JSON.stringify(r));
    // The picker shows the heroes and switches the edited settings.
    await page.reload(); await page.waitForTimeout(600);
    const pick = await page.evaluate(() => [...document.querySelectorAll('#hero-sel option')].map((o) => o.textContent));
    check('heroes: options page offers a hero picker', pick.length === 2 && /Ragnar/.test(pick[1]), JSON.stringify(pick));
    await page.close();
  }
  // A LOGGED-IN hero (faked session + XML-RPC): the panel's Settings opens HIS
  // page, a change saved there shows in the game, a chip toggled in the game
  // shows on the open settings page, and Start from the popup marks the panel.
  {
    const HERO = 's3-bg:Bjorn';
    const xml = '<?xml version="1.0"?><methodResponse><params><param><value><struct>' +
      '<member><name>name</name><value><string>Bjorn</string></value></member>' +
      '<member><name>level</name><value><i4>42</i4></value></member>' +
      '<member><name>gold</name><value><i4>1000</i4></value></member>' +
      '</struct></value></param></params></methodResponse>';
    await context.route('https://s3-bg.tanoth.gameforge.com/**', (route) => {
      if (/xmlrpc/.test(route.request().url())) return route.fulfill({ status: 200, contentType: 'text/xml', body: xml });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><script>window.flashvars={sessionID:"fake-session"}</script></head><body><div id="game"></div></body></html>' });
    });
    const game = await context.newPage();
    const gameErrors = [];
    game.on('pageerror', (e) => gameErrors.push(e.message));
    await game.goto('https://s3-bg.tanoth.gameforge.com/webroot/game/', { waitUntil: 'load' }).catch(() => {});
    const panelSel = '#tanoth-bot-panel';
    let bound = false;
    for (let i = 0; i < 20 && !bound; i++) {
      await game.waitForTimeout(500);
      bound = await game.evaluate(() => /Bjorn/.test(document.querySelector('#tanoth-bot-panel [data-el="log"]')?.textContent || ''));
    }
    check('hero tab: the logged-in hero is recognised', bound);

    // Panel "Settings" -> options page of THIS hero.
    const opened = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await game.click(`${panelSel} [data-act="options"]`);
    const opt = await opened;
    if (opt) await opt.waitForLoadState('load');
    await (opt || game).waitForTimeout(900);
    const optUrl = opt ? new URL(opt.url()) : null;
    check('panel Settings opens the logged-in hero\'s page', optUrl && optUrl.searchParams.get('hero') === HERO, opt ? opt.url() : 'no tab opened');
    const picked = opt ? await opt.evaluate(() => document.getElementById('hero-sel')?.value) : null;
    check('settings page edits that hero', picked === HERO, String(picked));

    // Clicking Settings again focuses the same tab instead of piling up copies.
    const before = context.pages().length;
    await game.click(`${panelSel} [data-act="options"]`);
    await game.waitForTimeout(900);
    check('the hero\'s settings tab is reused, not duplicated', context.pages().length === before, `${before} -> ${context.pages().length}`);

    if (opt) {
      // Change in Settings + Save -> the game panel shows it.
      const dungeonOn = () => game.evaluate(() => document.querySelector('#tanoth-bot-panel [data-act="mod:dungeon"]')?.getAttribute('aria-checked'));
      const was = await dungeonOn();
      await opt.evaluate(() => { const cb = document.querySelector('input[data-field="dungeon.enabled"]'); cb.click(); });
      await opt.click('#save');
      await game.waitForTimeout(800);
      const now = await dungeonOn();
      check('a module switched in Settings shows in the game panel', was !== now && (now === 'true' || now === 'false'), `${was} -> ${now}`);

      // Toggle in the game -> the open settings page follows (no stale copy).
      await game.click(`${panelSel} [data-act="mod:work"]`);
      await game.waitForTimeout(800);
      const panelWork = await game.evaluate(() => document.querySelector('#tanoth-bot-panel [data-act="mod:work"]')?.getAttribute('aria-checked') === 'true');
      const s = await opt.evaluate((k) => chrome.runtime.sendMessage({ type: 'GET_SETTINGS', heroKey: k }), HERO);
      const pageWork = await opt.evaluate(() => { const cb = document.querySelector('input[data-field="work.enabled"]'); return cb ? cb.checked : null; });
      check('a chip toggled in the game updates the open settings page', s.work.enabled === panelWork && pageWork === panelWork, JSON.stringify({ panelWork, saved: s.work.enabled, pageWork }));

      // Options opened without ?hero (chrome://extensions) picks the live hero.
      const plain = await context.newPage();
      await plain.goto(`chrome-extension://${extId}/options/options.html`, { waitUntil: 'load' });
      await plain.waitForTimeout(1200);
      const auto = await plain.evaluate(() => document.getElementById('hero-sel')?.value);
      check('plain Settings page opens on the logged-in hero', auto === HERO, String(auto));
      await plain.close();

      // Start from the popup -> the panel is marked as running (also while
      // it is hidden: the corner button lights up).
      await game.click(`${panelSel} [data-act="hide"]`);
      const r = await opt.evaluate(async () => {
        const [t] = await chrome.tabs.query({ url: 'https://s3-bg.tanoth.gameforge.com/*' });
        return chrome.runtime.sendMessage({ type: 'CONTROL', action: 'start', tabId: t.id });
      });
      await game.waitForTimeout(700);
      const running = await game.evaluate(() => ({ cls: document.getElementById('tanoth-bot-panel').classList.contains('tb-running') || document.getElementById('tanoth-bot-panel').classList.contains('tb-break'), start: document.querySelector('#tanoth-bot-panel [data-act="start"]').disabled, fab: !!document.querySelector('#tanoth-bot-fab.tb-running') }));
      check('Start from the popup marks the in-game panel as running', r && r.ok && running.cls && running.start && running.fab, JSON.stringify({ r, running }));
      await opt.evaluate(async () => {
        const [t] = await chrome.tabs.query({ url: 'https://s3-bg.tanoth.gameforge.com/*' });
        return chrome.runtime.sendMessage({ type: 'CONTROL', action: 'stop', tabId: t.id });
      });
      await opt.close();
    }
    check('hero tab: no uncaught JS errors', gameErrors.length === 0, gameErrors.join('\n     '));
    await game.close();
  }
} finally {
  await context.close();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}

console.log(`\n${pass} extension checks passed${failed ? `, ${failed} FAILED` : ''}.`);
process.exit(failed ? 1 : 0);
