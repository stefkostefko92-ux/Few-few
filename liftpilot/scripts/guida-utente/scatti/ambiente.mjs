// What every scene of the guide's screenshots shares (scripts/guida-utente/screenshot.mjs): the settings from the
// environment, the shots the chapters ask for, the fictional demo, the state kept between scenes, the browser and the
// signed-in sessions of the demo's people.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startMailSink } from '../../mail-sink.mjs';
import { loadPlaywright, smokeKit } from '../../smoke-kit.mjs';

export const BASE = (process.env.BASE_URL ?? 'http://localhost:3520').replace(/\/+$/, '');
export const ADMIN = { email: process.env.ADMIN_EMAIL ?? 'admin@carbonstealth.eu', password: process.env.ADMIN_PASSWORD ?? '' };
if (!ADMIN.password) throw new Error('ADMIN_PASSWORD is required');
const MAILBOX = Number(process.env.MAILBOX_PORT ?? 0);
if (!MAILBOX) throw new Error('MAILBOX_PORT is required (the invitation, registration and reset links come by e-mail)');
export const OUT = process.env.OUT ?? 'guida-screenshot';
const CHAPTERS = process.env.CHAPTERS;
if (!CHAPTERS) throw new Error('CHAPTERS is required (the directory of the chapters’ JSON files)');
export const STATE_DIR = process.env.STATE_DIR ?? '';
export const ONLY = (process.env.SCENES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
export const { hydrated } = smokeKit(BASE);

// ── what the chapters ask for ───────────────────────────────────────────────────────────────────────────────────────
/** id → { what, page, chapter } for every shot of every chapter except the index. */
function readShots() {
  const wanted = new Map();
  for (const file of readdirSync(CHAPTERS).filter((f) => f.endsWith('.json') && f !== 'indice.json').sort()) {
    const chapter = JSON.parse(readFileSync(join(CHAPTERS, file), 'utf8'));
    for (const page of chapter.pages ?? []) {
      for (const s of page.shots ?? []) if (!wanted.has(s.id)) wanted.set(s.id, { what: s.what, page: page.title, chapter: chapter.key });
    }
  }
  return wanted;
}
export const wanted = readShots();
export const taken = new Map(); // id → file
export const skipped = new Map(); // id → why
mkdirSync(OUT, { recursive: true });
export const want = (id) => wanted.has(id);
export const skip = (ids, why) => { for (const id of [].concat(ids)) if (want(id) && !taken.has(id)) skipped.set(id, why); };

// ── the demo: invented, every address on the reserved domain .example ─────────────────────────────────────────────────
export const DOMAIN = 'ascensori-esempio.example';
export const COMPANY = 'Ascensori Esempio S.r.l.';
export const PEOPLE = {
  owner: { name: 'Marco Bianchi', email: `marco.bianchi@${DOMAIN}`, role: 'OWNER', password: 'Esempio-Bianchi-2026' },
  chief: { name: 'Giulia Rossi', email: `giulia.rossi@${DOMAIN}`, role: 'CHIEF_TECHNICIAN', password: 'Esempio-Rossi-2026' },
  engineer: { name: 'Luca Ferri', email: `luca.ferri@${DOMAIN}`, role: 'ENGINEER', password: 'Esempio-Ferri-2026' },
  technician: { name: 'Paolo Conti', email: `paolo.conti@${DOMAIN}`, role: 'TECHNICIAN', password: 'Esempio-Conti-2026' },
  sales: { name: 'Sara Galli', email: `sara.galli@${DOMAIN}`, role: 'SALES', password: 'Esempio-Galli-2026' },
};
/** The company that registers through a beta invitation (and has nothing yet): its Titolare. */
export const TESTER = { company: 'Elevatori Esempio Brescia S.r.l.', city: 'Brescia', name: 'Anna Colombo', email: `anna.colombo@${DOMAIN}`, password: 'Esempio-Colombo-2026' };
export const MASK = '••••••••';

// ── what one scene leaves to the next (in memory; in STATE_DIR when asked, so that SCENES=a,b can run alone) ────────────
const stateFile = STATE_DIR ? join(STATE_DIR, 'state.json') : '';
if (STATE_DIR) mkdirSync(STATE_DIR, { recursive: true });
export const S = stateFile && existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
export const saveState = () => { if (stateFile) writeFileSync(stateFile, JSON.stringify(S, null, 1)); };

// ── the browser ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const sink = startMailSink(MAILBOX);
await sink.ready;
const { chromium } = loadPlaywright();
// Italian everywhere: the native date fields (21/10/2026) and the file fields follow the browser's language
export const browser = await chromium.launch({ args: ['--lang=it-IT', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  env: { ...process.env, LANG: 'it_IT.UTF-8', LANGUAGE: 'it_IT' } });
export const sessions = new Map(); // who → { ctx, page, errors }
export const DESKTOP = { width: 1440, height: 900 };

/** A page of its own context: 1440 × 900, scale 1, with the console errors collected (their address with them). */
export async function fresh(storageState, gpu = false) {
  const ctx = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 1, locale: 'it-IT', timezoneId: 'Europe/Rome', storageState });
  // without a graphics card the browser draws WebGL in software (SwiftShader), which the 3D view refuses on purpose
  // (src/components/machine/gpu.ts softwareRenderer); for the guide's picture of the simulation only, the renderer's
  // name is given as a card's, so that the 3D is drawn (slowly) instead of its «not available» note
  if (gpu) await ctx.addInitScript(() => {
    const real = globalThis.WebGL2RenderingContext?.prototype.getParameter;
    if (!real) return;
    globalThis.WebGL2RenderingContext.prototype.getParameter = function patched(p) {
      const v = real.call(this, p);
      return typeof v === 'string' && /swiftshader|llvmpipe|software/i.test(v) ? 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.6)' : v;
    };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror ${page.url()} ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${page.url()} ${m.text()}`); });
  return { ctx, page, errors };
}

/** The signed-in session of a person (the administrator or one of PEOPLE): signed in once, kept for the whole run. */
export async function as(who) {
  if (sessions.has(who)) return sessions.get(who);
  const file = STATE_DIR ? join(STATE_DIR, `session-${who}.json`) : '';
  const stored = file && existsSync(file);
  const s = await fresh(stored ? file : undefined);
  if (!stored) {
    const { email, password } = who === 'admin' ? ADMIN : { email: PEOPLE[who].email, password: S.passwords?.[who] ?? PEOPLE[who].password };
    await s.page.goto(`${BASE}/it/login`);
    await s.page.fill('input[name="email"]', email);
    await s.page.fill('input[name="password"]', password);
    await Promise.all([s.page.waitForURL(/\/it\/app(\/account\?first=1)?$/), s.page.click('main form button[type="submit"]')]);
    if (file) await s.ctx.storageState({ path: file });
  }
  sessions.set(who, s);
  return s;
}

/** A new person's own session, signed in by the scene itself (their context stays signed in for the whole run). */
export function adopt(who, s, password) {
  S.passwords = { ...S.passwords, [who]: password };
  sessions.set(who, s);
}

// ── small steps every scene uses ───────────────────────────────────────────────────────────────────────────────────────
export const text = async (loc) => ((await loc.first().textContent()) ?? '').trim();
export const goto = async (page, path) => { await page.goto(path.startsWith('http') ? path : `${BASE}${path}`); };
/** The interface's mode (round 52) from the top bar's switch, kept with the user: «semplice» or «esperto». */
export async function modalita(page, m) {
  if (await page.locator(`[data-modalita="${m}"]`).count()) return;
  await hydrated(page, `#ws-mode-${m}`);
  await page.click(`label[for="ws-mode-${m}"]`);
  await page.waitForSelector(`[data-modalita="${m}"]`);
  await page.waitForTimeout(400);
}
/** A field of a form that shows one step at a time («Semplice», round 53): its step shown first — the event the bar of the
 *  steps sends (components/passi/mostra.ts) —, then the field in view. */
export async function inVista(page, sel) {
  await page.waitForSelector(sel, { state: 'attached' });
  await page.evaluate((s) => {
    const box = globalThis.document.querySelector(s)?.closest('[data-passo][hidden]');
    if (box) globalThis.document.dispatchEvent(new globalThis.CustomEvent('passo-mostra', { detail: box.getAttribute('data-passo') }));
  }, sel);
  await page.waitForSelector(sel, { state: 'visible' });
}
/** The link of an e-mail to /it/<path>, its token in the fragment. */
export const linkIn = (mail, path) => {
  const m = new RegExp(`https?://[^\\s"<>]+/it/${path}#([A-Za-z0-9_-]{43})`).exec(mail.text);
  assert.ok(m, `link /${path} in the e-mail`);
  return m[0];
};
/** The page of a link made for e-mail: a new document each time (the fragment is read when the page loads). */
export const open = async (page, url) => { await page.goto('about:blank'); await page.goto(url); };
