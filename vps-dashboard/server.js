// Carbon Stealth VPS Dashboard — вход. Нула зависимости: node:http + src/.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, saveConfig } from './src/config.js';
import { Audit } from './src/audit.js';
import { Jobs } from './src/jobs.js';
import { MetricsCollector } from './src/metrics.js';
import { MetricsHistory } from './src/history.js';
import { AlertEngine } from './src/alerts.js';
import { PtySessions } from './src/pty.js';
import { AuditShipper } from './src/audit-ship.js';
import { SloStore } from './src/slo.js';
import { LogMiner } from './src/logmine.js';
import { AccessLogReader } from './src/accesslog.js';
import { DrillStore, drillSpec } from './src/drill.js';
import { buildRouter, ipGateAllows } from './src/routes.js';
import { SudoGrants } from './src/sudo.js';
import { RevokedSessions } from './src/revoked.js';
import { serveStatic, sendError, clientIp } from './src/httpd.js';
import * as desktop from './src/desktop.js';
import { PortBaseline } from './src/ports.js';
import { BackupSchedule, OffsiteShipper } from './src/backupsched.js';
import { DiskScanStore } from './src/diskusage.js';
import { TrafficStore } from './src/traffic.js';
import { backupAllSpec } from './src/backups.js';
import { ensurePanelKey } from './src/panelbackup.js';

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

const slo = new SloStore(cfg.paths.stateDir);
const logminer = new LogMiner(cfg.paths.stateDir);
const accesslog = new AccessLogReader(cfg.paths.stateDir);
const drill = new DrillStore(cfg.paths.stateDir);
const portBaseline = new PortBaseline(cfg.paths.stateDir);
const backupSchedule = new BackupSchedule(cfg.paths.stateDir);
// Ключът за шифрирания бекъп на самия панел: генерира се веднъж и се записва в
// конфига. Собственикът трябва да го ПРЕПИШЕ извън машината (секция „Бекъпи") —
// конфигът е вътре в архива, значи при мъртъв диск ключът загива с него.
ensurePanelKey(cfg, saveConfig);
const diskScan = new DiskScanStore(cfg.paths.stateDir);
const traffic = new TrafficStore(cfg.paths.stateDir);
// Копие на другия VPS. Обявен ТУК, преди графика, който го вика — иначе
// препратката е в мъртва зона до края на модула.
const offsite = new OffsiteShipper({ cfg, audit, schedule: backupSchedule });
offsite.start();
const alerts = new AlertEngine({ cfg, metrics, audit, history, slo, logminer, drill, accesslog, portBaseline, backupSchedule, traffic });
alerts.start();

// Проба за възстановяване по каданс. Проверява се на всеки час дали е ДОШЛО
// време — таймер за 30 дни не преживява рестарт, а сървър, който се рестартира
// веднъж месечно, никога не би пуснал пробата.
function runDrill(reason) {
  let spec;
  try {
    spec = drillSpec();
  } catch (err) {
    // „Няма какво да се пробва" е находка, не мълчалив пропуск — но алармата за
    // липсващ бекъп вече го казва, затова тук само отбелязваме.
    drill.record({ ok: false, name: null, output: err.message, code: null });
    return;
  }
  // `jobs.start` хвърля 409 при зает ексклузивен ключ „backup" (напр. тече
   // архив на томове). Това НЕ е провал на пробата — записването му като
  // провал би вдигнало фалшива критична аларма И би отложило истинската проба
  // с цял интервал. Часовият таймер ще опита пак.
  let job;
  try {
    job = jobs.start(spec, { user: reason });
  } catch {
    return;
  }
  watchDrill(job.id, spec.dumpName);
}

// Резултатът се записва при ПРИКЛЮЧВАНЕ — „последна успешна проба" трябва да е
// факт от изпълнението, не намерение.
function watchDrill(jobId, dumpName) {
  const iv = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j || !j.endedAt) return;
    clearInterval(iv);
    const entry = drill.record({ ok: j.code === 0, name: dumpName, output: j.output, code: j.code });
    if (!entry.ok) {
      alerts
        .event({
          key: 'backup:drill',
          severity: 'critical',
          title: 'Пробата за възстановяване се провали',
          body: `Дъмп „${dumpName}" не мина проверката (изход ${j.code}).\n${String(j.output || '').slice(-600)}`,
        })
        .catch(() => {});
    }
  }, 3000);
  iv.unref?.();
}

if (cfg.backups?.drillEnabled !== false) {
  const check = () => {
    if (drill.due(Number(cfg.backups?.drillIntervalDays ?? 30))) runDrill('планирана проба');
  };
  setTimeout(check, 5 * 60000).unref?.(); // не на самия старт — сървърът да се вдигне
  const drillTimer = setInterval(check, 3600 * 1000);
  drillTimer.unref?.();
}

// Бекъпът се ПРАВИ сам. Същият часови каданс като пробата и по същата причина:
// таймер за 24 часа не преживява рестарт, а конкретният час се улучва само ако
// проверката е честа. Резултатът се записва при ПРИКЛЮЧВАНЕ на задачата.
function runScheduledBackup(reason) {
  let job;
  try {
    job = jobs.start(backupAllSpec(cfg), { user: reason });
  } catch {
    // Зает ексклузивен ключ „backup" (тече проба или архив на томове) НЕ е провал
    // на графика — записването му като провал вдига фалшива критична аларма и
    // отлага истинския бекъп с цял каданс. Часовият таймер ще опита пак.
    return;
  }
  const iv = setInterval(() => {
    const j = jobs.get(job.id);
    if (!j || !j.endedAt) return;
    clearInterval(iv);
    backupSchedule.record({ ok: j.code === 0, output: j.output, code: j.code, reason });
    // Свежият дъмп си струва да пътува веднага, а не да чака следващия каданс на
    // изнасянето — точно между двете стои прозорецът, в който машината умира.
    if (j.code === 0) offsite.shipAll().catch(() => {});
  }, 5000);
  iv.unref?.();
}

{
  const check = () => {
    if (backupSchedule.due(cfg)) runScheduledBackup('планиран бекъп');
  };
  setTimeout(check, 6 * 60000).unref?.();
  const t = setInterval(check, 3600 * 1000);
  t.unref?.();
}

// Разбивката на диска се записва при ПРИКЛЮЧВАНЕ и носи дали е ПЪЛНА. Прекъснато
// сканиране (таймаут на пълен диск) с половин резултат би изглеждало като отговор
// на въпроса „кой яде диска" — а е половин истина, което е по-лошо от никаква.
function watchDiskScan(jobId, scan) {
  const iv = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j || !j.endedAt) return;
    clearInterval(iv);
    diskScan.record({ ...scan, output: j.output, code: j.code });
  }, 3000);
  iv.unref?.();
}

// Трафикът се натрупва по РАЗЛИКИ на всяка минута. Броячите в /proc/net/dev се
// нулират при рестарт, значи абсолютната стойност не е месечен сбор — а рядката
// проба губи трафика между последната проба и рестарта.
{
  const tick = () => {
    try {
      traffic.sample(cfg);
    } catch {
      /* една пропусната проба не бива да чупи нищо */
    }
  };
  setTimeout(tick, 5000).unref?.();
  const t = setInterval(tick, 60 * 1000);
  t.unref?.();
}

// SLO дневникът расте по един ред на продукт на минута — режем го на 35 дни
// (30-дневният прозорец + запас) веднъж на ден, иначе за година става 500 MB.
const sloCompact = setInterval(() => slo.compact(), 24 * 3600 * 1000);
sloCompact.unref?.();

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

// Смяна на порт: `healthChecks` се обновява САМО след УСПЕШНА задача.
//
// Редът е важен и е нарочен. Обновим ли конфига предварително и веригата падне,
// панелът започва да вика порт, на който нищо не слуша → критична аларма за
// продукт, който всъщност си работи на стария порт. А точно доверието в алармите
// е това, което не бива да се чупи.
function watchPortChange(jobId, plan) {
  const iv = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j || !j.endedAt) return;
    clearInterval(iv);
    if (j.code !== 0) {
      audit.log({ action: 'ports.change.failed', product: plan.product, to: plan.newPort, code: j.code });
      return;
    }
    const checks = (cfg.healthChecks || []).map((h) =>
      h.name === plan.product ? { ...h, url: h.url.replace(`:${plan.currentPort}`, `:${plan.newPort}`) } : h
    );
    saveConfig(cfg, { healthChecks: checks });
    audit.log({ action: 'ports.change.ok', product: plan.product, from: plan.currentPort, to: plan.newPort });
    alerts
      .event({
        key: `ports:changed:${plan.product}`,
        severity: 'info',
        title: `${plan.product} мина на порт ${plan.newPort}`,
        body: `Проверката на панела вече сочи ${plan.newPort}. Копията на пипнатите файлове са до тях със суфикс „.преди-смяна-на-порт".`,
      })
      .catch(() => {});
  }, 3000);
  iv.unref?.();
}

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
  slo,
  logminer,
  accesslog,
  drill,
  watchDrill,
  watchPortChange,
  portBaseline,
  backupSchedule,
  offsite,
  runScheduledBackup,
  diskScan,
  watchDiskScan,
  traffic,
  sudo: new SudoGrants(), // активни „sudo" разрешения (jti → изтича в)
  sessions: new Map(), // активни сесии (jti → метаданни)
  // Отменените сесии ПРЕЖИВЯВАТ рестарт. Докато този списък живееше в паметта,
  // изходът и поименната отмяна бяха илюзия точно в най-важния момент: рестарт
  // (деплой, ъпдейт, срив) го изчистваше и вече отменен откраднат токен
  // проработваше отново — до 12 часа.
  revokedSessions: new RevokedSessions(cfg.paths.stateDir),
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
      "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'; " +
      // Незадължителният десктоп се показва в рамка. Понеже минава ПРЕЗ панела
      // (`/desktop/…`), произходът е същият и „self" стига — не отваряме нищо
      // чуждо. `frame-ancestors 'none'` отгоре остава: панелът не бива да бъде
      // рамкиран ОТ никого.
      "frame-src 'self'"
  );
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return sendError(res, 400, 'Невалиден URL');
  }

  // Списъкът с разрешени адреси е ПРЕД всичко — включително статиката и входа.
  // Скенер, попаднал на панела, не вижда дори формата за вход. Празен списък =
  // изключено (иначе едно погрешно записване заключва собственика отвън).
  if (!ipGateAllows(req, cfg, url.pathname, clientIp)) {
    return sendError(res, 403, 'Достъпът от този адрес не е разрешен.');
  }

  // Десктопът се проксира ИЗВЪН рутера: пътят му е `/desktop/…`, а не `/api/…`,
  // защото контейнерът очаква точно този префикс (`SUBFOLDER=/desktop/`).
  // Автентикацията обаче е СЪЩАТА — иначе рамката става втора врата към
  // машината без вход.
  if (url.pathname === desktop.PREFIX || url.pathname.startsWith(`${desktop.PREFIX}/`)) {
    if (!router.authenticate(req)) return sendError(res, 401, 'Не си вписан.');
    // Заглавките на ПАНЕЛА трябва да отпаднат от отговора на десктопа, иначе
    // рамката остава черна без нито едно съобщение за грешка:
    //   • `x-frame-options: DENY` забранява рамкирането ДОРИ от същия произход
    //     (за същия произход е нужно SAMEORIGIN, не DENY);
    //   • `frame-ancestors 'none'` в CSP-то прави същото.
    // Панелът си запазва и двете за собствените си страници — маха ги само за
    // този път, който сам проксира и сам е автентикирал.
    res.removeHeader('x-frame-options');
    res.removeHeader('content-security-policy');
    res.setHeader('x-frame-options', 'SAMEORIGIN');
    return desktop.proxyHttp(cfg, req, res);
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

// WebSocket за десктопа. `node:http` не проксира надграждане сам, а VNC е
// WebSocket от първата до последната си заявка: без това рамката се зарежда и
// остава черна.
//
// Автентикацията е ЗАДЪЛЖИТЕЛНА и тук. Пропускът ѝ е класическата дупка при
// такова прокси: обикновените заявки са зад вход, а сокетът — не.
server.on('upgrade', (req, socket, head) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return socket.destroy();
  }
  if (!ipGateAllows(req, cfg, url.pathname, clientIp)) return socket.destroy();
  if (url.pathname !== desktop.PREFIX && !url.pathname.startsWith(`${desktop.PREFIX}/`)) return socket.destroy();
  if (!router.authenticate(req)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    return socket.destroy();
  }
  desktop.proxyUpgrade(cfg, req, socket, head);
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
