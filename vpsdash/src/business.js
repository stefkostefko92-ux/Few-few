// Петъчният отчет — „Бизнесът тази седмица".
//
// Собственикът (27.11.2026): „всеки петък — числата". Отчетът е отделно
// съобщение от машинния дайджест (той е за здравето на сървъра) и тръгва по
// същите канали (Telegram/имейл) в петък 17:00 по софийско време.
//
// Правилата:
//  · Само ЧИСЛА — отчетът напуска сървъра. Продуктите дават сборове през своя
//    `/internal/weekly` на 127.0.0.1 (Фактурист: src/stats/weekly.ts), никога имена.
//  · Източник, който не отговори, се КАЗВА с причината — тишината не е „нула".
//  · Адресът е само локален (127.0.0.1/::1): токенът не тръгва никъде навън.
//  · Парите са цели центове до последния знак; форматът е български.
//  · Съставянето е ЧИСТА функция — тестваема без мрежа и без система.
import fs from 'node:fs';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { plural } from './text.js';

const SYMBOL = { EUR: '€', BGN: 'лв.', USD: '$' };

// Графикът (DigestSchedule): петък 17:00 по софийско време, свой файл и ключ
// (`alerts.business` — enabled/weekday/hour); без нито един източник — изключен.
export const BUSINESS_SCHEDULE = Object.freeze({
  file: 'business.json',
  key: 'business',
  weekday: 5,
  hour: 17,
  tz: 'Europe/Sofia',
  requires: (cfg) => Array.isArray(cfg?.business?.sources) && cfg.business.sources.length > 0,
});
const MAX_BODY = 256 * 1024;
const DAY_MS = 24 * 3600000;

/** Цели центове → „1 234,56 €" (без float до последния знак). */
export function fmtMoney(cents, currency) {
  const n = Math.trunc(Number(cents) || 0);
  const abs = Math.abs(n);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '−' : ''}${whole},${String(abs % 100).padStart(2, '0')} ${SYMBOL[currency] || currency}`;
}

const moneyList = (cents) => {
  const parts = Object.entries(cents || {})
    .filter(([, v]) => v)
    .map(([c, v]) => fmtMoney(v, c));
  return parts.length ? parts.join(' + ') : fmtMoney(0, 'EUR');
};
const ddmm = (iso) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[2]}.${m[1]}` : '?';
};

// ── Съставянето ──────────────────────────────────────────────────
export function composeBusiness(d) {
  const sources = d.sources || [];
  const win = sources.find((s) => s.ok && s.data?.window)?.data.window;
  const range = win
    ? `${ddmm(win.fromDay)}–${ddmm(win.toDay)}`
    : `${ddmm(new Date((d.now ?? Date.now()) - 6 * DAY_MS).toISOString())}–${ddmm(new Date(d.now ?? Date.now()).toISOString())}`;
  const lines = [`💼 Бизнесът тази седмица · ${range}`];

  if (!sources.length) {
    lines.push('ℹ Продукти: няма настроени източници — добави ги в config.json → business.sources (README, „Петъчен отчет").');
  }
  for (const s of sources) {
    if (!s.ok) lines.push(`❓ ${s.name}: недостъпен (${s.error})`);
    else if (s.data.app === 'fakturist') lines.push(...fakturistLines(s.name, s.data));
    else lines.push(`✅ ${s.name}: отговори (непознат формат „${s.data.app}")`);
  }

  const a = d.agents;
  if (!a) lines.push('🤖 Агентите: няма данни (usage.jsonl не е намерен в релийза).');
  else {
    const top = a.top?.[0];
    lines.push(
      `🤖 Агентите: ${plural(a.runs, 'пускане', 'пускания')} · ${fmtMoney(Math.round(a.usd * 100), 'USD')}` +
        (top ? ` · най-скъп ${top.agent} ${fmtMoney(Math.round(top.usd * 100), 'USD')}` : '') +
        (a.unpriced ? ` · без цена: ${a.unpriced}` : ''),
    );
  }

  const w = d.waiting;
  if (w) {
    lines.push(
      `📋 Чака теб: ${w.action} за действие от ${w.total}${w.urgent ? ` · 🔴 спешни ${w.urgent}` : ''}` +
        (w.top?.length ? ` — ${w.top.join('; ')}` : '') +
        ` · снимка от ${ddmm(w.generatedAt)}`,
    );
  }

  lines.push('— само числа; подробностите са в панелите на продуктите.');
  return lines.join('\n');
}

function fakturistLines(name, f) {
  const p = f.platform;
  const out = [
    `📈 ${name}: ${plural(p.organizations.new, 'нова фирма', 'нови фирми')} (общо ${p.organizations.total}) · ` +
      `платени абонаменти ${p.subscriptions.paid} (+${p.subscriptions.new} нови) · ` +
      `плащания ${p.payments.completed} за ${fmtMoney(p.payments.completedCents, 'EUR')}`,
    `   · издадени документи на платформата: ${p.documentsIssued} · напомняния: ${p.remindersSent}`,
  ];
  if (p.payments.pendingTransfers) out.push(`   ⚠ чакащи банкови преводи: ${p.payments.pendingTransfers} — потвърди ги в мастър панела`);
  if (p.subscriptions.pastDue) out.push(`   ⚠ абонаменти с просрочено плащане: ${p.subscriptions.pastDue}`);
  const b = f.supplier;
  if (b) {
    out.push(
      `   📒 Книгите: издадени ${b.issued.count} за ${moneyList(b.issued.cents)} · платени ${moneyList(b.paid.cents)}` +
        (b.creditNotes.count ? ` · кредитни известия ${b.creditNotes.count} за ${moneyList(b.creditNotes.cents)}` : ''),
    );
    out.push(b.overdue.count ? `   ⚠ просрочени ${b.overdue.count} за ${moneyList(b.overdue.cents)}` : '   ✅ просрочени: няма');
  }
  return out;
}

// ── Проверка на формата (лъжещ източник = „неверен отговор", не срив) ──
const isCount = (n) => Number.isSafeInteger(n) && n >= 0;
const isCents = (m) =>
  m && typeof m === 'object' && !Array.isArray(m) && Object.entries(m).every(([k, v]) => /^[A-Z]{3}$/.test(k) && Number.isSafeInteger(v));
const isMoney = (m) => m && isCount(m.count) && isCents(m.cents);

export function validFakturist(f) {
  const p = f?.platform;
  if (!p || typeof p !== 'object') return false;
  const ok =
    isCount(p.organizations?.total) && isCount(p.organizations?.new) &&
    ['paid', 'granted', 'pastDue', 'new'].every((k) => isCount(p.subscriptions?.[k])) &&
    isCount(p.payments?.completed) && isCount(p.payments?.completedCents) && isCount(p.payments?.pendingTransfers) &&
    isCount(p.documentsIssued) && isCount(p.remindersSent) &&
    /^\d{4}-\d{2}-\d{2}$/.test(f.window?.fromDay || '') && /^\d{4}-\d{2}-\d{2}$/.test(f.window?.toDay || '');
  if (!ok) return false;
  const b = f.supplier;
  return b === null || (isMoney(b?.issued) && isMoney(b?.creditNotes) && isCents(b?.paid?.cents) && isMoney(b?.overdue));
}

// ── Колекторът ───────────────────────────────────────────────────
const LOCAL = new Set(['127.0.0.1', '[::1]', '::1', 'localhost']);

function getJson(url, token, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const req = httpRequest(url, { method: 'GET', headers: { authorization: `Bearer ${token}`, accept: 'application/json' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return finish({ error: `HTTP ${res.statusCode}` });
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) {
          req.destroy();
          finish({ error: 'неверен отговор (твърде голям)' });
        } else chunks.push(c);
      });
      res.on('end', () => {
        try {
          finish({ data: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch {
          finish({ error: 'неверен отговор (не е JSON)' });
        }
      });
      res.on('error', () => finish({ error: 'прекъсната връзка' }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish({ error: `таймаут ${timeoutMs} ms` });
    });
    req.on('error', (e) => finish({ error: e.code === 'ECONNREFUSED' ? 'отказ на връзка' : String(e.code || 'мрежова грешка') }));
    req.end();
  });
}

async function collectOne(src, timeoutMs) {
  const name = String(src?.name || 'без име').slice(0, 40);
  let url;
  try {
    url = new URL(String(src?.url || ''));
  } catch {
    return { name, ok: false, error: 'грешен адрес' };
  }
  if (url.protocol !== 'http:' || !LOCAL.has(url.hostname)) {
    return { name, ok: false, error: 'адресът трябва да е само 127.0.0.1 (локален) — токенът не тръгва навън' };
  }
  let token = '';
  try {
    token = fs.readFileSync(String(src.tokenFile || ''), 'utf8').trim();
  } catch {
    /* по-долу */
  }
  if (!/^[\x21-\x7e]{16,256}$/.test(token)) return { name, ok: false, error: 'няма токен (tokenFile) или е невалиден' };
  const r = await getJson(url, token, timeoutMs);
  if (r.error) return { name, ok: false, error: r.error };
  const data = r.data;
  if (!data || typeof data !== 'object' || typeof data.app !== 'string') return { name, ok: false, error: 'неверен отговор (формат)' };
  if (data.app === 'fakturist' && !validFakturist(data)) return { name, ok: false, error: 'неверен отговор (формат)' };
  return { name, ok: true, data };
}

export async function collectBusiness(cfg, { timeoutMs = 5000 } = {}) {
  const sources = Array.isArray(cfg?.business?.sources) ? cfg.business.sources.slice(0, 20) : [];
  return Promise.all(sources.map((s) => collectOne(s, timeoutMs)));
}

// ── Агентите: разходът за седмицата (същата сметка като tools/lib/usage.mjs) ──
function priceOf(model, prices) {
  const m = String(model || '').replace(/^claude-/, '').replace(/-\d{8}$/, '');
  let best = null;
  for (const r of prices?.models || []) {
    if (m.startsWith(r.id) && !/^-?\d/.test(m.slice(r.id.length)) && (!best || r.id.length > best.id.length)) best = r;
  }
  return best;
}

function costOf(rec, prices) {
  const p = priceOf(rec.model, prices);
  if (!p) return null;
  const c = prices.cache || { read: 0.1, write: 1.25 };
  const readPrice = p.cacheRead ?? p.in * c.read;
  const w1h = Math.min(rec.cacheWrite1h || 0, rec.cacheWrite || 0);
  const cacheWrite = (((rec.cacheWrite || 0) - w1h) * c.write + w1h * (c.write1h ?? 2)) * p.in / 1e6;
  return ((rec.input || 0) * p.in) / 1e6 + ((rec.cacheRead || 0) * readPrice) / 1e6 + cacheWrite + ((rec.output || 0) * p.out) / 1e6;
}

// Дневникът е данни от диска: като cleanRecord в tools/lib/usage.mjs — низов id, броячите крайни и
// неотрицателни, иначе записът е вън (нечислово поле правеше сумата NaN).
const NUM_FIELDS = ['turns', 'input', 'cacheRead', 'cacheWrite', 'cacheWrite1h', 'output'];
function cleanRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) return null;
  for (const k of NUM_FIELDS) if (k in r && !(Number.isFinite(r[k]) && r[k] >= 0)) return null;
  for (const k of ['agent', 'model', 'ts']) if (k in r && typeof r[k] !== 'string') return null;
  return r;
}

// `ts` в дневника е минутен низ без зона (t0.slice(0, 16), UTC) — чете се като UTC, не като местно време.
const parseTs = (ts) => Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(ts) ? `${ts}Z` : ts);

export function agentsWeek(usageText, prices, now = Date.now()) {
  const from = now - 7 * DAY_MS;
  // Едно пускане може да има няколко реда (DoD куката го връща и то спира пак със същия транскрипт):
  // дедуп по id, по-новата версия на записа печели — точно като parseLedger.
  const byId = new Map();
  for (const line of String(usageText || '').split('\n')) {
    if (!line.trim()) continue;
    let r;
    try {
      r = cleanRecord(JSON.parse(line));
    } catch {
      continue;
    }
    if (!r) continue;
    const prev = byId.get(r.id);
    if (!prev || (r.v || 1) >= (prev.v || 1)) byId.set(r.id, r);
  }
  const byAgent = new Map();
  let runs = 0;
  let usd = 0;
  let unpriced = 0;
  for (const r of byId.values()) {
    if (r.eval) continue; // живите проби не са разход на работа
    const ts = parseTs(r.ts);
    if (!(ts >= from && ts <= now)) continue;
    runs++;
    const cost = costOf(r, prices);
    if (cost == null) {
      unpriced++;
      continue;
    }
    usd += cost;
    const agent = String(r.agent || '?').slice(0, 40);
    byAgent.set(agent, (byAgent.get(agent) || 0) + cost);
  }
  const top = [...byAgent.entries()].map(([agent, v]) => ({ agent, usd: v })).sort((x, y) => y.usd - x.usd).slice(0, 3);
  return { runs, usd, unpriced, top };
}

// ── „Чака теб" (agents-dashboard/waiting.js) ─────────────────────
export function waitingSummary(text) {
  const m = /^\s*window\.WAITING\s*=\s*([\s\S]*?);?\s*$/.exec(String(text || ''));
  if (!m) return null;
  let w;
  try {
    w = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!w || typeof w !== 'object' || !w.counts || !Array.isArray(w.items)) return null;
  const rank = { спешно: 0, действие: 1 };
  const top = w.items
    .filter((i) => i && i.level in rank)
    .sort((a, b) => rank[a.level] - rank[b.level])
    .slice(0, 3)
    .map((i) => `${String(i.ref || '').slice(0, 20)} ${String(i.title || '').slice(0, 60)}`.trim());
  return {
    total: Number(w.counts.total) || 0,
    urgent: Number(w.counts['спешно']) || 0,
    action: Number(w.counts['действие']) || 0,
    generatedAt: w.generatedAt || null,
    top,
  };
}

// ── Всичко заедно (за двигателя на алармите) ─────────────────────
const readMaybe = (file) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
};

export async function businessData(cfg, now = Date.now()) {
  // Релийзът на монорепото: агентите и „Чака теб" идват оттам (само данни — usage.jsonl, prices.json, waiting.js).
  const root = cfg?.business?.releaseDir || '/opt/few-few/current';
  const usage = readMaybe(path.join(root, 'tools/agents/evals/usage.jsonl'));
  const pricesText = readMaybe(path.join(root, 'tools/agents/prices.json'));
  let prices = null;
  try {
    prices = pricesText ? JSON.parse(pricesText) : null;
  } catch {
    prices = null;
  }
  const waitingText = readMaybe(path.join(root, 'agents-dashboard/waiting.js'));
  return {
    now,
    sources: await collectBusiness(cfg),
    agents: usage && prices ? agentsWeek(usage, prices, now) : null,
    waiting: waitingText ? waitingSummary(waitingText) : null,
  };
}
