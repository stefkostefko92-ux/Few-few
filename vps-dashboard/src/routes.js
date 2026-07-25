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
      }))
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
  r.get('/api/metrics/history', guard(J(async () => ({ step: 30, points: metrics.getHistory() }))));
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

  // ── Терминал (пълен контрол, одитиран) ─────────────────────────────────────
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
