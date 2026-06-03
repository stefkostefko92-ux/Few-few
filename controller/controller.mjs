#!/usr/bin/env node
/**
 * Tanoth multi-account controller (self-hosted; no cloud).
 *
 * Runs several Tanoth accounts on ONE machine/VPS — each in its own Chromium
 * profile with the extension loaded, its own settings and optional proxy — and
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
import { validateConfig, enabledAccounts } from './lib/config.mjs';
import { accountView, renderDashboardHtml } from './lib/dashboard.mjs';
import { mergeSettings } from '../src/shared/defaults.js';

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
  const s = mergeSettings(partial);
  s.general.enabled = true;
  s.general.startOnLoad = true;   // auto-start once the game protocol is ready
  return s;
}

/* ------------------------------ launching ------------------------------ */
async function launchAccount(acc, opts) {
  if (registry.get(acc.id)?.status === 'running') return;
  if (opts.dryRun) {
    registry.set(acc.id, { account: acc, status: 'dry-run', startedAt: Date.now(), lastStats: {} });
    console.log(`[dry-run] would launch ${acc.id} -> ${acc.world} (profile ${acc.profileDir}${acc.proxy ? ', proxy' : ''})`);
    return;
  }
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
    if (e.status !== 'running' || !e.sw) continue;
    try {
      const stats = await e.sw.evaluate(() => chrome.storage.local.get('tanothBotStats').then((r) => r.tanothBotStats || {}));
      e.lastStats = stats || {};
    } catch (_) { /* sw may be recycling */ }
  }
}

/* ------------------------------ dashboard ------------------------------ */
function startDashboard(cfg) {
  const port = cfg.raw.dashboard?.port || 8899;
  const token = cfg.raw.dashboard?.token || '';
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    if (token && u.searchParams.get('token') !== token) { res.writeHead(401); return res.end('unauthorized'); }
    if (u.pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([...registry.values()].map((e) => accountView(e))));
    }
    if (u.pathname === '/api/start' && req.method === 'POST') {
      const e = registry.get(u.searchParams.get('id'));
      if (e) launchAccount(e.account, { headless: cfg.headless });
      res.writeHead(200); return res.end('ok');
    }
    if (u.pathname === '/api/stop' && req.method === 'POST') {
      await stopAccount(u.searchParams.get('id'));
      res.writeHead(200); return res.end('ok');
    }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderDashboardHtml([...registry.values()].map((e) => accountView(e)), { token }));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${port}${token ? '?token=' + token : ''}`));
}

/* ------------------------------ commands ------------------------------- */
async function cmdRun(cfg, opts) {
  for (const acc of enabledAccounts(cfg.parsed)) await launchAccount(acc, opts);
  startDashboard(Object.assign({}, cfg, { headless: opts.headless }));
  if (!opts.dryRun) setInterval(pollStats, 10000);
  else { setTimeout(() => process.exit(0), 300); } // dry-run: validate + exit
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
  console.log(`\n[${acc.id}] Log into Tanoth in the opened window, reach the game, then press Enter here to save the session…`);
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
  const headless = argv.includes('--headful') ? false : (process.env.HEADLESS === 'false' ? false : 'new');
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
