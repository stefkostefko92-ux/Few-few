// Ospedali Trasparenti — админ сервиз (нула зависимости, node:http).
// Обслужва статичния сайт от ../site, брои анонимно посещенията, дава админ
// панел (парола) с реален брояч и превключватели за скриване на страници.
//
// Стартиране:  node server/server.js   (или npm run serve)
// Тайни:       OSPEDALI_ADMIN_PASSWORD, OSPEDALI_SESSION_SECRET (env / server/.env)

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname, sep } from 'node:path';
import { initConfig } from './lib/config.js';
import { Contatore } from './lib/analytics.js';
import { signSession, verifySession, parseCookies, cookieSet, verifyPassword } from './lib/auth.js';
import { loadVisibility, saveVisibility, isHidden, iniettaHideCss, nomePagina, scanPages, PROTETTE } from './lib/visibility.js';
import { loginPage, dashboardPage } from './lib/admin-ui.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

const cfg = await initConfig();
const contatore = await new Contatore(cfg.analyticsFile).carica();
let visibility = await loadVisibility(cfg.visibilityFile);

// Прост throttle срещу brute force на входа (по IP, в паметта).
const tentativi = new Map();
function throttled(ip) {
  const t = tentativi.get(ip);
  if (t && t.bloccoFino > Date.now()) return true;
  return false;
}
function segnaTentativo(ip, ok) {
  if (ok) { tentativi.delete(ip); return; }
  const t = tentativi.get(ip) || { n: 0, bloccoFino: 0 };
  t.n += 1;
  if (t.n >= 6) { t.bloccoFino = Date.now() + 5 * 60 * 1000; t.n = 0; }
  tentativi.set(ip, t);
}

const clientIp = (req) =>
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8', ...headers });
}
async function readBody(req, limit = 1e5) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}
function authed(req) {
  const c = parseCookies(req.headers.cookie);
  return !!verifySession(cfg.sessionSecret, c.ost_admin);
}

// ── Админ маршрути ────────────────────────────────────────────────────────────
async function handleAdmin(req, res, url) {
  // throttle по РЕАЛНИЯ TCP-peer (не по подправимия X-Forwarded-For) — defense-in-depth
  const ip = req.socket.remoteAddress || clientIp(req);

  if (req.method === 'POST' && url.pathname === '/admin/api/login') {
    if (throttled(ip)) return json(res, 429, { error: 'too_many' });
    let pw = '';
    try { pw = (JSON.parse(await readBody(req)).password || ''); } catch { /* */ }
    const ok = verifyPassword(pw, cfg.admin);
    segnaTentativo(ip, ok);
    if (!ok) return json(res, 401, { error: 'bad_credentials' });
    const token = signSession(cfg.sessionSecret);
    return json(res, 200, { ok: true }, { 'set-cookie': cookieSet('ost_admin', token, { maxAge: 8 * 3600, secure: cfg.secureCookies }) });
  }

  if (req.method === 'POST' && url.pathname === '/admin/api/logout') {
    return json(res, 200, { ok: true }, { 'set-cookie': cookieSet('ost_admin', '', { maxAge: 0, secure: cfg.secureCookies }) });
  }

  // Всичко останало под /admin иска сесия (освен login страницата).
  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    if (!authed(req)) return send(res, 200, loginPage(), { 'content-type': 'text/html; charset=utf-8' });
    return send(res, 200, dashboardPage(), { 'content-type': 'text/html; charset=utf-8' });
  }

  if (!authed(req)) return json(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET' && url.pathname === '/admin/api/stats') {
    return json(res, 200, contatore.riepilogo());
  }
  if (req.method === 'GET' && url.pathname === '/admin/api/pages') {
    const pages = await scanPages(cfg.siteDir).catch(() => []);
    return json(res, 200, { pages, hidden: visibility.hidden });
  }
  if (req.method === 'POST' && url.pathname === '/admin/api/visibility') {
    let hidden = [];
    try { hidden = JSON.parse(await readBody(req)).hidden || []; } catch { /* */ }
    // никога не крий защитените страници + само валидни имена
    hidden = [...new Set(hidden)].filter((h) => /^[\w.-]+\.html$/.test(h) && !PROTETTE.has(h));
    visibility = { hidden };
    await saveVisibility(cfg.visibilityFile, visibility);
    return json(res, 200, { ok: true, hidden });
  }
  return json(res, 404, { error: 'not_found' });
}

// ── Статичен сайт + броене ────────────────────────────────────────────────────
async function serveStatic(req, res, url) {
  // Защита срещу path traversal
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return serveNotFound(res); }
  if (rel.endsWith('/')) rel += 'index.html';
  let abs = normalize(join(cfg.siteDir, rel));
  if (abs !== cfg.siteDir && !abs.startsWith(cfg.siteDir + sep)) return send(res, 403, 'Forbidden');

  // Скрита страница → 404 (все едно не съществува)
  if (isHidden(url.pathname, visibility.hidden)) {
    return serveNotFound(res);
  }

  let info;
  try { info = await stat(abs); } catch { return serveNotFound(res); }
  if (info.isDirectory()) {
    abs = join(abs, 'index.html');
    try { info = await stat(abs); } catch { return serveNotFound(res); }
  }

  const ext = extname(abs).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';

  if (ext === '.html') {
    // брои посещението (анонимно) + инжектира CSS за скритите връзки
    if (req.method === 'GET') contatore.registra(nomePagina(url.pathname) || url.pathname, clientIp(req), req.headers['user-agent']);
    let html = await readFile(abs, 'utf8');
    html = iniettaHideCss(html, visibility.hidden);
    return send(res, 200, html, { 'content-type': type, 'cache-control': 'no-cache' });
  }
  const buf = await readFile(abs);
  return send(res, 200, buf, { 'content-type': type, 'cache-control': 'public, max-age=3600' });
}

async function serveNotFound(res) {
  // ползва 404.html ако е налична, иначе просто текст
  try {
    const html = await readFile(join(cfg.siteDir, '404.html'), 'utf8');
    return send(res, 404, iniettaHideCss(html, visibility.hidden), { 'content-type': 'text/html; charset=utf-8' });
  } catch {
    return send(res, 404, 'Pagina non trovata (404).', { 'content-type': 'text/plain; charset=utf-8' });
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    return await serveStatic(req, res, url);
  } catch (err) {
    send(res, 500, 'Errore interno.');
    console.error('errore:', err.message);
  }
});

process.on('SIGTERM', async () => { await contatore.salva().catch(() => {}); process.exit(0); });
process.on('SIGINT', async () => { await contatore.salva().catch(() => {}); process.exit(0); });

server.listen(cfg.port, cfg.host, () => {
  console.log(`Ospedali Trasparenti · сайт + админ на http://${cfg.host}:${cfg.port}`);
  console.log(`  админ панел:  http://${cfg.host}:${cfg.port}/admin`);
  if (cfg.adminSource === 'generated') {
    console.log(`  ⚠ ГЕНЕРИРАНА парола (запази я): ${cfg.generatedPassword}`);
    console.log('    (за постоянна — задай OSPEDALI_ADMIN_PASSWORD в server/.env или systemd)');
  }
  if (cfg.sessionRandom) console.log('  ⚠ OSPEDALI_SESSION_SECRET не е зададен → сесиите падат при рестарт.');
});
