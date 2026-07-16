// @ts-check
// Ospedali Trasparenti — админ сервиз (нула зависимости, node:http).
// Обслужва статичния сайт от ../site, брои анонимно посещенията, дава админ
// панел (парола) с реален брояч и превключватели за скриване на страници.
//
// Стартиране:  node server/server.js   (или npm run serve)
// Тайни:       OSPEDALI_ADMIN_PASSWORD, OSPEDALI_SESSION_SECRET (env / server/.env)

import { createServer } from 'node:http';
import { readFile, stat, access } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { initConfig } from './lib/config.js';
import { Contatore } from './lib/analytics.js';
import { signSession, verifySession, parseCookies, cookieSet, verifyPassword } from './lib/auth.js';
import { loadVisibility, saveVisibility, isHidden, iniettaHideCss, nomePagina, scanPages, PROTETTE } from './lib/visibility.js';
import { loginPage, dashboardPage } from './lib/admin-ui.js';
import { appendAudit } from './lib/audit.js';

/** @typedef {import('node:http').IncomingMessage} IncomingMessage */
/** @typedef {import('node:http').ServerResponse} ServerResponse */

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf',
};

// ── Чисти помощници (без състояние) ───────────────────────────────────────────
/**
 * @param {ServerResponse} res
 * @param {number} status
 * @param {string|Buffer} body
 * @param {Record<string, string|number>} [headers]
 * @returns {void}
 */
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'x-content-type-options': 'nosniff', ...headers });
  res.end(body);
}
/**
 * @param {ServerResponse} res
 * @param {number} status
 * @param {unknown} obj
 * @param {Record<string, string|number>} [headers]
 * @returns {void}
 */
function json(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), { 'content-type': 'application/json; charset=utf-8', ...headers });
}
/**
 * Чете тялото на заявка до `limit` байта (иначе хвърля).
 * @param {IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<string>}
 */
async function readBody(req, limit = 1e5) {
  const chunks = [];
  let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw new Error('too large'); chunks.push(c); }
  return Buffer.concat(chunks).toString('utf8');
}
/**
 * IP на клиента (за дневния анонимен хеш; НЕ се записва суров).
 * @param {IncomingMessage} req
 * @returns {string}
 */
const clientIp = (req) =>
  (String(req.headers['x-forwarded-for'] || '')).split(',')[0].trim() || req.socket.remoteAddress || '';

// ── Фабрика: сглобява сервиза около изолирано състояние (за serve + тестове) ───
// Връща { server, cfg, contatore } — БЕЗ да слуша порт (викащият прави .listen).
/**
 * @param {Partial<import('./lib/config.js').Config>} [overrides]
 * @returns {Promise<{ server: import('node:http').Server, cfg: import('./lib/config.js').Config, contatore: Contatore }>}
 */
export async function creaApp(overrides = {}) {
  /** @type {import('./lib/config.js').Config} */
  const cfg = { ...(await initConfig()), ...overrides };
  const contatore = await new Contatore(cfg.analyticsFile).carica();
  let visibility = await loadVisibility(cfg.visibilityFile);

  // Прост throttle срещу brute force на входа (по IP, в паметта).
  /** @type {Map<string, { n: number, bloccoFino: number }>} */
  const tentativi = new Map();
  /** @param {string} ip @returns {boolean} */
  function throttled(ip) {
    const t = tentativi.get(ip);
    if (t && t.bloccoFino > Date.now()) return true;
    return false;
  }
  /** @param {string} ip @param {boolean} ok @returns {void} */
  function segnaTentativo(ip, ok) {
    if (ok) { tentativi.delete(ip); return; }
    const t = tentativi.get(ip) || { n: 0, bloccoFino: 0 };
    t.n += 1;
    if (t.n >= 6) { t.bloccoFino = Date.now() + 5 * 60 * 1000; t.n = 0; }
    tentativi.set(ip, t);
  }

  /** @param {IncomingMessage} req @returns {boolean} */
  function authed(req) {
    const c = parseCookies(req.headers.cookie);
    return !!verifySession(cfg.sessionSecret, c.ost_admin);
  }

  // Кратък best-effort запис в одита (никога не блокира заявката, без суров IP).
  /** @param {string} azione @param {'ok'|'fail'} esito @param {Record<string, string|number|boolean>} [dettagli] @returns {void} */
  function audit(azione, esito, dettagli) {
    void appendAudit(cfg.auditFile, { azione, esito, dettagli });
  }

  // ── Админ маршрути ──────────────────────────────────────────────────────────
  /**
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @param {URL} url
   * @returns {Promise<void>}
   */
  async function handleAdmin(req, res, url) {
    // throttle по РЕАЛНИЯ TCP-peer (не по подправимия X-Forwarded-For) — defense-in-depth
    const ip = req.socket.remoteAddress || clientIp(req);

    if (req.method === 'POST' && url.pathname === '/admin/api/login') {
      if (throttled(ip)) { audit('login', 'fail', { motivo: 'throttled' }); return json(res, 429, { error: 'too_many' }); }
      let pw = '';
      try { pw = (JSON.parse(await readBody(req)).password || ''); } catch { /* */ }
      const ok = verifyPassword(pw, cfg.admin);
      segnaTentativo(ip, ok);
      audit('login', ok ? 'ok' : 'fail');
      if (!ok) return json(res, 401, { error: 'bad_credentials' });
      const token = signSession(cfg.sessionSecret);
      return json(res, 200, { ok: true }, { 'set-cookie': cookieSet('ost_admin', token, { maxAge: 8 * 3600, secure: cfg.secureCookies }) });
    }

    if (req.method === 'POST' && url.pathname === '/admin/api/logout') {
      audit('logout', 'ok');
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
      // Одит: смяна на видимост — само БРОЯТ скрити страници (без имена → без съдържателни данни).
      audit('visibility', 'ok', { nascoste: hidden.length });
      return json(res, 200, { ok: true, hidden });
    }
    return json(res, 404, { error: 'not_found' });
  }

  // ── Статичен сайт + броене ────────────────────────────────────────────────
  /**
   * @param {IncomingMessage} req
   * @param {ServerResponse} res
   * @param {URL} url
   * @returns {Promise<void>}
   */
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

  /** @param {ServerResponse} res @returns {Promise<void>} */
  async function serveNotFound(res) {
    // ползва 404.html ако е налична, иначе просто текст
    try {
      const html = await readFile(join(cfg.siteDir, '404.html'), 'utf8');
      return send(res, 404, iniettaHideCss(html, visibility.hidden), { 'content-type': 'text/html; charset=utf-8' });
    } catch {
      return send(res, 404, 'Pagina non trovata (404).', { 'content-type': 'text/plain; charset=utf-8' });
    }
  }

  // По-дълбока проверка на здравето: state директорията записваема + брояча зареден.
  // Happy path остава 200 {ok:true,…}; при проблем → 503 {ok:false,reason}.
  /** @param {ServerResponse} res @returns {Promise<void>} */
  async function serveHealth(res) {
    try {
      await access(cfg.stateDir, FS.W_OK); // записваемо ли е състоянието?
    } catch {
      return json(res, 503, { ok: false, reason: 'state_not_writable' });
    }
    // Брояча трябва да е зареден (обект със състояние) — иначе нещо е сбъркано.
    if (!contatore || !contatore.stato || typeof contatore.stato.totalViews !== 'number') {
      return json(res, 503, { ok: false, reason: 'counter_not_loaded' });
    }
    return json(res, 200, { ok: true, since: contatore.stato.since });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname === '/healthz') return await serveHealth(res);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await handleAdmin(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
      return await serveStatic(req, res, url);
    } catch (err) {
      send(res, 500, 'Errore interno.');
      console.error('errore:', err instanceof Error ? err.message : err);
    }
  });

  return { server, cfg, contatore };
}

// ── Авто-старт само при директно стартиране (node server/server.js) ───────────
if (import.meta.url === `file://${process.argv[1]}`) {
  const { server, cfg, contatore } = await creaApp();

  // Глобални handlers — логвай, не падай тихо.
  process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection:', reason instanceof Error ? reason.stack || reason.message : reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('uncaughtException:', err && err.stack ? err.stack : err);
    // Контролиран изход: запиши състоянието и излез (нестабилен процес).
    contatore.salva()
      .catch(() => {})
      .finally(() => process.exit(1));
  });

  // Graceful shutdown: запиши състоянието, затвори сервиза, кратък таймаут.
  let arresto = false;
  /** @param {string} segnale @returns {Promise<void>} */
  async function spegni(segnale) {
    if (arresto) return;
    arresto = true;
    console.log(`\n${segnale} → изключване…`);
    await contatore.salva().catch(() => {});
    const forzato = setTimeout(() => {
      console.error('  сервизът не се затвори навреме → форсиран изход.');
      process.exit(0);
    }, 5000);
    if (forzato.unref) forzato.unref();
    server.close(() => {
      clearTimeout(forzato);
      process.exit(0);
    });
  }
  process.on('SIGTERM', () => { spegni('SIGTERM'); });
  process.on('SIGINT', () => { spegni('SIGINT'); });

  server.listen(cfg.port, cfg.host, () => {
    console.log(`Ospedali Trasparenti · сайт + админ на http://${cfg.host}:${cfg.port}`);
    console.log(`  админ панел:  http://${cfg.host}:${cfg.port}/admin`);
    if (cfg.adminSource === 'generated') {
      console.log(`  ⚠ ГЕНЕРИРАНА парола (запази я): ${cfg.generatedPassword}`);
      console.log('    (за постоянна — задай OSPEDALI_ADMIN_PASSWORD в server/.env или systemd)');
    }
    if (cfg.sessionRandom) console.log('  ⚠ OSPEDALI_SESSION_SECRET не е зададен → сесиите падат при рестарт.');
  });
}
