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
import { buildRouter } from './src/routes.js';
import { serveStatic, sendError } from './src/httpd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const cfg = loadConfig();
const audit = new Audit(cfg.paths.stateDir);
const jobs = new Jobs(audit);
const metrics = new MetricsCollector();
const history = new MetricsHistory(cfg.paths.stateDir);
metrics.listeners.add((snap) => history.maybeAppend(snap));
metrics.startSampling();

const alerts = new AlertEngine({ cfg, metrics, audit });
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
const router = buildRouter({ cfg, audit, jobs, metrics, history, alerts, pty });
const statics = serveStatic(path.join(__dirname, 'public'));

const server = http.createServer(async (req, res) => {
  // Дълги SSE потоци + фонови задачи → без таймаут на отговора.
  res.setTimeout(0);
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('x-frame-options', 'DENY');
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
