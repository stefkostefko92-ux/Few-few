// Канали за известия — Telegram, ntfy, generic webhook, имейл (през sendmail).
// Нула зависимости: node:https за HTTP(S) POST, spawn за sendmail.
// Никога не праща тайни навън — само текста на алармата.
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';

const SEV_EMOJI = { critical: '🔴', warning: '🟠', info: '🔵', ok: '🟢' };

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
  const { botToken, chatId } = cfg.notify?.telegram || {};
  if (!botToken || !chatId) return null;
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
  const { server = 'https://ntfy.sh', topic, token } = cfg.notify?.ntfy || {};
  if (!topic) return null;
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
  const { to, from } = cfg.notify?.email || {};
  if (!to) return Promise.resolve(null);
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

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

// HTTP хедърите са latin-1: кирилицата в заглавието се кодира по RFC 2047.
function encodeHeader(s) {
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`;
}
