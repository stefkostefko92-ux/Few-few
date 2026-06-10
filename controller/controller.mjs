#!/usr/bin/env node
/**
 * Tanoth multi-account controller (self-hosted; no cloud).
 *
 * Runs several Tanoth accounts on ONE machine/VPS - each in its own Chromium
 * profile with the extension loaded, its own settings and optional proxy - and
 * exposes a small local dashboard to watch/start/stop them. You run it; nobody
 * else holds your logins (sessions live in per-account profile folders).
 *
 * Usage:
 *   node controller.mjs setup <id>     # first-time login for one account (headful)
 *   node controller.mjs run            # launch all enabled accounts + dashboard
 *   node controller.mjs run --dry-run  # validate config & flow without browsers
 *   node controller.mjs list
 *
 * Config: accounts.json (copy accounts.example.json). On a headless VPS run with
 * Xvfb (see CONTROLLER.md).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { validateConfig, enabledAccounts, accountSettings } from './lib/config.mjs';
import { accountView, renderDashboardHtml, dashboardResponse } from './lib/dashboard.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_PATH = path.resolve(HERE, '..');                 // the extension root
const CONFIG_PATH = path.resolve(HERE, 'accounts.json');

const registry = new Map(); // id -> { account, status, context, page, sw, startedAt, lastStats }

/* ------------------------------- config -------------------------------- */
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`No accounts.json found. Copy accounts.example.json to accounts.json and edit it.`);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const parsed = validateConfig(raw);
  if (!parsed.ok) { console.error('Config errors:\n - ' + parsed.errors.join('\n - ')); process.exit(1); }
  return { raw, parsed };
}

function loadAccountSettings(acc) {
  let partial = {};
  if (acc.settingsFile) {
    const p = path.resolve(HERE, acc.settingsFile);
    if (fs.existsSync(p)) { try { partial = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) {} }
  }
  return accountSettings(partial);   // merge + force enabled/startOnLoad (unit-tested)
}

/* ------------------------------ launching ------------------------------ */
async function launchAccount(acc, opts) {
  const cur = registry.get(acc.id)?.status;
  if (cur === 'running' || cur === 'launching') return;
  if (opts.dryRun) {
    registry.set(acc.id, { account: acc, status: 'dry-run', startedAt: Date.now(), lastStats: {} });
    console.log(`[dry-run] would launch ${acc.id} -> ${acc.world} (profile ${acc.profileDir}${acc.proxy ? ', proxy' : ''})`);
    return;
  }
  // Claim the slot synchronously: a second Start click while this launch is
  // still awaiting must be a no-op, not a parallel launch on the same profile.
  registry.set(acc.id, { account: acc, status: 'launching', startedAt: Date.now(), lastStats: registry.get(acc.id)?.lastStats || {} });
  const { chromium } = await import('playwright');
  const profileDir = path.resolve(HERE, acc.profileDir);
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--no-first-run', '--no-default-browser-check'
  ];
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: opts.headless,
    args,
    viewport: { width: 1280, height: 800 },
    proxy: acc.proxy ? { server: acc.proxy } : undefined
  });

  // Push this account's settings into the extension's storage.
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  if (sw) {
    try { await sw.evaluate((s) => chrome.storage.local.set({ tanothBotSettings: s }), loadAccountSettings(acc)); }
    catch (e) { console.warn(`[${acc.id}] could not push settings: ${e.message}`); }
  }

  const page = context.pages()[0] || await context.newPage();
  await page.goto(acc.world, { waitUntil: 'domcontentloaded' }).catch(() => {});

  registry.set(acc.id, { account: acc, status: 'running', context, page, sw, startedAt: Date.now(), lastStats: {} });
  console.log(`[${acc.id}] launched -> ${acc.world}`);
}

async function stopAccount(id) {
  const e = registry.get(id);
  if (!e) return;
  try { await e.context?.close(); } catch (_) {}
  registry.set(id, { account: e.account, status: 'stopped', lastStats: e.lastStats || {} });
  console.log(`[${id}] stopped`);
}

async function pollStats() {
  for (const e of registry.values()) {
    if (e.status !== 'running' || !e.context) continue;
    try {
      // The MV3 service worker can be evicted; re-acquire the handle if the
      // cached one is dead so stats don't silently stop updating.
      if (!e.sw || e.sw.isClosed?.()) e.sw = e.context.serviceWorkers()[0] || null;
      if (!e.sw) continue;
      const stats = await e.sw.evaluate(() => chrome.storage.local.get('tanothBotStats').then((r) => r.tanothBotStats || {}));
      e.lastStats = stats || {};
    } catch (_) {
      e.sw = e.context.serviceWorkers()[0] || null; // refresh for next tick
    }
  }
}

/* ------------------------------ dashboard ------------------------------ */
function startDashboard(cfg, opts) {
  const port = cfg.raw.dashboard?.port || 8899;
  let token = cfg.raw.dashboard?.token || '';
  if (!token || token === 'change-me') {     // never run with the example token
    token = (globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
    console.warn('Dashboard token was missing/"change-me" - generated a random one for this session.');
  }
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const views = () => [...registry.values()].map((e) => accountView(e));
    const r = dashboardResponse({
      method: req.method, pathname: u.pathname,
      query: Object.fromEntries(u.searchParams), origin: req.headers.origin, token,
      views: views(), render: () => renderDashboardHtml(views(), { token })
    });
    if (r.action === 'start') {
      const e = registry.get(r.id);
      // Never fire-and-forget: an unhandled rejection here (e.g. a locked
      // profile dir) would take down the whole controller process.
      if (e) {
        launchAccount(e.account, opts).catch((err) => {
          console.error(`[${r.id}] launch failed: ${err.message}`);
          registry.set(r.id, { account: e.account, status: 'error', lastStats: e.lastStats || {} });
        });
      }
    }
    if (r.action === 'stop') { await stopAccount(r.id); }
    res.writeHead(r.status, { 'Content-Type': r.contentType });
    res.end(r.body);
  });
  server.listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${port}?token=${token}`));
}

/* ------------------------------ commands ------------------------------- */
async function cmdRun(cfg, opts) {
  if (opts.dryRun) {                          // validate config + flow, no browsers, no socket
    for (const acc of enabledAccounts(cfg.parsed)) await launchAccount(acc, opts);
    console.log('dry-run OK'); return;
  }
  if (!opts.headless && process.platform === 'linux' && !process.env.DISPLAY) {
    console.warn('No $DISPLAY detected. Chromium needs a display to load the extension - run under: xvfb-run -a node controller.mjs run');
  }
  for (const acc of enabledAccounts(cfg.parsed)) {
    // One account failing to launch (locked profile, bad proxy) should not
    // stop the rest from coming up.
    try { await launchAccount(acc, opts); }
    catch (e) {
      console.error(`[${acc.id}] launch failed: ${e.message}`);
      registry.set(acc.id, { account: acc, status: 'error', lastStats: {} });
    }
  }
  startDashboard(cfg, opts);
  setInterval(pollStats, 10000);
}

async function cmdSetup(cfg, id) {
  const acc = cfg.parsed.accounts.find((a) => a.id === id);
  if (!acc) { console.error(`Unknown account id: ${id}`); process.exit(1); }
  const { chromium } = await import('playwright');
  const profileDir = path.resolve(HERE, acc.profileDir);
  fs.mkdirSync(profileDir, { recursive: true });
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
    proxy: acc.proxy ? { server: acc.proxy } : undefined
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(acc.world).catch(() => {});
  console.log(`\n[${acc.id}] Log into Tanoth in the opened window, reach the game, then press Enter here to save the session...`);
  await new Promise((r) => { const rl = readline.createInterface({ input: process.stdin }); rl.question('', () => { rl.close(); r(); }); });
  await context.close();
  console.log(`[${acc.id}] session saved to ${acc.profileDir}`);
}

function cmdList(cfg) {
  for (const a of cfg.parsed.accounts) {
    console.log(`${a.enabled ? '●' : '○'} ${a.id}  ${a.label}  ${a.world}${a.proxy ? '  (proxy)' : ''}`);
  }
}

/* -------------------------------- main --------------------------------- */
async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0] || 'run';
  const dryRun = argv.includes('--dry-run');
  // Headful by default: Chromium only loads extensions with a display. Use
  // `xvfb-run` on a headless VPS. `--headless` opts into experimental new
  // headless (extension loading there is unreliable - not recommended).
  const headless = argv.includes('--headless') ? 'new' : false;
  const cfg = loadConfig();
  cfg.headless = headless;

  if (command === 'list') return cmdList(cfg);
  if (command === 'setup') return cmdSetup(cfg, argv[1]);
  if (command === 'run') return cmdRun(cfg, { dryRun, headless });
  console.error(`Unknown command: ${command}`); process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
