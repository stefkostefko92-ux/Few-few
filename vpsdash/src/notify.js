// Канали за известия — Telegram, ntfy, generic webhook, имейл (през sendmail).
// Нула зависимости: node:https за HTTP(S) POST, spawn за sendmail.
// Никога не праща тайни навън — само текста на алармата.
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

const SEV_EMOJI = { critical: '🔴', warning: '🟠', info: '🔵', ok: '🟢' };

// Праг по канал: телефонът да звъни само за критичното, имейлът да носи всичко.
// Без него единственият избор е „всичко или нищо" — и човек изключва канала.
const SEV_RANK = { ok: 1, info: 1, warning: 2, critical: 3 };

// „Възстановено" носи тежест `ok` (ранг 1). Канал с праг „critical" иначе би
// получил алармата, но НЕ и нейното вдигане — най-лошата възможна комбинация.
// Затова прагът се мери спрямо ПО-ТЕЖКОТО от текущата и предишната тежест.
export function passesSeverity(alert, minSeverity) {
  // Дайджестът е ИЗРИЧНО поискан (с включването си) и няма тежест — прагът по
  // канал е за инциденти, не за седмичния пулс.
  if (alert.force) return true;
  const min = SEV_RANK[String(minSeverity || '').toLowerCase()];
  if (!min) return true; // непознат/празен праг = без филтър
  const rank = Math.max(SEV_RANK[alert.severity] || 1, SEV_RANK[alert.wasSeverity] || 1);
  return rank >= min;
}

function post(url, { headers = {}, body, timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      resolve({ ok: false, error: 'невалиден URL' });
      return;
    }
    const reqFn = u.protocol === 'https:' ? httpsRequest : httpRequest;
    const payload = Buffer.from(body ?? '', 'utf8');
    const req = reqFn(
      u,
      {
        method: 'POST',
        timeout,
        headers: { 'content-length': payload.length, ...headers },
      },
      (res) => {
        res.resume();
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.end(payload);
  });
}

async function sendTelegram(cfg, alert) {
  const { botToken, chatId, minSeverity } = cfg.notify?.telegram || {};
  if (!botToken || !chatId) return null;
  if (!passesSeverity(alert, minSeverity)) return { channel: 'telegram', ok: true, skipped: 'под прага' };
  const text = `${SEV_EMOJI[alert.severity] || ''} <b>${escapeHtml(alert.title)}</b>\n${escapeHtml(
    alert.body
  )}\n\n<i>${escapeHtml(cfg.nodeName)}</i>`;
  const r = await post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
  return { channel: 'telegram', ...r };
}

async function sendNtfy(cfg, alert) {
  const { server = 'https://ntfy.sh', topic, token, minSeverity } = cfg.notify?.ntfy || {};
  if (!topic) return null;
  if (!passesSeverity(alert, minSeverity)) return { channel: 'ntfy', ok: true, skipped: 'под прага' };
  const headers = {
    'content-type': 'text/plain; charset=utf-8',
    Title: encodeHeader(`${alert.title} · ${cfg.nodeName}`),
    Priority: alert.severity === 'critical' ? 'high' : alert.severity === 'warning' ? 'default' : 'low',
    Tags: alert.severity === 'ok' ? 'white_check_mark' : 'warning',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await post(`${String(server).replace(/\/$/, '')}/${encodeURIComponent(topic)}`, {
    headers,
    body: alert.body,
  });
  return { channel: 'ntfy', ...r };
}

async function sendWebhook(cfg, alert) {
  const url = cfg.notify?.webhook?.url;
  if (!url) return null;
  if (!passesSeverity(alert, cfg.notify?.webhook?.minSeverity)) return { channel: 'webhook', ok: true, skipped: 'под прага' };
  const r = await post(url, {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      node: cfg.nodeId,
      nodeName: cfg.nodeName,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      rule: alert.rule,
      ts: new Date().toISOString(),
    }),
  });
  return { channel: 'webhook', ...r };
}

// Имейл без SMTP библиотека: подаваме готово писмо на локалния sendmail.
// Няма sendmail → каналът просто мълчи (fail-closed, без да чупи алармата).
function sendEmail(cfg, alert) {
  const { to, from, minSeverity } = cfg.notify?.email || {};
  if (!to) return Promise.resolve(null);
  if (!passesSeverity(alert, minSeverity)) return Promise.resolve({ channel: 'email', ok: true, skipped: 'под прага' });
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('/usr/sbin/sendmail', ['-t', '-i'], { stdio: ['pipe', 'ignore', 'ignore'] });
    } catch {
      resolve({ channel: 'email', ok: false, error: 'няма sendmail' });
      return;
    }
    child.on('error', () => resolve({ channel: 'email', ok: false, error: 'няма sendmail' }));
    child.on('close', (code) => resolve({ channel: 'email', ok: code === 0, status: code }));
    const subject = `[${cfg.nodeName}] ${alert.title}`;
    child.stdin.end(
      `To: ${to}\nFrom: ${from || 'vps-dashboard@localhost'}\n` +
        `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=\n` +
        `Content-Type: text/plain; charset=utf-8\n\n${alert.body}\n`
    );
  });
}

// Праща по ВСИЧКИ конфигурирани канали. Никога не хвърля — връща резултатите.
export async function notify(cfg, alert) {
  // `detail` носи СУРОВИЯ изход на чужд инструмент (systemd, openssl). Държи се
  // отделно от `body`, за да остане изречението стабилно и преводимо — но в
  // известието трябва да ГО ИМА: „проверката е сляпа" без причината праща човека
  // да я търси на сляпо. Затова каналите виждат едно тяло, слепено тук веднъж.
  if (alert?.detail) alert = { ...alert, body: `${alert.body}\n\n${alert.detail}` };
  const results = await Promise.all([
    sendTelegram(cfg, alert).catch((e) => ({ channel: 'telegram', ok: false, error: e.message })),
    sendNtfy(cfg, alert).catch((e) => ({ channel: 'ntfy', ok: false, error: e.message })),
    sendWebhook(cfg, alert).catch((e) => ({ channel: 'webhook', ok: false, error: e.message })),
    sendEmail(cfg, alert).catch((e) => ({ channel: 'email', ok: false, error: e.message })),
  ]);
  return results.filter(Boolean);
}

export function configuredChannels(cfg) {
  const n = cfg.notify || {};
  return {
    telegram: Boolean(n.telegram?.botToken && n.telegram?.chatId),
    ntfy: Boolean(n.ntfy?.topic),
    webhook: Boolean(n.webhook?.url),
    email: Boolean(n.email?.to),
  };
}

// ── Мъртвецът-ключ (dead man's switch) ───────────────────────────────────────
// Най-тихият възможен провал: НЕ „сървърът падна", а „наблюдателят замлъкна".
// Спрял процес, увиснало `evaluate()`, изтрит таймер — панелът не праща нищо и
// точно това изглежда като „всичко е наред". Никоя вътрешна проверка не хваща
// собствената си смърт, затова сигналът трябва да излиза НАВЪН: външна услуга
// (healthchecks.io, Uptime Kuma, cron-monitor на другия VPS) чака пинг по
// каданс и вдига тревога, когато пингът СПРЕ.
//
// Обратната логика е целта: тук успехът мълчи, а мълчанието е алармата.
export async function heartbeat(cfg, { ok = true } = {}) {
  const url = cfg.alerts?.heartbeatUrl;
  if (!url) return null;
  return post(ok ? url : failUrl(url), { body: '', timeout: 8000 });
}

// Провалена оценка пинга „/fail" (конвенцията на healthchecks.io) — така
// външният наблюдател различава „жив, но сляп" от „мъртъв".
//
// Строи се през `URL`, не с лепене на низове. Наивното `url + '/fail'` работи за
// healthchecks.io и се ЧУПИ ОБЪРНАТО за Uptime Kuma push, който сме препоръчали
// в собствения си коментар: `…/api/push/TOKEN?status=up&msg=OK` става
// `…?status=up&msg=OK/fail` → Kuma чете `status=up` и записва УСПЕХ. Сигналът
// „жив, но сляп" тихо се превръща в „всичко е наред" — точно обратното на целта.
export function failUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return String(raw);
  }
  u.pathname = `${u.pathname.replace(/\/$/, '')}/fail`;
  return u.toString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

// HTTP хедърите са latin-1: кирилицата в заглавието се кодира по RFC 2047.
function encodeHeader(s) {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
