// Carbon Stealth VPS Dashboard — вход. Нула зависимости: node:http + src/.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './src/config.js';
import { Audit } from './src/audit.js';
import { Jobs } from './src/jobs.js';
import { MetricsCollector } from './src/metrics.js';
import { MetricsHistory } from './src/history.js';
import { AlertEngine } from './src/alerts.js';
import { PtySessions } from './src/pty.js';
import { AuditShipper } from './src/audit-ship.js';
import { buildRouter } from './src/routes.js';
import { serveStatic, sendError } from './src/httpd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fail-closed: DEV резервният режим (ефимерна парола) се допуска САМО при изричен
// CSD_DEV=1. Иначе липсващ конфиг спира услугата вместо тихо да вдигне панела с
// генерирана парола, отпечатана в journald.
const cfg = loadConfig({ allowDev: Boolean(process.env.CSD_DEV) });
const audit = new Audit(cfg.paths.stateDir);
const jobs = new Jobs(audit);
const metrics = new MetricsCollector();
const history = new MetricsHistory(cfg.paths.stateDir);
metrics.listeners.add((snap) => history.maybeAppend(snap));
metrics.startSampling();

const alerts = new AlertEngine({ cfg, metrics, audit, history });
alerts.start();

// Провалена системна задача (деплой/ъпдейт/бекъп) вдига известие веднага —
// иначе научаваш за счупен деплой чак когато продуктът падне.
jobs.onEnd = (job) => {
  if (job.code === 0 || !job.exclusive) return;
  alerts
    .event({
      key: `job:${job.id}`,
      severity: 'critical',
      title: `Провалена задача: ${job.title}`,
      body: `Изход ${job.code}. Последни редове:\n${job.output.slice(-800)}`,
    })
    .catch(() => {});
};

const pty = new PtySessions(audit);

// Копие на одита към другия VPS (ако е включено) — хеш-веригата открива
// подправяне, но само копие извън машината го прави безполезно.
const shipper = new AuditShipper({ cfg, audit });
shipper.start();

// Провалът на одита е шумен: дневник, който тихо не пише, е по-лош от липсващ.
audit.onWriteFailure = (err) => {
  alerts
    .event({
      key: 'audit:write',
      severity: 'critical',
      title: 'Одитът не се записва',
      body: `Записът в дневника се проваля (${err.message}). Действията остават без следа — провери диска и правата.`,
    })
    .catch(() => {});
};

const router = buildRouter({
  cfg,
  audit,
  jobs,
  metrics,
  history,
  alerts,
  pty,
  shipper,
  sessions: new Map(), // активни сесии (jti → метаданни)
  revokedSessions: new Set(), // поименно отменени до изтичането им
});
const statics = serveStatic(path.join(__dirname, 'public'));

const server = http.createServer(async (req, res) => {
  // Дълги SSE потоци + фонови задачи → без таймаут на отговора.
  res.setTimeout(0);
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('x-content-type-options', 'nosniff');
  // Панелът не зарежда НИЩО отвън (нула CDN) → политиката е максимално стегната.
  // Защита в дълбочина: дори при пропуснато място за екраниране, скрипт отвън не тръгва.
  // style-src иска 'unsafe-inline' заради inline цветовете на терминалния рендер
  // (ansi.js слага style атрибути на span-овете) — скриптовете остават само 'self'.
  res.setHeader(
    'content-security-policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
      "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'"
  );
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendError(res, 400, 'Невалиден URL');
  }

  try {
    const match = router.match(req.method, url.pathname);
    if (match) {
      await match.handler(req, res, match.params, url);
      return;
    }
    if (req.method === 'GET' && statics(req, res, url.pathname)) return;
    // SPA fallback: всичко останало (не-API GET) връща index.html.
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      statics(req, res, '/index.html');
      return;
    }
    sendError(res, 404, 'Няма такъв ресурс');
  } catch (err) {
    const status = Number(err?.status) || 500;
    if (status >= 500) console.error(`[csd] ${req.method} ${url.pathname}:`, err);
    sendError(res, status, status >= 500 ? 'Вътрешна грешка' : err.message);
  }
});

server.headersTimeout = 30000;
server.requestTimeout = 0; // SSE/дълги задачи

server.listen(cfg.port, cfg.host, () => {
  console.log(`▸ Carbon Stealth VPS Dashboard — http://${cfg.host}:${cfg.port} (${cfg.nodeName})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n▸ Спирам (${sig})…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
