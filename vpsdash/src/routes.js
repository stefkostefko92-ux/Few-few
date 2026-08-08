// Всички API маршрути + защитите: сесия/Bearer, CSRF маркер, одит.
import crypto from 'node:crypto';
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
import * as apthealth from './apthealth.js';
import * as reclaim from './reclaim.js';
import * as coverage from './coverage.js';
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
import { verifyTotp, generateSecret, otpauthUri, generateRecoveryCodes, hashRecoveryCode, verifyRecoveryCode } from './totp.js';
import { saveConfig } from './config.js';
import { configuredChannels } from './notify.js';
import { RANGES, diskSeries, knownMounts, memPercent } from './history.js';
import { forecastToLimit, detectAnomaly, changePoint, fmtDuration } from './forecast.js';
import { probe, resolveHost } from './probe.js';
import { evaluateBurn, budgetRemaining, windowStats } from './slo.js';
import { LogMiner } from './logmine.js';
import * as env from './env.js';
import * as limits from './limits.js';
import * as cronedit from './cronedit.js';
import * as domains from './domains.js';
import { readRaw, handleGithub } from './webhook.js';
import * as posture from './posture.js';
import * as investigate from './investigate.js';
import { AccessLogReader, discoverLogs } from './accesslog.js';
import { drillSpec, backupAge } from './drill.js';
import * as health from './health.js';
import * as redis from './redis.js';
import * as volumes from './volumes.js';
import * as desktop from './desktop.js';
import * as ports from './ports.js';
import * as portchange from './portchange.js';
import { receiveOffsite } from './backupsched.js';
import * as diskusage from './diskusage.js';
import * as panelbackup from './panelbackup.js';
import {
  SudoGrants, needsSudo, confirmSudo, SUDO_TTL_MS,
  sudoAllowed, sudoFailed, sudoSucceeded, ipAllowed, validateAllowlist,
} from './sudo.js';

const COOKIE = 'csd_sess';
// Версията се показва в подножието на панела и се праща на съседа при `/api/ping`.
// 1.0.0: всичките 37 секции работят, гейтът е 14 проверки, а шестте кръга одит
// (числа · необратими действия · известия · съсед · обеми · документи) са затворени.
export const VERSION = '1.1.1';

// Маршрути, които peer НИКОГА не пипа при обхват „read" (дори с GET) — това са
// входовете, които биха дали контрол над машината на компрометиран съсед.
export const PEER_DENY = [
  /^\/api\/terminal\//,
  /^\/api\/pty(\/|$)/,
  /^\/api\/power$/,
  /^\/api\/files\/(read|write)$/,
  /^\/api\/deploy\//,
  /^\/api\/firewall\//,
  /^\/api\/webserver\/site$/,
  /^\/api\/agents\/tools\/run$/,
  /^\/api\/totp\//,
  /^\/api\/alerts\/(settings|channels)$/,
  // Заглушаването е ослепяване — съседът няма работа да ни го прави, дори днес
  // маршрутът да е само POST (утре GET-вариант би го отворил безшумно).
  /^\/api\/alerts\/silence$/,
  /^\/api\/backups\/restore\//,
  /^\/api\/env(\/|$)/, // тайните на продуктите не тръгват към съседа
  /^\/api\/limits(\/|$)/,
  /^\/api\/cron\//,
  /^\/api\/domains\/issue$/,
  // ИЗХОДЯЩИ GET маршрути. Обхватът „read" пази от контрол над машината, но
  // тези три правят заявка към адрес, ИЗБРАН ОТ ВИКАЩИЯ — значи компрометиран
  // съсед ни ползва като SSRF-прокси към 127.0.0.1, вътрешната мрежа и
  // метаданните на облака. „Заглавки за сигурност" връща ЦЕЛИТЕ заглавки на
  // произволен адрес, а пробата дава оракул за съдържание през `expect`.
  /^\/api\/probe$/,
  /^\/api\/security\/headers$/,
  /^\/api\/domains\/registration$/,
  // Разузнаване: одитът носи IP-та на админа, действия и jti; списъкът със
  // сесии — jti/браузър/изтичане; настройките за достъп — целия IP allowlist.
  // Съседът няма работа с тях дори „само за четене".
  /^\/api\/audit(\/|$)/,
  /^\/api\/sessions(\/|$)/,
  /^\/api\/settings\/access$/,
  // Десктопът е графична сесия НА нашата машина — съседът няма работа с нея,
  // нито да я пуска, нито да гледа през нея.
  /^\/api\/desktop(\/|$)/,
  // Картата на изложеността е разузнаване, а смяната на порт е промяна по
  // машината — и двете са наши, не на съседа.
  /^\/api\/ports(\/|$)/,
  // Peer НИКОГА не бива да ни ползва като прокси към трети възел: иначе
  // компрометиран съсед, който знае само НАШИЯ входящ токен, стига до другите
  // ни възли с ТЕХНИТЕ токени, които ние пазим (confused deputy). Може и да
  // верижи: /api/nodes/B/api/nodes/C/…
  /^\/api\/nodes\//,
  // Изходът на задачите е ковертен канал около защитата на тайните: ако някой
  // е пуснал дъмп или `cat` в терминала, тайната стои в изхода на задачата.
  /^\/api\/jobs(\/|$)/,
];

// Изключения: маршрути, които peer-ът ТРЯБВА да ползва въпреки обхвата „read" —
// огледалото на одита се ПРАЩА от него по дизайн (това е целта на изнасянето).
// Копието на бекъпа СЕ ПРАЩА от съседа по дизайн — точно като огледалото на
// одита. Останалите `/api/backups/*` мутации му остават забранени (той не пипа
// нашия график и не пуска нашите бекъпи).
export const PEER_ALLOW = [/^\/api\/audit\/mirror$/, /^\/api\/backups\/offsite\/receive$/];

// Единственото изключение от списъка с разрешени адреси: GitHub чука отвън и
// адресите му не са наши. Маршрутът носи защитата си сам (HMAC подпис).
export const IP_ALLOWLIST_EXEMPT = [/^\/api\/webhook\//];

// Пази се на едно място, за да важи и за статиката, и за входа — иначе „скенер
// не стига до формата за вход" е просто невярно.
export function ipGateAllows(req, cfg, pathname, clientIpFn) {
  if (IP_ALLOWLIST_EXEMPT.some((rx) => rx.test(pathname))) return true;
  return ipAllowed(clientIpFn(req, cfg.trustProxy), cfg.allowIps);
}

// Изходящ адрес, зададен от човек през браузъра. Схемата не стига: панелът върви
// като root на същата машина, на която живеят Redis, Postgres и самият панел,
// а в облак — и метаданните на инстанцията. „http(s) е валидно" превръща едно
// поле в настройките в SSRF пистолет, който гърми на всеки каданс.
//
// Частните мрежи са ПОЗВОЛЕНИ съзнателно: канонично препоръчваме монитор на
// ДРУГИЯ ни VPS, който често е на вътрешен адрес. Затова защитата е двойна —
// забраняваме само това, което няма законна употреба (loopback, link-local,
// вградени име:парола), а всичко останало става ВИДИМО (origin в отговора и в
// одита).
export function assertOutboundUrl(raw, label = 'Адресът') {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    throw Object.assign(new Error(`${label} иска валиден http(s) адрес`), { status: 400 });
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw Object.assign(new Error(`${label} иска http(s) адрес`), { status: 400 });
  }
  if (u.username || u.password) {
    throw Object.assign(new Error(`${label} не бива да носи име и парола в адреса`), { status: 400 });
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|::1|0\.0\.0\.0|0+)$/;
  // 169.254.0.0/16 и fe80::/10 — метаданните на облачната инстанция живеят точно
  // там (169.254.169.254) и са класическата цел на SSRF.
  const LINK_LOCAL = /^(169\.254\.\d+\.\d+|fe[89ab][0-9a-f]:|fd[0-9a-f]{2}:)/;
  if (LOOPBACK.test(host) || LINK_LOCAL.test(host)) {
    throw Object.assign(
      new Error(`${label} не бива да сочи към самата машина или към метаданните на доставчика (${host}).`),
      { status: 400 }
    );
  }
  return u;
}

// Затворен списък по канал и по поле. Всичко извън него се изхвърля мълчаливо —
// патърнът е същият като при праговете, а не „вярвай на тялото".
const NOTIFY_FIELDS = {
  telegram: ['botToken', 'chatId', 'minSeverity'],
  ntfy: ['server', 'topic', 'token', 'minSeverity'],
  webhook: ['url', 'minSeverity'],
  email: ['to', 'from', 'minSeverity'],
};
const SEVERITIES = new Set(['', 'info', 'warning', 'critical']);

export function safeOrigin(raw) {
  if (!raw) return null;
  try {
    return new URL(String(raw)).origin;
  } catch {
    return '(невалиден адрес)';
  }
}

export function sanitizeNotify(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const out = {};
  for (const [chan, fields] of Object.entries(NOTIFY_FIELDS)) {
    const src = input[chan];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const clean = {};
    for (const f of fields) {
      if (src[f] === undefined) continue;
      const v = String(src[f]).slice(0, 500).replace(/[\r\n]/g, '');
      // Непознат праг = без филтър; мълчаливото „не разпознах" е по-безопасно от
      // тихо спиране на канала.
      if (f === 'minSeverity' && !SEVERITIES.has(v)) continue;
      clean[f] = v;
    }
    if (Object.keys(clean).length) out[chan] = clean;
  }
  return Object.keys(out).length ? out : null;
}

export function buildRouter(ctx) {
  const { cfg, audit, jobs, metrics } = ctx;
  const r = new Router();
  const sudo = ctx.sudo || new SudoGrants();

  // ── Помощници ──────────────────────────────────────────────────────────────
  const auth = (req) => {
    // 1) Federation: Bearer peerToken (другият VPS / прокси).
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (bearer && cfg.peerToken && tokenEqual(bearer, cfg.peerToken)) {
      return { user: 'peer', peer: true };
    }
    // 2) Браузър: подписано сесийно куки.
    const sess = verifySession(cfg.sessionSecret, parseCookies(req)[COOKIE], {
      gen: cfg.sessionGen || 0,
      revoked: ctx.revokedSessions,
    });
    return sess ? { user: sess.user, peer: false, sess } : null;
  };

  // Плъзгащ се прозорец: всяка заявка подновява бисквитката до `idleMinutes`
  // напред, но никога отвъд абсолютния таван в токена. Забравена сесия умира
  // сама, вместо да е root shell цели 12 часа.
  const slideSession = (req, res, who) => {
    if (!who?.sess || who.peer) return;
    const idleMs = (cfg.idleMinutes || 30) * 60 * 1000;
    const remaining = who.sess.absolute ? who.sess.absolute - Date.now() : idleMs;
    if (remaining <= 0) return;
    const ttl = Math.min(idleMs, remaining);
    // Подновяваме само ако е изтекла поне минута — иначе пишем куки на всяка заявка.
    if (who.sess.exp - Date.now() > ttl - 60_000) return;
    const token = createSession(cfg.sessionSecret, who.user, ttl, {
      absoluteMs: remaining,
      gen: cfg.sessionGen || 0,
      jti: who.sess.jti,
    });
    setSessionCookie(res, token, Math.floor(ttl / 1000));
  };

  const setSessionCookie = (res, token, maxAgeSec) => {
    const secure = cfg.trustProxy ? '; Secure' : '';
    res.setHeader('set-cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`);
  };

  // Federation обхват: по подразбиране peer-ът е САМО ЗА ЧЕТЕНЕ. Компрометиран
  // втори VPS иначе получава root shell на първия през /api/nodes/<id>/…
  // Разрешава се изрично с "peerScope": "full" в конфига.
  const peerAllowed = (req, url) => {
    if (PEER_ALLOW.some((rx) => rx.test(url.pathname))) return true;
    if ((cfg.peerScope || 'read') === 'full') return true;
    if (req.method !== 'GET') return false;
    return !PEER_DENY.some((rx) => rx.test(url.pathname));
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
      if (who.peer && !peerAllowed(req, url)) {
        audit.log({ action: 'peer.denied', path: url.pathname, method: req.method });
        return sendError(res, 403, 'Peer-ът има само достъп за четене (peerScope).');
      }
      // Режим „sudo": повторна автентикация точно преди необратимото. Открадната
      // сесия вече не е достатъчна за изтрит продукт или изключен сървър.
      // Peer-ът е изключен — той няма браузър, който да покаже диалога, а
      // достъпът му и без това е ограничен от peerScope.
      if (!who.peer && needsSudo(url.pathname, cfg, { mutating }) && !sudo.has(who.sess?.jti)) {
        audit.log({ action: 'sudo.required', path: url.pathname, user: who.user });
        return sendError(res, 428, 'Това действие иска повторно потвърждаване с парола.');
      }
      req.user = who.user;
      req.jti = who.sess?.jti || null;
      // „Последно видяна" се пишеше САМО при вход и се четеше само за
      // подредбата — тоест колоната показваше времето на ВХОД и две сесии,
      // едната мъртва от часове, изглеждаха еднакво живи. Точно сигналът, който
      // списъкът обещава („непозната сесия = пробив"), не се получаваше.
      if (req.jti) {
        const s = ctx.sessions.get(req.jti);
        if (s) s.lastSeen = Date.now();
      }
      slideSession(req, res, who);
      return handler(req, res, params, url);
    };
  };

  // Системните грешки от `fs`/`child_process` нямат `status` → рутерът ги
  // третираше като 500 „Вътрешна грешка". Това е ЛЪЖА за произхода: несъществуващ
  // път или файл вместо папка е грешка във ВХОДА, не в панела. Освен подвеждащо,
  // е и вредно: 5xx влизат в SLO и хранят алармата „процент грешки" — един бот,
  // който чука `/api/files?path=…`, вдига критична аларма за напълно здрав панел.
  // Затова познатите кодове се превеждат тук, на ЕДНО място, а не във всеки модул.
  const ERRNO_STATUS = {
    ENOENT: 404, // няма такъв път
    ENOTDIR: 400, // компонент от пътя не е папка
    EISDIR: 400, // папка там, където се иска файл
    EACCES: 403, // няма права (панелът е root, но монтирането може да е ro/noexec)
    EPERM: 403,
    ENAMETOOLONG: 400,
    ELOOP: 400, // символна връзка в кръг
    EINVAL: 400,
  };
  const J = (fn) => async (req, res, params, url) => {
    let data;
    try {
      data = await fn(req, res, params, url);
    } catch (err) {
      const mapped = !err?.status && ERRNO_STATUS[err?.code];
      if (mapped) throw Object.assign(new Error(errText(err, mapped)), { status: mapped });
      throw err;
    }
    if (data !== undefined) sendJson(res, 200, data);
  };

  // Текстът е за ЧОВЕК, не преразказ на errno. Пътят не се повтаря в отговора —
  // той идва от заявката и ехото му обратно е ненужна повърхност.
  function errText(err, status) {
    if (status === 404) return 'Няма такъв път.';
    if (status === 403) return 'Няма права за този път.';
    if (err?.code === 'ENOTDIR') return 'Пътят не е папка.';
    if (err?.code === 'EISDIR') return 'Пътят е папка, а се иска файл.';
    if (err?.code === 'ENAMETOOLONG') return 'Твърде дълъг път.';
    if (err?.code === 'ELOOP') return 'Символната връзка сочи в кръг.';
    return 'Невалиден път.';
  }

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
      if (step !== null && step !== ctx.lastTotpStep) {
        ctx.lastTotpStep = step;
      } else {
        // Резервен код — за когато телефонът го няма. Еднократен: изразходва се
        // веднага и се маха от конфига, за да не може да се ползва пак.
        const idx = verifyRecoveryCode(body.code, cfg.totp.recoveryHashes || []);
        if (idx < 0) {
          loginFailed(ip);
          audit.log({ action: 'login.fail2fa', ip });
          return sendError(res, 401, body.code ? 'Грешен код от приложението.' : 'Нужен е код (2FA).');
        }
        const remaining = (cfg.totp.recoveryHashes || []).filter((_, i) => i !== idx);
        saveConfig(cfg, { totp: { ...cfg.totp, recoveryHashes: remaining } });
        audit.log({ action: 'login.recovery', ip, remaining: remaining.length });
        ctx.recoveryUsed = { at: Date.now(), remaining: remaining.length };
      }
    }
    loginSucceeded(ip);
    const absoluteMs = (cfg.sessionTtlHours || 12) * 3600 * 1000;
    const idleMs = (cfg.idleMinutes || 30) * 60 * 1000;
    const ttl = Math.min(idleMs, absoluteMs);
    const jti = crypto.randomBytes(9).toString('base64url');
    const token = createSession(cfg.sessionSecret, cfg.adminUser, ttl, {
      absoluteMs,
      gen: cfg.sessionGen || 0,
      jti,
    });
    // Списък на активните сесии — непозната сесия тук е сигнал за пробив.
    ctx.sessions.set(jti, {
      jti,
      ip,
      ua: String(req.headers['user-agent'] || '').slice(0, 120),
      issuedAt: Date.now(),
      lastSeen: Date.now(),
      absolute: Date.now() + absoluteMs,
    });
    audit.log({ action: 'login.ok', ip, user: cfg.adminUser, jti });
    setSessionCookie(res, token, Math.floor(ttl / 1000));
    sendJson(res, 200, { ok: true, user: cfg.adminUser });
  });

  r.post('/api/logout', (req, res) => {
    // Токенът е самостоятелен (HMAC) — изтриването на бисквитката не го обезсилва.
    // Затова jti влиза в списък с отменени: откраднат токен спира ВЕДНАГА.
    const who = auth(req);
    if (who?.sess?.jti) {
      ctx.revokedSessions.add(who.sess.jti, who.sess.absolute || Date.now() + 12 * 3600000);
      ctx.sessions.delete(who.sess.jti);
      audit.log({ action: 'logout', jti: who.sess.jti, user: who.user });
    }
    res.setHeader('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
    sendJson(res, 200, { ok: true });
  });

  // ── Сесии: преглед и отмяна ────────────────────────────────────────────────
  r.get(
    '/api/sessions',
    guard(
      J(async (req) => ({
        current: req.user,
        // Кой ред е ТОВА устройство. Без него човек не различава своята сесия от
        // чуждата и или не смее да отмени нищо, или изхвърля себе си по погрешка.
        currentJti: req.jti || null,
        idleMinutes: cfg.idleMinutes || 30,
        absoluteHours: cfg.sessionTtlHours || 12,
        // Изтеклите отпадат ТУК, а не висят като живи. „Непозната сесия е
        // сигнал за пробив" не работи, ако списъкът е пълен с призраци.
        sessions: [...ctx.sessions.values()]
          .filter((s) => {
            if (s.absolute > Date.now()) return true;
            ctx.sessions.delete(s.jti);
            return false;
          })
          .sort((a, b) => b.lastSeen - a.lastSeen),
      }))
    )
  );
  r.post(
    '/api/sessions/revoke-all',
    guard(
      J(async (req) => {
        // Вдигането на поколението обезсилва ВСИЧКИ издадени токени наведнъж.
        saveConfig(cfg, { sessionGen: (cfg.sessionGen || 0) + 1 });
        ctx.sessions.clear();
        ctx.revokedSessions.clear();
        audit.log({ action: 'sessions.revokeAll', gen: cfg.sessionGen, user: req.user });
        return { ok: true, gen: cfg.sessionGen };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/sessions/revoke',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const jti = String(b.jti || '');
        if (!jti) throw Object.assign(new Error('Липсва jti'), { status: 400 });
        // Не знаем `exp` на чужд токен → пазим го до абсолютния таван на
        // сесиите (после подписът и без това е мъртъв).
        ctx.revokedSessions.add(jti, Date.now() + (cfg.sessionTtlHours || 12) * 3600000);
        ctx.sessions.delete(jti);
        audit.log({ action: 'sessions.revoke', jti, user: req.user });
        return { ok: true };
      }),
      { mutating: true }
    )
  );

  // Проверка на целостта на одита (хеш-верига).
  r.get('/api/audit/verify', guard(J(() => audit.verify())));

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
        recoveryLeft: (cfg.totp?.recoveryHashes || []).length,
        // Панелът върви от резервния конфиг → лентата отгоре го КАЗВА. Тихото
        // възстановяване би скрило, че запис се е провалил, и човек би работил
        // със стари настройки, вярвайки, че са текущите.
        recovered: cfg.recovered || null,
      }))
    )
  );

  // ── Режим „sudo" ───────────────────────────────────────────────────────────
  r.get(
    '/api/sudo',
    guard(
      J((req) => ({
        enabled: cfg.sudoMode?.enabled !== false,
        active: sudo.has(req.jti),
        remainingMs: sudo.remaining(req.jti),
        ttlMs: SUDO_TTL_MS,
        needsCode: Boolean(cfg.totp?.enabled),
      }))
    )
  );
  r.post(
    '/api/sudo',
    guard(
      J(async (req, res) => {
        const jti = req.jti;
        // Без ограничител екранът за потвърждаване става оракул за налучкване на
        // паролата — с валидна (открадната) сесия и неограничени опити.
        if (!sudoAllowed(jti)) {
          audit.log({ action: 'sudo.throttled', user: req.user });
          throw Object.assign(new Error('Твърде много опити — изчакай 10 минути.'), { status: 429 });
        }
        const b = await readJson(req);
        // `ctx` носи `lastTotpStep` — същия брояч, който ползва и входът.
        const r2 = confirmSudo(cfg, { password: b.password, code: b.code }, saveConfig, ctx);
        if (!r2.ok) {
          sudoFailed(jti);
          audit.log({ action: 'sudo.failed', user: req.user });
          throw Object.assign(new Error(r2.error), { status: 401 });
        }
        sudoSucceeded(jti);
        const until = sudo.grant(jti);
        audit.log({ action: 'sudo.granted', user: req.user, usedRecovery: Boolean(r2.usedRecovery) });
        return { ok: true, until, remainingMs: SUDO_TTL_MS, usedRecovery: Boolean(r2.usedRecovery), recoveryLeft: r2.recoveryLeft };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/sudo/revoke',
    guard(
      J((req) => {
        sudo.revoke(req.jti);
        audit.log({ action: 'sudo.revoked', user: req.user });
        return { ok: true };
      }),
      { mutating: true }
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
        // Резервните кодове се показват ЕДИН ПЪТ, тук. В конфига влизат само
        // хешовете им — открадне ли някой конфига, не получава работещи кодове.
        const codes = generateRecoveryCodes();
        saveConfig(cfg, {
          totp: { enabled: true, secret, recoveryHashes: codes.map(hashRecoveryCode) },
        });
        ctx.pendingTotp = null;
        audit.log({ action: 'totp.enable', user: req.user, recoveryCodes: codes.length });
        return { enabled: true, recoveryCodes: codes };
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
        saveConfig(cfg, { totp: { enabled: false, secret: '', recoveryHashes: [] } });
        audit.log({ action: 'totp.disable', user: req.user });
        return { enabled: false };
      }),
      { mutating: true }
    )
  );
  // Нови резервни кодове (старите падат). Иска паролата — открадната сесия да не
  // може да си извади свеж комплект ключове.
  r.post(
    '/api/totp/recovery/regenerate',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        if (!verifyPassword(String(b.password || ''), cfg.passwordHash)) {
          throw Object.assign(new Error('Грешна парола.'), { status: 401 });
        }
        if (!cfg.totp?.enabled) throw Object.assign(new Error('2FA не е включена.'), { status: 400 });
        const codes = generateRecoveryCodes();
        saveConfig(cfg, { totp: { ...cfg.totp, recoveryHashes: codes.map(hashRecoveryCode) } });
        audit.log({ action: 'totp.recoveryRegenerate', user: req.user });
        return { recoveryCodes: codes };
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

  // ── Сигнали от ядрото + прогнози ───────────────────────────────────────────
  r.get(
    '/api/kernel',
    guard(
      J(async () => {
        const snap = metrics.latest || (await metrics.sample());
        return { ts: snap.ts, ...(snap.kernel || {}) };
      })
    )
  );
  r.get(
    '/api/forecast',
    guard(
      J(async () => {
        const points = ctx.history ? ctx.history.range(7 * 24 * 3600 * 1000, 500) : [];
        const disks = [];
        for (const mount of knownMounts(points)) {
          const series = diskSeries(points, mount);
          const f = forecastToLimit(series, 100);
          disks.push({
            mount,
            points: series.length,
            ...f,
            human: f.ok && f.etaMs !== undefined ? fmtDuration(f.etaMs) : null,
          });
        }
        // Аномалии по основните редове + кога се е сменило поведението.
        const cpuSeries = points.map((p) => p.cpu).filter((v) => typeof v === 'number');
        const memSeries = points.map(memPercent).filter((v) => v !== null);
        return {
          disks,
          anomalies: {
            cpu: detectAnomaly(cpuSeries),
            memory: detectAnomaly(memSeries),
          },
          // Липсващата стойност се ИЗХВЪРЛЯ, не се замества с 0: `?? 0` рисува
          // отвесен спад до нулата на всяко място, където няма измерване (напр.
          // първата точка след рестарт на панела), и детекторът съобщава
          // „поведението се промени тогава" — сочейки собствения си рестарт.
          changePoint: changePoint(points.map((p) => ({ x: p.ts, y: p.cpu })).filter((p) => typeof p.y === 'number')),
          basedOnPoints: points.length,
        };
      })
    )
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
      // Валидирай ПРЕДИ да отвориш потока: щом SSE прати хедърите, всяка грешка
      // след това не може да се върне като HTTP статус (виж sendJson).
      const unit = url.searchParams.get('unit') || undefined;
      const priority = url.searchParams.get('priority') ?? undefined;
      if (unit) services.assertUnit(unit);
      if (priority !== undefined && priority !== '') {
        const pr = Number(priority);
        if (!Number.isInteger(pr) || pr < 0 || pr > 7) {
          return sendError(res, 400, 'Невалиден приоритет');
        }
      }
      const sse = openSse(res);
      services.journalFollow({ unit, priority }, sse, res);
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
        // Праговете по канал са настройка, не тайна — връщат се, за да ги
        // покаже интерфейсът. Токените НИКОГА не излизат оттук.
        minSeverity: {
          telegram: cfg.notify?.telegram?.minSeverity || '',
          ntfy: cfg.notify?.ntfy?.minSeverity || '',
          webhook: cfg.notify?.webhook?.minSeverity || '',
          email: cfg.notify?.email?.minSeverity || '',
        },
        accesslog: cfg.accesslog || {},
        // Origin-ът на мъртвеца-ключ е ВИДИМ (пътят носи токена и остава скрит).
        // Без него полето е невидим изходящ канал: root процес чука някъде на
        // всеки каданс, а никъде в панела не пише къде.
        heartbeatOrigin: safeOrigin(cfg.alerts?.heartbeatUrl),
        // Здравето на САМИЯ мониторинг: „няма аларми" значи съвсем различно
        // нещо според това дали проверката върви или е спряла преди 3 часа.
        health: ctx.alerts ? ctx.alerts.health() : null,
        active: ctx.alerts ? ctx.alerts.listActive() : [],
        log: ctx.alerts ? ctx.alerts.log.slice(-100).reverse() : [],
      }))
    )
  );

  // Заглушаване — срочно и видимо. Безсрочното е начинът да забравиш, че си
  // сляп, затова продължителността е задължителна и с таван от 7 дни.
  r.post(
    '/api/alerts/silence',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const key = String(b.key || '').trim();
        if (!key || key.length > 200 || /[\r\n]/.test(key)) {
          throw Object.assign(new Error('Липсва или невалиден ключ на аларма'), { status: 400 });
        }
        // Изтеклите отпадат тук — така списъкът не расте вечно от само себе си.
        const list = (cfg.alerts?.silences || []).filter((s) => s?.key !== key && Number(s?.until) > Date.now());
        // Таван на БРОЯ. Конфигът съдържа passwordHash и sessionSecret и се
        // пренаписва ЦЯЛ при всеки запис — неограничен списък значи растящ файл
        // с тайните вътре, пренаписван на всяко натискане на бутона.
        if (!b.remove && list.length >= 50) {
          throw Object.assign(new Error('Твърде много активни заглушавания (50). Махни някои — иначе не знаеш за какво си сляп.'), { status: 409 });
        }
        if (b.remove) {
          saveConfig(cfg, { alerts: { silences: list } });
          audit.log({ action: 'alerts.unsilence', key, user: req.user });
          return { ok: true, silences: list };
        }
        const minutes = Number(b.minutes);
        if (!Number.isFinite(minutes) || minutes < 1 || minutes > 7 * 24 * 60) {
          throw Object.assign(new Error('Продължителност от 1 минута до 7 дни'), { status: 400 });
        }
        const entry = { key, until: Date.now() + minutes * 60000, note: String(b.note || '').slice(0, 200) };
        list.push(entry);
        saveConfig(cfg, { alerts: { silences: list } });
        audit.log({ action: 'alerts.silence', key, minutes, user: req.user });
        return { ok: true, silences: list };
      }),
      { mutating: true }
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
        if (b.accesslog) {
          patch.accesslog = {};
          if (b.accesslog.enabled !== undefined) patch.accesslog.enabled = Boolean(b.accesslog.enabled);
          for (const k of ['errorPct', 'minRequests']) {
            const n = Number(b.accesslog[k]);
            if (Number.isFinite(n) && n >= 0) patch.accesslog[k] = n;
          }
        }
        // „Записано" трябва да значи ЗАПИСАНО. Маршрутът приема ЗАТВОРЕН списък
        // полета (нарочно — вложеният обект е защитата срещу презаписване на
        // тайни); но тяло, което не съвпада с формата, минаваше през него без
        // нито едно приложено поле и връщаше `ok: true`. Човекът вижда „готово",
        // прагът не е сменен, и следващият въпрос е „защо алармата пак гърми".
        const applied = Object.keys(patch.alerts?.thresholds || {})
          .concat(Object.keys(patch.alerts || {}).filter((k) => k !== 'thresholds'))
          .concat(Object.keys(patch.accesslog || {}));
        if (!applied.length) {
          throw Object.assign(
            new Error('Нищо не е разпознато в тялото — очаква се { alerts: { thresholds: {…} } } или { accesslog: {…} }.'),
            { status: 400 }
          );
        }
        saveConfig(cfg, patch);
        audit.log({ action: 'alerts.settings', fields: applied.join(','), user: req.user });
        return { ok: true, applied };
      }),
      { mutating: true }
    )
  );

  // Канали + мъртвец-ключ — ОТДЕЛЕН маршрут, защото носи друг клас риск:
  // тайни и изходящ адрес, до който root процесът чука на всеки каданс. Затова е
  // единственото тук, което иска повторна автентикация (виж SUDO_ON_WRITE).
  // Праговете по-горе са числа и остават без sudo — панел, който пита за парола
  // на всяка настройка, свършва с изключен sudo режим.
  r.post(
    '/api/alerts/channels',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const patch = {};
        if (b.heartbeatUrl !== undefined) {
          const u = String(b.heartbeatUrl || '').trim();
          if (u) assertOutboundUrl(u, 'Мъртвецът-ключ');
          patch.alerts = { heartbeatUrl: u };
          // Адресът се ОДИТИРА по origin. Без този ред панелът има поле, което
          // кара root процес да чука някъде на всеки 60 секунди, безсрочно и
          // преживявайки рестарт, а НИКЪДЕ не се вижда къде — нито в отговора
          // (тайната е в пътя), нито в дневника. Готов невидим изходящ канал.
          audit.log({ action: 'alerts.heartbeat', origin: safeOrigin(u) || '(изключен)', user: req.user });
        }
        // Каналите минават през ИЗРИЧЕН списък по поле, не суров вход. Едно тяло
        // `{"notify":"каквото и да е"}` иначе презаписваше целия обект и
        // ИЗТРИВАШЕ botToken/chatId/topic/URL — необратимо (тайните не се пазят
        // другаде) и безшумно (одитът по конструкция не записва стойности).
        const notifyPatch = sanitizeNotify(b.notify);
        if (notifyPatch) patch.notify = notifyPatch;
        if (!Object.keys(patch).length) return { ok: true, note: 'Няма промяна.' };
        saveConfig(cfg, patch);
        audit.log({ action: 'alerts.channels', user: req.user }); // без стойности — тук има токени
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
        // Пробното известие е ИЗХОДЯЩО действие — тръгва към Telegram/ntfy/имейл
        // с името на възела. Всичко, което напуска машината, оставя следа (същото
        // правило като при адреса на мъртвеца-ключ), иначе открадната сесия има
        // безшумен канал навън.
        audit.log({ action: 'alerts.test', sent: entry.sent, failed: entry.failed, user: req.user });
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

  // ── Кои сайтове не се следят ───────────────────────────────────────────────
  r.get('/api/webserver/coverage', guard(J(() => coverage.siteCoverage(cfg))));
  r.post(
    '/api/webserver/coverage/watch',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        // Домейнът се проверява СРЕЩУ реално намерените — не се вярва на тялото.
        // Иначе това е „добави произволен изходящ адрес, който панелът да чука
        // на всеки каданс" (същата заплаха като heartbeatUrl).
        const found = coverage.siteCoverage(cfg);
        const hit = found.sites.find((s) => s.domain === coverage.canonical(b.domain || ''));
        if (!hit) throw Object.assign(new Error('Този домейн не е сред живите vhost-ове.'), { status: 400 });
        const check = coverage.healthCheckFor(hit.domain);
        const list = [...(cfg.healthChecks || []), check];
        saveConfig(cfg, { healthChecks: list });
        audit.log({ action: 'coverage.watch', domain: hit.domain, user: req.user });
        return { ok: true, added: check };
      }),
      { mutating: true }
    )
  );

  // ── Освобождаване на място ─────────────────────────────────────────────────
  r.get('/api/reclaim', guard(J(() => reclaim.reclaimable(cfg))));
  r.post(
    '/api/reclaim/run',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        // Списъкът с пътища се смята НАНОВО на сървъра — не се приема от тялото.
        // Клиентът казва само КОЯ категория; кои файлове влизат в нея е решение
        // на сървъра. Иначе това е „изтрий каквото ти кажа" зад приятен интерфейс.
        const fresh = await reclaim.reclaimable(cfg);
        const item = fresh.items.find((i) => i.id === b.id);
        if (!item) throw Object.assign(new Error('Няма такава категория (или вече е чиста).'), { status: 400 });
        return jobs.start(reclaim.reclaimSpec(item.id, item), { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Ъпдейти + захранване ───────────────────────────────────────────────────
  r.get('/api/updates', guard(J(() => system.updatesInfo())));
  // Защо apt не работи. Отделен маршрут от списъка с пакети: списъкът може да е
  // празен ИМЕННО защото ъпдейтът е блокиран — двете отговарят на различни въпроси.
  r.get(
    '/api/updates/health',
    guard(J(async () => {
      const snap = metrics.latest || (await metrics.sample());
      return apthealth.aptHealth(snap.disks || []);
    }))
  );
  r.post(
    '/api/updates/dpkg-repair',
    guard(J(async (req) => jobs.start(apthealth.dpkgRepairSpec(), { user: req.user })), { mutating: true })
  );
  r.post(
    '/api/updates/kernel-clean',
    guard(
      J(async (req) => {
        // Списъкът се смята НА СЪРВЪРА, не се приема от клиента: тяло с чужди
        // версии иначе би махнало работещото ядро.
        const snap = metrics.latest || (await metrics.sample());
        const h = await apthealth.aptHealth(snap.disks || []);
        return jobs.start(apthealth.kernelCleanSpec(h.kernels?.removable), { user: req.user });
      }),
      { mutating: true }
    )
  );
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
        return firewall.deleteRule(b.num, audit, req.user, { expect: b.expect || null, force: Boolean(b.force) });
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/firewall/enabled',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return firewall.setEnabled(Boolean(b.enabled), audit, req.user, { force: Boolean(b.force) });
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
          b.kind === 'restic' ? backups.resticSpec(cfg, b.mode === 'verify' ? 'verify' : 'backup') : backups.backupAllSpec(cfg);
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

  // ── SLO и бюджет за грешки ─────────────────────────────────────────────────
  r.get(
    '/api/slo',
    guard(
      J(async () => {
        if (!ctx.slo) return { enabled: false };
        const target = Number(cfg.slo?.target) || 0.999;
        const rows = ctx.slo.read(Date.now() - 31 * 86400000);
        const names = [...new Set(rows.map((x) => x.name))];
        return {
          enabled: cfg.slo?.enabled !== false,
          target,
          latencyTargetMs: cfg.slo?.latencyTargetMs || 800,
          products: names.map((name) => ({
            name,
            budget: budgetRemaining(rows, name, target),
            burn: evaluateBurn(rows, name, target, { minBadShort: cfg.slo?.minBadShort || 3 }),
            last1h: windowStats(rows, name, 3600_000),
            last24h: windowStats(rows, name, 86400_000),
          })),
        };
      })
    )
  );

  // ── Аналитика на журнала ───────────────────────────────────────────────────
  r.get(
    '/api/logs/analyze',
    guard(
      J(async (req, res, p, url) => {
        if (!ctx.logminer) return { available: false };
        const priority = Number(url.searchParams.get('priority') ?? cfg.logmine?.priority ?? 4);
        const windowMin = Math.min(1440, Math.max(5, Number(url.searchParams.get('window')) || 60));
        // persist:false — гледането НЕ бива да отнема на алармата признака „НОВА".
        const r2 = await ctx.logminer.collect({
          priority: Number.isInteger(priority) && priority >= 0 && priority <= 7 ? priority : 4,
          persist: false,
          sinceMin: windowMin,
        });
        return {
          ...r2,
          // Прозорецът е ИЗВЕСТЕН (фиксирани минути), затова „грешки/минута" е
          // истинско число, а не делене на измислена константа.
          byUnit: r2.groups ? LogMiner.ratesByUnit(r2.groups, windowMin) : [],
        };
      })
    )
  );

  // ── .env редактор ──────────────────────────────────────────────────────────
  r.get('/api/env', guard(J(() => ({ files: env.discover(cfg) }))));
  r.get(
    '/api/env/file',
    guard(
      J((req, res, p, url) => {
        const reveal = url.searchParams.get('reveal') === '1';
        // Разкриването е GET, но е точно това, срещу което съществува sudo:
        // открадната сесия иначе изнася всички ключове на продукцията наведнъж.
        if (reveal && cfg.sudoMode?.enabled !== false && !sudo.has(req.jti)) {
          throw Object.assign(new Error('Показването на тайните иска повторно потвърждаване с парола.'), { status: 428 });
        }
        return env.readEnv(cfg, url.searchParams.get('path'), { reveal }, audit, req.user);
      })
    )
  );
  r.post(
    '/api/env/file',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return env.writeEnv(cfg, b.path, { changes: b.changes, remove: b.remove }, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Ресурсни лимити ────────────────────────────────────────────────────────
  r.get('/api/limits', guard(J((req, res, p, url) => limits.readLimits(url.searchParams.get('unit')))));
  r.post(
    '/api/limits',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return b.clear ? limits.clearLimits(b.unit, audit, req.user) : limits.setLimits(b.unit, b, audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/limits/docker',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return limits.setDockerLimits(b.container, { memory: b.memory, cpus: b.cpus }, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Планирани задачи: редакция, „пусни сега", история ──────────────────────
  r.get('/api/cron/jobs', guard(J(() => cronedit.parseCrontab())));
  r.get('/api/cron/timers', guard(J(() => cronedit.timersWithResults())));
  r.get('/api/cron/history', guard(J((req, res, p, url) => cronedit.timerHistory(url.searchParams.get('unit')))));
  r.post(
    '/api/cron/add',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return cronedit.addCronJob(b, audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/cron/remove',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return cronedit.removeCronJob(b.index, audit, req.user);
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/cron/run',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return cronedit.timerRunNow(b.unit, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Домейни и сертификати ──────────────────────────────────────────────────
  r.get(
    '/api/domains',
    guard(
      J(async () => {
        const [certs, addr] = await Promise.all([domains.certificates(), domains.publicAddresses()]);
        return { certs, server: addr, acmeEmail: cfg.acmeEmail || '' };
      })
    )
  );
  r.get('/api/domains/preflight', guard(J((req, res, p, url) => domains.preflight(url.searchParams.get('domain')))));
  r.post(
    '/api/domains/issue',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const list = Array.isArray(b.domains) ? b.domains : [b.domain];
        // Проверката е ЗАДЪЛЖИТЕЛНА, не съвет: Let's Encrypt гори лимита от 5
        // провала на час и после не пуска дори при верен DNS. Единственият
        // байпас е пробното издаване (--staging), което не пипа бойния лимит.
        if (!b.staging) {
          for (const d of list) {
            const pf = await domains.preflight(d);
            if (!pf.ready) {
              throw Object.assign(
                new Error(`Проверката за ${d} не мина:\n• ${pf.problems.join('\n• ')}\n\nОправи това или пусни пробно издаване.`),
                { status: 400 }
              );
            }
          }
        }
        const spec = domains.issueSpec(list, {
          email: b.email || cfg.acmeEmail,
          webroot: b.webroot,
          dnsPlugin: b.dnsPlugin,
          staging: Boolean(b.staging),
        });
        audit.log({ action: 'domains.issue', domains: list, staging: Boolean(b.staging), user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Access log: кой адрес е бавен и кой връща грешки ───────────────────────
  r.get('/api/accesslog/files', guard(J(() => ({ files: discoverLogs() }))));
  r.get(
    '/api/accesslog',
    guard(
      J((req, res, p, url) => {
        const limit = Math.min(100, Math.max(5, Number(url.searchParams.get('limit')) || 25));
        // Същото и тук: отварянето на секцията не бива да „изяжда" данните, така
        // че следващото зареждане да показва 12 заявки вместо 40 000.
        return (ctx.accesslog || new AccessLogReader(cfg.paths.stateDir)).analyze({ limit, persist: false });
      })
    )
  );

  // ── Десктоп (незадължителен) ───────────────────────────────────────────────
  r.get('/api/desktop', guard(J(() => desktop.status(cfg))));
  r.post(
    '/api/desktop/:action',
    guard(
      J(async (req, res, params) => {
        const spec = desktop.actionSpec(cfg, params.action);
        const job = jobs.start(spec, { user: req.user });
        audit.log({ action: `desktop.${params.action}`, user: req.user });
        return job;
      }),
      { mutating: true }
    )
  );

  // ── Портове: карта на ИЗЛОЖЕНОСТТА ─────────────────────────────────────────
  r.get('/api/ports', guard(J(() => ports.exposureMap(cfg))));
  // „Приемам текущото състояние за нормално" — след това алармата е за НОВО
  // изложен порт. Без базова линия „порт 443 е отворен" би гърмяло вечно.
  r.post(
    '/api/ports/accept',
    guard(
      J(async (req) => {
        const map = await ports.exposureMap(cfg);
        if (!map.available) throw Object.assign(new Error(`Не мога да прочета портовете: ${map.error}`), { status: 400 });
        const st = ctx.portBaseline.accept(map.rows);
        audit.log({ action: 'ports.acceptBaseline', count: st.accepted.length, user: req.user });
        return { ok: true, ...st };
      }),
      { mutating: true }
    )
  );

  // Смяна на порта на продукт — ДВЕ стъпки. Планът не пипа нищо.
  r.post(
    '/api/ports/change/plan',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return portchange.plan(cfg, { product: b.product, newPort: b.newPort });
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/ports/change/apply',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const p = portchange.plan(cfg, { product: b.product, newPort: b.newPort });
        if (!p.applicable) {
          throw Object.assign(
            new Error('Планът няма нито едно място за смяна (нито .env, нито vhost) — няма какво да приложа.'),
            { status: 400 }
          );
        }
        const job = jobs.start(portchange.applySpec(p), { user: req.user });
        audit.log({ action: 'ports.change', product: p.product, from: p.currentPort, to: p.newPort, user: req.user });
        // `healthChecks` се обновява САМО при успех на задачата — иначе панелът
        // започва да вика порт, на който нищо не слуша, и вдига критична аларма
        // за продукт, който всъщност си работи на стария порт.
        ctx.watchPortChange?.(job.id, p);
        return { ...job, plan: p };
      }),
      { mutating: true }
    )
  );

  // ── Redis ──────────────────────────────────────────────────────────────────
  r.get('/api/redis', guard(J(() => redis.overview())));
  r.post(
    '/api/redis/save',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        audit.log({ action: 'redis.save', container: b.container, user: req.user });
        return jobs.start(redis.saveSpec(b.container), { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Томове и качени файлове ────────────────────────────────────────────────
  // Дъмпът на базата не покрива тома с качванията — при restore получаваш цели
  // данни и счупени препратки. Затова томовете са отделно, изрично действие.
  r.get('/api/volumes', guard(J(() => volumes.discover())));
  r.post(
    '/api/volumes/backup',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const found = await volumes.discover();
        if (!found.available) throw Object.assign(new Error(found.error || 'docker недостъпен'), { status: 400 });
        if (b.all) {
          audit.log({ action: 'volumes.backupAll', count: found.items.length, user: req.user });
          return jobs.start(volumes.backupAllVolumesSpec(found.items), { user: req.user });
        }
        const item = found.items.find((i) => i.id === b.id);
        if (!item) throw Object.assign(new Error('Няма такъв том/папка'), { status: 400 });
        audit.log({ action: 'volumes.backup', id: item.id, user: req.user });
        return jobs.start(volumes.volumeBackupSpec(item), { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Томове: възстановяване (огледалото на архивирането) ──────────────────
  r.get('/api/volumes/archives', guard(J(() => volumes.listVolumeArchives())));
  r.post(
    '/api/volumes/restore/preview',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        audit.log({ action: 'volumes.restorePreview', name: b.name, user: req.user });
        return jobs.start(volumes.volumeRestorePreviewSpec(b.name), { user: req.user });
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/volumes/restore/apply',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const parsed = volumes.parseArchiveName(b.name);
        // Контейнерите, които ползват целта, се откриват ТУК, не се вярва на
        // списък от браузъра — списък с чужд контейнер би спрял чужд продукт.
        let containers = [];
        const found = await volumes.discover();
        if (found.available) {
          const hit = found.items.find((i) =>
            parsed.kind === 'volume' ? i.type === 'volume' && i.name === parsed.volume : i.type === 'bind' && i.source === b.target
          );
          containers = hit?.containers || [];
        } else if (parsed.kind === 'volume') {
          // Том без docker не се възстановява по конструкция — казваме го ясно.
          throw Object.assign(new Error(`docker недостъпен: ${found.error}`), { status: 400 });
        }
        const spec = volumes.volumeRestoreApplySpec(b.name, { target: b.target || null, containers });
        audit.log({
          action: 'volumes.restoreApply',
          name: parsed.name,
          target: parsed.kind === 'volume' ? parsed.volume : b.target,
          containers,
          user: req.user,
        });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Бекъпи: възраст + проба за възстановяване ──────────────────────────────
  r.get('/api/backups/health', guard(J(() => ctx.drill.status(cfg))));
  r.post(
    '/api/backups/drill',
    guard(
      J(async (req) => {
        const spec = drillSpec();
        audit.log({ action: 'backup.drill', dump: spec.dumpName, user: req.user });
        const job = jobs.start(spec, { user: req.user });
        // Резултатът се записва при приключване — така „последна успешна проба"
        // е факт от изпълнението, не намерение.
        ctx.watchDrill?.(job.id, spec.dumpName);
        return job;
      }),
      { mutating: true }
    )
  );

  // ── Бекъпи: ГРАФИК + копие извън машината (3-2-1) ──────────────────────────
  r.get('/api/backups/schedule', guard(J(() => ctx.backupSchedule.status(cfg))));
  r.post(
    '/api/backups/schedule',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const s = cfg.backups?.schedule || {};
        const o = cfg.backups?.offsite || {};
        const num = (v, fallback, min, max) => {
          if (v === undefined || v === null || v === '') return fallback;
          const n = Number(v);
          if (!Number.isInteger(n) || n < min || n > max) {
            throw Object.assign(new Error(`Числото трябва да е цяло ${min}–${max}`), { status: 400 });
          }
          return n;
        };
        const next = {
          ...cfg.backups,
          schedule: {
            enabled: b.enabled === undefined ? s.enabled !== false : Boolean(b.enabled),
            everyHours: num(b.everyHours, s.everyHours ?? 24, 1, 24 * 30),
            atHour: num(b.atHour, s.atHour ?? 3, 0, 23),
          },
          offsite: {
            ...o,
            enabled: b.offsiteEnabled === undefined ? Boolean(o.enabled) : Boolean(b.offsiteEnabled),
            perRun: num(b.perRun, o.perRun ?? 3, 1, 50),
            maxMB: num(b.maxMB, o.maxMB ?? 4096, 1, 1024 * 100),
            keep: num(b.keep, o.keep ?? 10, 1, 500),
          },
        };
        saveConfig(cfg, { backups: next });
        audit.log({
          action: 'backup.schedule.set',
          enabled: next.schedule.enabled,
          atHour: next.schedule.atHour,
          offsite: next.offsite.enabled,
          user: req.user,
        });
        return ctx.backupSchedule.status(cfg);
      }),
      { mutating: true }
    )
  );
  // „Пусни сега" минава през СЪЩИЯ път като планираният бекъп (записва се в
  // историята на графика), за да не се разминават двата начина да се стигне до
  // един и същ резултат.
  r.post(
    '/api/backups/schedule/run',
    guard(
      J(async (req) => {
        audit.log({ action: 'backup.schedule.runNow', user: req.user });
        ctx.runScheduledBackup?.(`ръчно (${req.user})`);
        return { ok: true, started: true };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/backups/offsite/now',
    guard(
      J(async (req) => {
        audit.log({ action: 'backup.offsite.now', user: req.user });
        return { results: await ctx.offsite.shipAll() };
      }),
      { mutating: true }
    )
  );
  // Приемащата страна. Тялото е СУРОВ поток (гигабайти), затова НЕ минава през
  // readJson. Името на възела е ЕТИКЕТ от подателя, не доказана самоличност
  // (`peerToken` е общ) — `assertNodeId` го свежда до безопасна частица от път.
  r.post(
    '/api/backups/offsite/receive',
    guard(
      J(async (req, res, params, url) =>
        receiveOffsite(req, {
          node: url.searchParams.get('node'),
          name: url.searchParams.get('name'),
          sha256: req.headers['x-csd-sha256'],
          keep: Number(cfg.backups?.offsite?.keep) || 10,
          dir: ctx.backupSchedule.offsite,
          audit,
          user: req.user,
        })
      ),
      { mutating: true }
    )
  );

  // ── Кой яде диска ──────────────────────────────────────────────────────────
  r.get('/api/disk', guard(J(() => diskusage.overview(cfg, ctx.diskScan))));
  r.post(
    '/api/disk/scan',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = diskusage.scanSpec(cfg, { root: b.root, depth: b.depth, minMB: b.minMB });
        audit.log({ action: 'disk.scan', ...spec.scan, user: req.user });
        const job = jobs.start(spec, { user: req.user });
        // Резултатът се разбира от изхода при ПРИКЛЮЧВАНЕ — прекъснатото
        // сканиране не бива да се запише като пълна картина.
        ctx.watchDiskScan?.(job.id, spec.scan);
        return job;
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/disk/vacuum',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = diskusage.vacuumJournalSpec(b.keepMB);
        audit.log({ action: 'disk.vacuumJournal', keepMB: Number(b.keepMB), user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/disk/builder-prune',
    guard(
      J(async (req) => {
        audit.log({ action: 'disk.builderPrune', user: req.user });
        return jobs.start(diskusage.pruneBuildCacheSpec(), { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Месечен трафик срещу квотата ───────────────────────────────────────────
  r.get('/api/traffic', guard(J(() => ctx.traffic.status(cfg))));
  r.post(
    '/api/traffic/quota',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const tb = b.quotaTB === '' || b.quotaTB === null || b.quotaTB === undefined ? null : Number(b.quotaTB);
        if (tb !== null && (!Number.isFinite(tb) || tb <= 0 || tb > 10000)) {
          throw Object.assign(new Error('Квотата трябва да е число 0–10000 TB (празно = без квота)'), { status: 400 });
        }
        const dir = b.countDirection;
        if (dir !== undefined && !['tx', 'rx', 'both'].includes(dir)) {
          throw Object.assign(new Error('Посоката е „tx", „rx" или „both"'), { status: 400 });
        }
        const next = {
          ...cfg.traffic,
          quotaTB: tb,
          countDirection: dir || cfg.traffic?.countDirection || 'tx',
        };
        saveConfig(cfg, { traffic: next });
        audit.log({ action: 'traffic.quota.set', quotaTB: tb, direction: next.countDirection, user: req.user });
        return ctx.traffic.status(cfg);
      }),
      { mutating: true }
    )
  );

  // ── Седмичен дайджест ──────────────────────────────────────────────────────
  r.get(
    '/api/alerts/digest',
    guard(J(() => ({ ...ctx.alerts.digest.status(cfg), preview: ctx.alerts.digestText() })))
  );
  r.post(
    '/api/alerts/digest/send',
    guard(
      J(async (req) => {
        audit.log({ action: 'alerts.digest.sendNow', user: req.user });
        return { text: await ctx.alerts.sendDigest() };
      }),
      { mutating: true }
    )
  );

  // ── Режим „поддръжка" ──────────────────────────────────────────────────────
  r.get('/api/alerts/maintenance', guard(J(() => ({ maintenance: ctx.alerts.maintenance() }))));
  r.post(
    '/api/alerts/maintenance',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const minutes = Number(b.minutes);
        // Таван 8 часа: поддръжка без край е начинът да забравиш, че си сляп —
        // същото правило като при заглушаването (макс 7 дни, но там е по ключ).
        if (!Number.isInteger(minutes) || minutes < 5 || minutes > 8 * 60) {
          throw Object.assign(new Error('Продължителността е цяло число 5–480 минути'), { status: 400 });
        }
        const reason = String(b.reason || '').slice(0, 140);
        const m = { until: Date.now() + minutes * 60000, reason, startedAt: Date.now(), user: req.user };
        saveConfig(cfg, { alerts: { ...cfg.alerts, maintenance: m } });
        ctx.alerts.maintSuppressed = 0;
        audit.log({ action: 'alerts.maintenance.start', minutes, reason, user: req.user });
        return { maintenance: m };
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/alerts/maintenance/end',
    guard(
      J(async (req) => {
        if (!cfg.alerts?.maintenance) return { maintenance: null };
        // Ранният край минава по СЪЩИЯ път като изтичането — с обобщение.
        cfg.alerts.maintenance.until = Date.now() - 1;
        await ctx.alerts.expireMaintenance();
        audit.log({ action: 'alerts.maintenance.end', user: req.user });
        return { maintenance: null };
      }),
      { mutating: true }
    )
  );

  // ── Бекъп на САМИЯ панел ───────────────────────────────────────────────────
  r.get(
    '/api/backups/panel',
    guard(
      J(() => ({
        hasKey: Boolean(cfg.backups?.panelKey),
        backups: panelbackup.listPanelBackups(),
        restore: panelbackup.restoreInstructions(panelbackup.listPanelBackups()[0]?.name),
      }))
    )
  );
  // Показването на ключа е точно клас „разкриване на тайна" → sudo + одит, като
  // `.env` с reveal=1. Ключът съществува, за да бъде ПРЕПИСАН извън машината —
  // конфигът е вътре в архива и при мъртъв диск загива заедно с него.
  r.post(
    '/api/backups/panel/key',
    guard(
      J(async (req) => {
        const { key, fresh } = panelbackup.ensurePanelKey(cfg, saveConfig);
        audit.log({ action: 'backup.panelKey.reveal', fresh, user: req.user });
        return { key, fresh };
      }),
      { mutating: true }
    )
  );

  // ── Домейни: изтичане на РЕГИСТРАЦИЯТА (RDAP) ──────────────────────────────
  r.get(
    '/api/domains/registration',
    guard(
      J(async (req, res, p, url) => {
        const one = url.searchParams.get('domain');
        let names = one ? [one] : cfg.watchDomains || [];
        if (!names.length) {
          const certs = await system.tlsCerts();
          names = [...new Set(certs.map((c) => c.domain))];
        }
        const out = [];
        for (const n of [...new Set(names)].slice(0, 20)) out.push(await health.domainExpiry(n));
        return { domains: out };
      })
    )
  );

  // ── Заглавки за сигурност на живите сайтове ────────────────────────────────
  r.get(
    '/api/security/headers',
    guard(
      J(async (req, res, p, url) => {
        const one = url.searchParams.get('url');
        let targets = one ? [one] : cfg.headerTargets || [];
        if (!targets.length) {
          const certs = await system.tlsCerts();
          targets = certs.map((c) => `https://${c.domain}/`);
        }
        const out = [];
        for (const t of [...new Set(targets)].slice(0, 20)) out.push(await health.checkSiteHeaders(t));
        return { sites: out };
      })
    )
  );

  // ── Разследване ────────────────────────────────────────────────────────────
  // Сглобява вече събраното (метрики, одит, деплои, задачи, аларми) в ЕДНА
  // времева линия около момента. Отговаря на „какво се промени", не „колко е
  // процесорът" — и съзнателно не твърди причинност.
  r.get(
    '/api/investigate',
    guard(
      J(async (req, res, p, url) => {
        const windowMin = Math.min(720, Math.max(5, Number(url.searchParams.get('window')) || 30));
        const windowMs = windowMin * 60000;
        // Прозорецът за търсене на момента е по-широк от този за линията —
        // иначе не можеш да намериш нещо, започнало преди половин час.
        const points = ctx.history.range(Math.max(6 * 3600000, windowMs * 6), 800);
        const atParam = url.searchParams.get('at');
        const auto = investigate.findIncident(points);
        const at = atParam || auto?.at || new Date().toISOString();
        const state = deploy.deployState(cfg);
        const events = investigate.timeline({
          at,
          windowMs,
          audit: audit.tail(1500),
          alerts: ctx.alerts?.log || [],
          releases: state.releases || [],
          jobs: jobs.list(),
        });
        return {
          at,
          auto: auto || null,
          autoDetected: !atParam && Boolean(auto),
          windowMin,
          events,
          series: investigate.seriesAround(points, at, windowMs),
          summary: investigate.summarize(atParam ? null : auto, events),
        };
      })
    )
  );

  // ── Оценка за сигурност, целост на /etc, fail2ban ──────────────────────────
  r.get('/api/security/posture', guard(J(() => posture.posture())));
  r.get('/api/security/integrity', guard(J(() => posture.diffEtc(cfg.paths.stateDir))));
  r.post(
    '/api/security/integrity/baseline',
    guard(
      J((req) => {
        const snap = posture.snapshotEtc();
        audit.log({ action: 'integrity.baseline', files: Object.keys(snap.files).length, user: req.user });
        return posture.saveBaseline(cfg.paths.stateDir, snap);
      }),
      { mutating: true }
    )
  );
  r.get('/api/security/fail2ban', guard(J(() => posture.fail2banStatus())));
  r.post(
    '/api/security/fail2ban',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        return posture.fail2banAction(b.jail, b.ip, b.action, audit, req.user);
      }),
      { mutating: true }
    )
  );

  // ── Списък с разрешени адреси ──────────────────────────────────────────────
  r.get(
    '/api/settings/access',
    guard(
      J((req) => ({
        allowIps: cfg.allowIps || [],
        sudoMode: cfg.sudoMode?.enabled !== false,
        yourIp: clientIp(req, cfg.trustProxy),
        trustProxy: Boolean(cfg.trustProxy),
      }))
    )
  );
  r.post(
    '/api/settings/access',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const list = validateAllowlist(b.allowIps || []);
        const me = clientIp(req, cfg.trustProxy);
        // Единствената защита срещу „заключих се извън собствения си сървър":
        // непразен списък, който НЕ включва текущия адрес, се отказва.
        if (list.length && !ipAllowed(me, list)) {
          throw Object.assign(
            new Error(`Списъкът не включва текущия ти адрес (${me}) — това би те заключило отвън. Добави го или остави списъка празен.`),
            { status: 400 }
          );
        }
        saveConfig(cfg, { allowIps: list, sudoMode: { enabled: b.sudoMode !== false } });
        audit.log({ action: 'settings.access', entries: list.length, sudoMode: b.sudoMode !== false, user: req.user });
        return { ok: true, allowIps: list, sudoMode: b.sudoMode !== false };
      }),
      { mutating: true }
    )
  );

  // ── Webhook от GitHub (БЕЗ сесия — носи защитата си сам) ────────────────────
  // Единственият маршрут без guard(). Подписът е автентикацията; тялото е ДАННИ.
  r.post('/api/webhook/github', async (req, res) => {
    try {
      const raw = await readRaw(req);
      const out = await handleGithub(req, raw, cfg, ctx.alerts, audit);
      sendJson(res, 200, out);
    } catch (err) {
      sendError(res, Number(err.status) || 500, err.message);
    }
  });

  // ── Възстановяване от бекъп (две стъпки) ───────────────────────────────────
  r.post(
    '/api/backups/restore/preview',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        audit.log({ action: 'backup.restorePreview', name: b.name, user: req.user });
        return jobs.start(backups.restorePreviewSpec(b.name), { user: req.user });
      }),
      { mutating: true }
    )
  );
  r.post(
    '/api/backups/restore/apply',
    guard(
      J(async (req) => {
        const b = await readJson(req);
        const spec = backups.restoreApplySpec(b.name, b.target);
        // Възстановяването е най-опасното действие в панела — записва се едро.
        audit.log({ action: 'backup.restoreApply', name: b.name, target: b.target, user: req.user });
        return jobs.start(spec, { user: req.user });
      }),
      { mutating: true }
    )
  );

  // ── Синтетични проби (по фази) ─────────────────────────────────────────────
  r.get(
    '/api/probe',
    guard(
      J(async (req, res, p, url) => {
        const target = url.searchParams.get('url');
        if (!target) throw Object.assign(new Error('Липсва url'), { status: 400 });
        const expectText = url.searchParams.get('expect') || undefined;
        const result = await probe({ name: url.searchParams.get('name') || target, url: target, expectText });
        let dnsInfo = null;
        try {
          dnsInfo = await resolveHost(new URL(target).hostname);
        } catch {
          /* невалиден URL вече е обработен в probe */
        }
        return { ...result, dns: dnsInfo };
      })
    )
  );
  // Кръстосана проба: НИЕ сондираме публичните адреси на другия възел — външна
  // гледна точка, каквато локалната проба по дефиниция не може да даде.
  r.get(
    '/api/nodes/:id/crossprobe',
    guard(J(async (req, res, params) => nodes.crossProbe(cfg, params.id)))
  );
  r.get('/api/probe/targets', guard(J(() => ({ own: nodes.ownProbeTargets(cfg), peers: (cfg.peers || []).map((p) => ({ id: p.id, name: p.name, targets: p.probeTargets || [] })) }))));

  // ── Огледало на одита (приемане от друг възел) ─────────────────────────────
  r.post(
    '/api/audit/mirror',
    guard(
      J(async (req) => {
        // Само peer праща огледало; локалният админ няма причина да го вика.
        const b = await readJson(req);
        return audit.acceptMirror(b.node, b.entries);
      }),
      { mutating: true }
    )
  );
  r.get('/api/audit/ship', guard(J(() => (ctx.shipper ? ctx.shipper.status() : { enabled: false }))));
  r.post(
    '/api/audit/ship/now',
    guard(
      J(async (req) => {
        if (!ctx.shipper) throw Object.assign(new Error('Изнасянето не е включено'), { status: 400 });
        audit.log({ action: 'audit.shipNow', user: req.user });
        return { results: await ctx.shipper.shipAll() };
      }),
      { mutating: true }
    )
  );

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

  // Изнесено НАВЪН, защото десктопът се проксира ИЗВЪН рутера: пътят му е
  // `/desktop/…` (не `/api/…`), а WebSocket надграждането изобщо не минава през
  // обикновения път на заявките. И двете места трябва да питат СЪЩАТА функция
  // за автентикация — иначе рамката се превръща във втора врата без вход.
  r.authenticate = (req) => auth(req);
  return r;
}
