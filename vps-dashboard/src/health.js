// Три проверки, които не се вписват никъде другаде, но са точно тези, които
// събарят продукция тихо.
//
//  1. **Услуга в рестарт-цикъл.** systemd я показва като „active" — защото тя
//     наистина е активна, за трети път през последната минута. Единственият
//     видим белег е `NRestarts`, който расте. Услуга, която се вдига и пада на
//     всеки 10 секунди, е ПО-ЛОША от спряна: изглежда жива и не вдига „failed".
//  2. **Изтичащ ДОМЕЙН.** Следим сертификата (14 дни предупреждение), но
//     сертификатът е безполезен, ако регистрацията падне. Домейн изтича по-тихо
//     и се възстановява много по-скъпо. Четем RDAP — HTTP+JSON стандартът,
//     заменил whois; нула зависимости, нула парсване на свободен текст.
//  3. **Липсващи заглавки за сигурност.** Проверява се това, което браузърът
//     реално получава, не какво пише в конфига — двете се разминават при
//     прокси, кеш или забравен `add_header` в друг блок.
import https from 'node:https';
import http from 'node:http';
import { run } from './exec.js';
import { assertUnit, parseShowKv } from './services.js';

// ── 1. Рестарт-цикъл ─────────────────────────────────────────────────────────
export async function restartCounts(units = []) {
  const out = [];
  for (const unit of units.slice(0, 200)) {
    let u;
    try {
      u = assertUnit(unit);
    } catch {
      continue;
    }
    const r = await run('systemctl', ['show', u, '-p', 'NRestarts', '-p', 'ActiveState', '-p', 'SubState'], { timeout: 6000 });
    if (!r.ok) continue;
    const kv = parseShowKv(r.stdout);
    const n = Number(kv.NRestarts);
    out.push({ unit: u, restarts: Number.isFinite(n) ? n : 0, activeState: kv.ActiveState || null, subState: kv.SubState || null });
  }
  return out;
}

// Сравнява с предишната снимка. „Ново" е РАЗЛИКАТА — общият брой расте вечно и
// казва само че услугата някога е падала.
export function detectFlapping(prev, now, { threshold = 3 } = {}) {
  const before = new Map((prev || []).map((s) => [s.unit, s.restarts]));
  const out = [];
  for (const s of now) {
    const was = before.get(s.unit);
    if (was == null) continue; // първа снимка — няма с какво да се сравни
    const delta = s.restarts - was;
    if (delta >= threshold) out.push({ unit: s.unit, delta, total: s.restarts, subState: s.subState });
  }
  return out.sort((a, b) => b.delta - a.delta);
}

// ── 2. Изтичане на домейн (RDAP) ─────────────────────────────────────────────
const RDAP_TIMEOUT = 8000;

function getJson(url, { timeoutMs = RDAP_TIMEOUT, redirects = 3 } = {}) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return resolve({ ok: false, error: 'невалиден URL' });
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      u,
      { method: 'GET', timeout: timeoutMs, headers: { accept: 'application/rdap+json, application/json', 'user-agent': 'carbon-stealth-vps-dashboard' } },
      (res) => {
        // RDAP често пренасочва към регистъра на съответната зона.
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
          res.resume();
          return resolve(getJson(new URL(res.headers.location, u).toString(), { timeoutMs, redirects: redirects - 1 }));
        }
        let body = '';
        res.on('data', (c) => {
          if (body.length < 512 * 1024) body += c;
        });
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve({ ok: false, error: `HTTP ${res.statusCode}`, status: res.statusCode });
          try {
            resolve({ ok: true, data: JSON.parse(body) });
          } catch {
            resolve({ ok: false, error: 'нечетим RDAP отговор' });
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'изтече времето' });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

export function pickEvent(events, action) {
  for (const e of events || []) {
    if (String(e.eventAction || '').toLowerCase() === action) return e.eventDate || null;
  }
  return null;
}

// Регистрацията се проверява за РЕГИСТРИРУЕМИЯ домейн: RDAP не отговаря за
// поддомейн (`vps1.example.com` → питаме за `example.com`).
export function registrableDomain(d) {
  const parts = String(d || '').toLowerCase().replace(/^\*\./, '').split('.').filter(Boolean);
  if (parts.length <= 2) return parts.join('.');
  // Двусъставните зони (co.uk, com.br…) иначе биха дали „uk" вместо домейна.
  const twoLevel = /^(co|com|org|net|gov|edu|ac|or|ne|in|go)\.[a-z]{2}$/;
  const lastTwo = parts.slice(-2).join('.');
  return twoLevel.test(lastTwo) ? parts.slice(-3).join('.') : lastTwo;
}

export async function domainExpiry(domain) {
  const name = registrableDomain(domain);
  if (!name || !name.includes('.')) return { domain, error: 'непознат домейн' };
  const r = await getJson(`https://rdap.org/domain/${encodeURIComponent(name)}`);
  if (!r.ok) return { domain: name, available: false, error: r.error };
  const expires = pickEvent(r.data?.events, 'expiration');
  const registered = pickEvent(r.data?.events, 'registration');
  const at = expires ? new Date(expires) : null;
  return {
    domain: name,
    available: true,
    expiresAt: at && !Number.isNaN(at.getTime()) ? at.toISOString() : null,
    registeredAt: registered || null,
    daysLeft: at && !Number.isNaN(at.getTime()) ? Math.floor((at.getTime() - Date.now()) / 86400000) : null,
    status: Array.isArray(r.data?.status) ? r.data.status.slice(0, 8) : [],
    // „clientHold"/„serverHold" значи, че домейнът вече НЕ резолвва.
    onHold: (r.data?.status || []).some((s) => /hold/i.test(String(s))),
  };
}

// ── 3. Заглавки за сигурност ─────────────────────────────────────────────────
// Проверява се това, което браузърът получава — не какво пише в конфига.
const HEADER_CHECKS = [
  {
    id: 'hsts',
    header: 'strict-transport-security',
    severity: 'high',
    title: 'Липсва HSTS',
    why: 'Без него първата заявка по http е отворена за прихващане, дори сайтът да пренасочва.',
    fix: "add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;",
    httpsOnly: true,
  },
  {
    id: 'nosniff',
    header: 'x-content-type-options',
    severity: 'medium',
    title: 'Липсва X-Content-Type-Options',
    why: 'Браузърът може да „познае" типа и да изпълни качен файл като скрипт.',
    fix: 'add_header X-Content-Type-Options "nosniff" always;',
  },
  {
    id: 'frame',
    header: 'content-security-policy',
    alt: 'x-frame-options',
    severity: 'medium',
    title: 'Няма защита от вграждане в iframe',
    why: 'Без frame-ancestors/X-Frame-Options сайтът може да се вгради и да се кликне вместо потребителя (clickjacking).',
    fix: "add_header Content-Security-Policy \"frame-ancestors 'self'\" always;  (или X-Frame-Options: DENY)",
  },
  {
    id: 'referrer',
    header: 'referrer-policy',
    severity: 'low',
    title: 'Липсва Referrer-Policy',
    why: 'Пълният адрес (с параметри) изтича към чужди сайтове при клик навън.',
    fix: 'add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
  },
];

export function evaluateHeaders(headers, { https: isHttps = true } = {}) {
  const h = {};
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v);
  const findings = [];
  for (const c of HEADER_CHECKS) {
    if (c.httpsOnly && !isHttps) continue;
    const present = h[c.header] || (c.alt ? h[c.alt] : null);
    // CSP без frame-ancestors не върши работата на X-Frame-Options.
    const satisfied = c.id === 'frame'
      ? (h['content-security-policy'] || '').includes('frame-ancestors') || Boolean(h['x-frame-options'])
      : Boolean(present);
    if (!satisfied) findings.push({ id: c.id, severity: c.severity, title: c.title, why: c.why, fix: c.fix });
  }
  // Версията на сървъра улеснява подбора на експлойт — дребно, но безплатно.
  if (/\d/.test(h.server || '')) {
    findings.push({
      id: 'server-token',
      severity: 'low',
      title: `Сървърът се представя с версия (${h.server})`,
      why: 'Точната версия улеснява подбора на готов експлойт.',
      fix: 'nginx: server_tokens off;',
    });
  }
  return { headers: h, findings, score: Math.max(0, 100 - findings.reduce((s, f) => s + ({ high: 25, medium: 12, low: 4 })[f.severity], 0)) };
}

export function fetchHeaders(url, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return resolve({ ok: false, error: 'невалиден URL' });
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'HEAD', timeout: timeoutMs, headers: { 'user-agent': 'carbon-stealth-vps-dashboard' } }, (res) => {
      res.resume();
      resolve({ ok: true, status: res.statusCode, headers: res.headers, https: u.protocol === 'https:' });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'изтече времето' });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

export async function checkSiteHeaders(url) {
  const r = await fetchHeaders(url);
  if (!r.ok) return { url, ok: false, error: r.error };
  const evaluated = evaluateHeaders(r.headers, { https: r.https });
  return { url, ok: true, status: r.status, ...evaluated };
}
