// Всички API маршрути + защитите: сесия/Bearer, CSRF маркер, одит.
import { Router, sendJson, sendError, readJson, parseCookies, openSse, clientIp } from './httpd.js';
import {
  verifyPassword,
  createSession,
  verifySession,
  tokenEqual,
  loginAllowed,
  loginFailed,
  loginSucceeded,
} from './auth.js';
import * as services from './services.js';
import * as docker from './docker.js';
import * as system from './system.js';
import * as deploy from './deploy.js';
import * as agents from './agents.js';
import * as files from './files.js';
import * as nodes from './nodes.js';
import * as upload from './upload.js';
import * as firewall from './firewall.js';
import * as webserver from './webserver.js';
import * as compose from './compose.js';
import * as databases from './databases.js';
import * as backups from './backups.js';
import { verifyTotp, generateSecret, otpauthUri } from './totp.js';
import { saveConfig } from './config.js';
import { configuredChannels } from './notify.js';
import { RANGES } from './history.js';

const COOKIE = 'csd_sess';
export const VERSION = '0.1.0';

export function buildRouter(ctx) {
  const { cfg, audit, jobs, metrics } = ctx;
  const r = new Router();

  // ── Помощници ──────────────────────────────────────────────────────────────
  const auth = (req) => {
    // 1) Federation: Bearer peerToken (другият VPS / прокси).
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (bearer && cfg.peerToken && tokenEqual(bearer, cfg.peerToken)) {
      return { user: 'peer', peer: true };
    }
    // 2) Браузър: подписано сесийно куки.
    const sess = verifySession(cfg.sessionSecret, parseCookies(req)[COOKIE]);
    return sess ? { user: sess.user, peer: false } : null;
  };

  // CSRF за мутации: SameSite=Strict куки + задължителен custom header (не може
  // да се прати cross-site) + Origin проверка, когато браузърът го праща.
  const csrfOk = (req, who) => {
    if (who?.peer) return true;
    if (req.headers['x-csd'] !== '1') return false;
    const origin = req.headers.origin;
    if (origin) {
      const host = req.headers.host;
      try {
        if (new URL(origin).host !== host) return false;
      } catch {
        return false;
      }
    }
    return true;
  };

  const guard = (handler, { mutating = false } = {}) => {
    return async (req, res, params, url) => {
      const who = auth(req);
      if (!who) return sendError(res, 401, 'Не си вписан.');
      if (mutating && !csrfOk(req, who)) return sendError(res, 403, 'Отхвърлена заявка (CSRF).');
      req.user = who.user;
      return handler(req, res, params, url);
    };
  };

  const J = (fn) => async (req, res, params, url) => {
    const data = await fn(req, res, params, url);
    if (data !== undefined) sendJson(res, 200, data);
  };

  // ── Вход/сесия ─────────────────────────────────────────────────────────────
  r.get('/api/ping', (req, res) => {
    const who = auth(req);
    if (!who) return sendError(res, 401, 'unauthorized');
    sendJson(res, 200, { ok: true, nodeId: cfg.nodeId, nodeName: cfg.nodeName, version: VERSION });
  });

  r.post('/api/login', async (req, res) => {
    const ip = clientIp(req, cfg.trustProxy);
    if (!loginAllowed(ip)) return sendError(res, 429, 'Твърде много опити — изчакай 10 минути.');
    const body = await readJson(req);
    const okUser = String(body.user || '') === cfg.adminUser;
    const okPass = verifyPassword(String(body.password || ''), cfg.passwordHash);
    if (!okUser || !okPass) {
      loginFailed(ip);
      audit.log({ action: 'login.fail', ip });
      return sendError(res, 401, 'Грешно име или парола.');
    }
    // Втори фактор (ако е включен). Стъпката се пази, за да не мине същият код два пъти.
    if (cfg.totp?.enabled && cfg.totp?.secret) {
      const step = verifyTotp(cfg.totp.secret, body.code);
      if (step === null || step === ctx.lastTotpStep) {
        loginFailed(ip);
        audit.log({ action: 'login.fail2fa', ip });
        return sendError(res, 401, body.code ? 'Грешен код от приложението.' : 'Нужен е код (2FA).');
      }
      ctx.lastTotpStep = step;
    }
    loginSucceeded(ip);
    const ttl = (cfg.sessionTtlHours || 12) * 3600 * 1000;
    const token = createSession(cfg.sessionSecret, cfg.adminUser, ttl);
    audit.log({ action: 'login.ok', ip, user: cfg.adminUser });
    const secure = cfg.trustProxy ? '; Secure' : '';
    res.setHeader(
      'set-cookie',
      `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(ttl / 1000)}${secure}`
    );
    sendJson(res, 200, { ok: true, user: cfg.adminUser });
  });

  r.post('/api/logout', (req, res) => {
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    sendJson(res, 200, { ok: true });
  });

  r.get(
    '/api/me',
    guard(
      J(async () => ({
        user: cfg.adminUser,
        nodeId: cfg.nodeId,
        nodeName: cfg.nodeName,
        version: VERSION,
        peers: (cfg.peers || []).map((p) => ({ id: p.id, name: p.name })),
        totpEnabled: Boolean(cfg.totp?.enabled),
      }))
    )
  );

  // Изисква ли входът втори фактор (за формата на вход, преди сесия).
  r.get('/api/auth/info', (req, res) => sendJson(res, 200, { totp: Boolean(cfg.totp?.enabled) }));

  // ── 2FA (TOTP) ─────────────────────────────────────────────────────────────
  // Записваме тайната в конфига чак при ПОТВЪРЖДЕНИЕ с валиден код — иначе може
  // да се заключиш с непрочетен QR.
  r.post(
    '/api/totp/setup',
    guard(
      J(async () => {
        const secret = generateSecret();
        ctx.pendingTotp = secret;
        return { secret, uri: otpauthUri(secret, { account: cfg.adminUser }) };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/totp/enable',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const secret = ctx.pendingTotp;
        if (!secret) throw Object.assign(new Error('Първо генерирай тайна.'), { status: 400 });
        if (verifyTotp(secret, b.code) === null) {
          throw Object.assign(new Error('Кодът не съвпада — провери часовника на телефона.'), { status: 400 });
        }
        saveConfig(cfg, { totp: { enabled: true, secret } });
        ctx.pendingTotp = null;
        audit.log({ action: 'totp.enable', user: req.user });
        return { enabled: true };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/totp/disable',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        // Изключването иска паролата пак — кражба на сесия да не маха фактора.
        if (!verifyPassword(String(b.password || ''), cfg.passwordHash)) {
          throw Object.assign(new Error('Грешна парола.'), { status: 401 });
        }
        saveConfig(cfg, { totp: { enabled: false, secret: '' } });
        audit.log({ action: 'totp.disable', user: req.user });
        return { enabled: false };
      }),
      { mutating: true }
    )
  );

  // ── Обзор + метрики ────────────────────────────────────────────────────────
  r.get(
    '/api/overview',
    guard(
      J(async () => ({
        info: await system.systemInfo(),
        metrics: metrics.latest || (await metrics.sample()),
      }))
    )
  );
  // История: от диска (преживява рестарт); range=1h|6h|24h|7d.
  r.get(
    '/api/metrics/history',
    guard(
      J(async (req, res, p, url) => {
        const key = url.searchParams.get('range') || '24h';
        const ms = RANGES[key] || RANGES['24h'];
        const points = ctx.history ? ctx.history.range(ms) : metrics.getHistory();
        return { step: 30, range: RANGES[key] ? key : '24h', ranges: Object.keys(RANGES), points };
      })
    )
  );
  r.get(
    '/api/stream/metrics',
    guard((req, res) => {
      const sse = openSse(res);
      if (metrics.latest) sse.send('metrics', metrics.latest);
      const listener = (snap) => sse.send('metrics', snap);
      metrics.listeners.add(listener);
      res.on('close', () => metrics.listeners.delete(listener));
    })
  );

  // ── Услуги (systemd) ───────────────────────────────────────────────────────
  r.get('/api/services', guard(J(() => services.listServices())));
  r.get('/api/services/status', guard(J((req, res, p, url) => services.serviceStatus(url.searchParams.get('unit')))));
  r.post(
    '/api/services/action',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return services.serviceAction(b.unit, b.action, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Логове (journal) ───────────────────────────────────────────────────────
  r.get(
    '/api/logs',
    guard(
      J((req, res, p, url) =>
        services.journalTail({
          unit: url.searchParams.get('unit') || undefined,
          priority: url.searchParams.get('priority') ?? undefined,
          lines: url.searchParams.get('lines') || undefined,
        })
      )
    )
  );
  r.get(
    '/api/stream/journal',
    guard((req, res, p, url) => {
      const sse = openSse(res);
      services.journalFollow(
        {
          unit: url.searchParams.get('unit') || undefined,
          priority: url.searchParams.get('priority') ?? undefined,
        },
        sse,
        res
      );
    })
  );

  // ── Docker ─────────────────────────────────────────────────────────────────
  r.get('/api/docker', guard(J(() => docker.dockerOverview())));
  r.get('/api/docker/stats', guard(J(() => docker.dockerStats())));
  r.get('/api/docker/logs', guard(J((req, res, p, url) => docker.dockerLogs(url.searchParams.get('id'), url.searchParams.get('lines')))));
  r.post(
    '/api/docker/action',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return docker.dockerAction(b.id, b.action, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Процеси ────────────────────────────────────────────────────────────────
  r.get('/api/processes', guard(J((req, res, p, url) => system.listProcesses(url.searchParams.get('sort') || 'cpu'))));
  r.post(
    '/api/processes/kill',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return system.killProcess(b.pid, b.signal, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Деплой + продуктов health ──────────────────────────────────────────────
  r.get('/api/deploy/state', guard(J(() => deploy.deployState(cfg))));
  r.get('/api/health/products', guard(J(() => deploy.productHealth(cfg))));
  r.post(
    '/api/deploy/run',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = deploy.deploySpec(cfg, b);
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // Качване на архив направо от браузъра (суровото тяло; име в query).
  // Пише и <архив>.sha256 → autodeploy.sh проверява целостта преди разопаковане.
  r.post(
    '/api/deploy/upload',
    guard(
      J(async (req, res, p, url) => {
        const info = await upload.receiveArchive(req, cfg, url.searchParams.get('name'));
        audit.log({ action: 'deploy.upload', name: info.name, sizeBytes: info.sizeBytes, sha256: info.sha256, user: req.user });
        return info;
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/deploy/archive/delete',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        audit.log({ action: 'deploy.archiveDelete', name: b.name, user: req.user });
        return upload.deleteArchive(cfg, b.name);
      }),
      { mutating: true }
    )
  );
  // Връщане назад към стар release (без архив).
  r.post(
    '/api/deploy/rollback',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = deploy.rollbackSpec(cfg, b);
        audit.log({ action: 'deploy.rollback', release: b.release, projects: b.projects, user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Аларми ─────────────────────────────────────────────────────────────────
  r.get(
    '/api/alerts',
    guard(
      J(async () => ({
        enabled: Boolean(cfg.alerts?.enabled),
        thresholds: cfg.alerts?.thresholds || {},
        cooldownMin: cfg.alerts?.cooldownMin,
        sustainSamples: cfg.alerts?.sustainSamples,
        checkIntervalSec: cfg.alerts?.checkIntervalSec,
        channels: configuredChannels(cfg),
        active: ctx.alerts ? ctx.alerts.listActive() : [],
        log: ctx.alerts ? ctx.alerts.log.slice(-100).reverse() : [],
      }))
    )
  );
  // Настройки: прагове/каданс + канали. Тайните (токени) се записват, но НИКОГА
  // не се връщат обратно към браузъра — /api/alerts дава само „кой канал е нагласен".
  r.post(
    '/api/alerts/settings',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const patch = {};
        if (b.alerts) {
          patch.alerts = {};
          for (const k of ['enabled', 'cooldownMin', 'sustainSamples', 'checkIntervalSec']) {
            if (b.alerts[k] !== undefined) patch.alerts[k] = b.alerts[k];
          }
          if (b.alerts.thresholds) {
            patch.alerts.thresholds = {};
            for (const [k, v] of Object.entries(b.alerts.thresholds)) {
              const n = Number(v);
              if (Number.isFinite(n) && n >= 0) patch.alerts.thresholds[k] = n;
            }
          }
        }
        if (b.notify) patch.notify = b.notify;
        saveConfig(cfg, patch);
        audit.log({ action: 'alerts.settings', user: req.user }); // без стойности — може да има токени
        return { ok: true };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/alerts/test',
    guard(
      J(async (req) => {
        if (!ctx.alerts) throw Object.assign(new Error('Алармите не са пуснати'), { status: 400 });
        const entry = await ctx.alerts.dispatch({
          type: 'test',
          key: 'test',
          severity: 'info',
          title: 'Тестово известие',
          body: `Каналите работят. Изпратено от ${cfg.nodeName}.`,
        });
        return { sent: entry.sent, failed: entry.failed };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/alerts/check',
    guard(
      J(async () => {
        if (!ctx.alerts) throw Object.assign(new Error('Алармите не са пуснати'), { status: 400 });
        return ctx.alerts.evaluate();
      }),
      { mutating: true }
    )
  );

  // ── Ъпдейти + захранване ───────────────────────────────────────────────────
  r.get('/api/updates', guard(J(() => system.updatesInfo())));
  r.post(
    '/api/updates/refresh',
    guard(J(async (req) => jobs.start(system.aptRefreshSpec(), { user: req.user })), { mutating: true })
  );
  r.post(
    '/api/updates/upgrade',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return jobs.start(system.aptUpgradeSpec(Boolean(b.security)), { user: req.user });
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/power',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return system.powerAction(b.action, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Сигурност / бекъпи / крон ──────────────────────────────────────────────
  r.get('/api/security', guard(J(() => system.securityInfo())));
  r.get('/api/backups', guard(J(() => system.backupsInfo(cfg))));
  r.get('/api/cron', guard(J(() => system.cronInfo())));

  // ── Файлове (само четене) ──────────────────────────────────────────────────
  r.get('/api/files', guard(J((req, res, p, url) => files.listDir(url.searchParams.get('path')))));
  r.get(
    '/api/files/read',
    guard(J((req, res, p, url) => files.readFilePreview(url.searchParams.get('path'), audit, req.user)))
  );

  r.post(
    '/api/files/write',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return files.writeFile(b.path, b.content, { create: Boolean(b.create) }, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Firewall (ufw) ─────────────────────────────────────────────────────────
  r.get('/api/firewall', guard(J(() => firewall.firewallStatus())));
  r.post(
    '/api/firewall/rule',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return firewall.addRule(b, audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/firewall/rule/delete',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return firewall.deleteRule(b.num, audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/firewall/enabled',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return firewall.setEnabled(Boolean(b.enabled), audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Уеб сървър (Nginx/Caddy) ───────────────────────────────────────────────
  r.get('/api/webserver', guard(J(() => webserver.webserverStatus())));
  r.get(
    '/api/webserver/site',
    guard(J((req, res, p, url) => webserver.readSite(url.searchParams.get('server'), url.searchParams.get('name'))))
  );
  r.post(
    '/api/webserver/site',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return webserver.writeSite(b.server, b.name, b.content, audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/webserver/enabled',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return webserver.setEnabled(b.server, b.name, Boolean(b.enabled), audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/webserver/reload',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const v = await webserver.validate(b.server);
        if (!v.ok) throw Object.assign(new Error(`Конфигът е невалиден:\n${v.output}`), { status: 400 });
        audit.log({ action: 'webserver.reload', server: b.server, user: req.user });
        return webserver.reload(b.server);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/webserver/cert-renew',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return jobs.start(webserver.certRenewSpec({ dry: Boolean(b.dry) }), { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Docker Compose (по стек) ───────────────────────────────────────────────
  r.get('/api/compose', guard(J(() => compose.composeList())));
  r.get('/api/compose/ps', guard(J((req, res, p, url) => compose.composePs(url.searchParams.get('project')))));
  r.get(
    '/api/compose/logs',
    guard(J((req, res, p, url) => compose.composeLogs(url.searchParams.get('project'), url.searchParams.get('lines'))))
  );
  r.post(
    '/api/compose/action',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = compose.composeActionSpec(b);
        audit.log({ action: 'compose.' + b.action, project: b.project, user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Бази ───────────────────────────────────────────────────────────────────
  r.get('/api/databases', guard(J(() => databases.databasesOverview())));
  r.get('/api/databases/sqlite/check', guard(J((req, res, p, url) => databases.sqliteCheck(url.searchParams.get('file')))));
  r.post(
    '/api/databases/dump',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = b.kind === 'postgres' ? databases.postgresDumpSpec(b) : databases.sqliteDumpSpec(b.file);
        audit.log({ action: 'db.dump', kind: b.kind || 'sqlite', target: b.database || b.file, user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Бекъпи (реално пускане) ────────────────────────────────────────────────
  r.get(
    '/api/backups/dumps',
    guard(J(() => ({ dir: databases.DUMP_DIR, dumps: backups.listDumps(), restic: backups.resticConfigured() })))
  );
  r.post(
    '/api/backups/run',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec =
          b.kind === 'restic' ? backups.resticSpec(cfg, b.mode === 'verify' ? 'verify' : 'backup') : backups.backupAllSpec();
        audit.log({ action: 'backup.run', kind: b.kind || 'databases', mode: b.mode, user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Интерактивен терминал (PTY) ────────────────────────────────────────────
  r.get('/api/pty', guard(J(() => ({ sessions: ctx.pty.list() }))));
  r.post(
    '/api/pty/open',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return ctx.pty.create({ cwd: b.cwd || '/root', cols: b.cols, rows: b.rows }, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/pty/:id/input',
    guard(
      J(async (req, res, params) => {
        const b = await readJson(req);
        return ctx.pty.write(params.id, b.data, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/pty/:id/resize',
    guard(
      J(async (req, res, params) => {
        const b = await readJson(req);
        return ctx.pty.resize(params.id, b.cols, b.rows);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/pty/:id/kill',
    guard(J(async (req, res, params) => ctx.pty.kill(params.id, req.user)), { mutating: true })
  );
  r.get(
    '/api/pty/:id/stream',
    guard((req, res, params) => {
      const s = ctx.pty.get(params.id);
      if (!s) return sendError(res, 404, 'Няма такава сесия');
      const sse = openSse(res);
      if (s.buffer) sse.send('data', s.buffer);
      const listener = (event, data) => sse.send(event, data);
      s.listeners.add(listener);
      res.on('close', () => s.listeners.delete(listener));
    })
  );

  // ── Терминал (еднократна команда, одитиран) ────────────────────────────────
  r.post(
    '/api/terminal/run',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const cmd = String(b.cmd || '').trim();
        if (!cmd) throw Object.assign(new Error('Празна команда'), { status: 400 });
        if (cmd.length > 4000) throw Object.assign(new Error('Твърде дълга команда'), { status: 400 });
        audit.log({ action: 'terminal.run', cmd: cmd.slice(0, 500), user: req.user });
        return jobs.start(
          { title: 'Терминал', shell: cmd, cwd: b.cwd || '/root', timeoutMs: 15 * 60 * 1000 },
          { user: req.user }
        );
      }),
      { mutating: true }
    )
  );

  // ── Задачи ─────────────────────────────────────────────────────────────────
  r.get('/api/jobs', guard(J(() => jobs.list())));
  r.get(
    '/api/jobs/:id',
    guard(
      J(async (req, res, params) => {
        const job = jobs.get(params.id);
        if (!job) throw Object.assign(new Error('Няма такава задача'), { status: 404 });
        return { ...jobs.describe(job), output: job.output.slice(-200000) };
      })
    )
  );
  r.get(
    '/api/jobs/:id/stream',
    guard((req, res, params) => {
      const job = jobs.get(params.id);
      if (!job) return sendError(res, 404, 'Няма такава задача');
      const sse = openSse(res);
      sse.send('data', job.output.slice(-100000));
      if (job.endedAt) {
        sse.send('end', { code: job.code });
        return;
      }
      const listener = (event, data) => sse.send(event, data);
      job.listeners.add(listener);
      res.on('close', () => job.listeners.delete(listener));
    })
  );
  r.post(
    '/api/jobs/:id/kill',
    guard(J(async (req, res, params) => jobs.kill(params.id, req.user)), { mutating: true })
  );

  // ── Агентски флот + инструменти ────────────────────────────────────────────
  r.get('/api/agents/fleet', guard(J(() => agents.agentsFleet(cfg))));
  r.get('/api/agents/tools', guard(J(() => ({ tools: agents.listAgentTools(cfg) }))));
  r.get('/api/agents/memories', guard(J(() => ({ memories: agents.agentMemories(cfg) }))));
  r.post(
    '/api/agents/tools/run',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = agents.agentToolSpec(cfg, String(b.tool || ''));
        audit.log({ action: 'agents.tool', tool: b.tool, user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Одит ───────────────────────────────────────────────────────────────────
  r.get('/api/audit', guard(J((req, res, p, url) => ({ entries: audit.tail(Number(url.searchParams.get('limit')) || 200) }))));

  // ── Federation ─────────────────────────────────────────────────────────────
  r.get('/api/nodes', guard(J(() => nodes.nodesStatus(cfg))));
  r.on(
    '*',
    '/api/nodes/:id/*',
    guard(
      (req, res, params, url) => {
        const peer = nodes.findPeer(cfg, params.id);
        if (!peer) return sendError(res, 404, 'Непознат възел');
        // Мутациите към peer също изискват CSRF маркера локално.
        if (req.method !== 'GET' && !csrfOk(req, null)) return sendError(res, 403, 'Отхвърлена заявка (CSRF).');
        nodes.proxyToPeer(peer, req, res, params.rest, url.search);
      }
    )
  );

  return r;
}
