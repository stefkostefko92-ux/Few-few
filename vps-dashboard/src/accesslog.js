// Анализ на access log-а на уеб сървъра — единственият източник за „кой адрес е
// бавен" и „кой връща грешки".
//
// Журналът (journald) казва какво се е оплакало приложението. Access log-ът казва
// какво е поискал СВЕТЪТ и колко е чакал. Без него „сайтът е бавен" остава без
// адрес.
//
// Три неща, които е лесно да се сбъркат и затова са направени изрично:
//
//  1. **Ротацията.** Четенето по отместване в байтове е бързо, но при logrotate
//     файлът се сменя и старото отместване сочи в средата на НОВИЯ файл → четеш
//     боклук или прескачаш ден. Затова курсорът пази inode + размер и разпознава
//     „това е друг файл" (нов inode) и „файлът се е смалил" (пресечен).
//  2. **Пътищата се нормализират.** `/order/8123` и `/order/9044` са ЕДИН адрес,
//     повторен два пъти. Без групиране топ-листата е шум от идентификатори.
//  3. **IP-тата са лични данни.** Показваме ги на живо (законен интерес —
//     сигурност), но НЕ ги записваме в състоянието на диска. Курсорът пази само
//     отмествания.
import fs from 'node:fs';
import path from 'node:path';

// Пътищата се разширяват с CSD_LOG_DIRS само за проверка извън сървър — на
// живо променливата е празна и списъкът е точно този.
const LOG_DIRS = ['/var/log/nginx', '/var/log/caddy', '/var/log/apache2',
  ...String(process.env.CSD_LOG_DIRS || '').split(':').filter(Boolean)];
const MAX_READ = 24 * 1024 * 1024; // таван на едно четене (~100k реда)

// Комбиниран формат + по избор „rt=<секунди>" в края, ако е добавен $request_time.
// nginx по подразбиране НЕ пише времето — интерфейсът казва как се включва.
const COMBINED =
  /^(\S+) \S+ (\S+) \[([^\]]+)\] "(\S+) ([^"]*?) (\S+)" (\d{3}) (\d+|-) "([^"]*)" "([^"]*)"(.*)$/;

export function parseLine(line) {
  const m = COMBINED.exec(line);
  if (!m) return null;
  const [, ip, user, ts, method, rawPath, proto, status, bytes, referer, ua, tail] = m;
  // $request_time идва като отделно поле; поддържаме и „rt=0.123", и гол брой
  // накрая (двата най-чести начина, по които хората го добавят).
  let requestTime = null;
  const rt = /(?:rt=|request_time=)([\d.]+)/.exec(tail) || /\s([\d]+\.[\d]{3})\s*$/.exec(tail);
  if (rt) {
    const v = Number(rt[1]);
    if (Number.isFinite(v) && v >= 0 && v < 3600) requestTime = v;
  }
  let upstreamTime = null;
  const ut = /(?:ut=|upstream_time=)([\d.]+)/.exec(tail);
  if (ut) {
    const v = Number(ut[1]);
    if (Number.isFinite(v)) upstreamTime = v;
  }
  return {
    ip,
    user: user === '-' ? null : user,
    ts: parseTs(ts),
    method,
    path: rawPath.split('?')[0],
    query: rawPath.includes('?'),
    proto,
    status: Number(status),
    bytes: bytes === '-' ? 0 : Number(bytes),
    referer: referer === '-' ? null : referer,
    ua,
    requestTime,
    upstreamTime,
  };
}

// „10/Oct/2000:13:55:36 +0200" — Date не го разбира сам.
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
export function parseTs(s) {
  const m = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const [, d, mon, y, hh, mm, ss, sign, oh, om] = m;
  if (MONTHS[mon] === undefined) return null;
  const utc = Date.UTC(Number(y), MONTHS[mon], Number(d), Number(hh), Number(mm), Number(ss));
  const offset = (Number(oh) * 60 + Number(om)) * 60000 * (sign === '-' ? -1 : 1);
  return utc - offset;
}

// Групиране по ФОРМА на адреса: идентификаторите стават «id», иначе топ-листата е
// хиляда пъти един и същ маршрут с различни числа.
export function normalizePath(p) {
  return String(p || '/')
    .slice(0, 300)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\/|$)/gi, '/«uuid»')
    .replace(/\/[0-9a-f]{24,}(?=\/|$)/gi, '/«хеш»')
    .replace(/\/\d+(?=\/|$)/g, '/«id»')
    .replace(/\/[^/]+\.(jpe?g|png|gif|webp|avif|svg|ico|css|js|woff2?|map)$/i, (m) => '/«файл»' + m.slice(m.lastIndexOf('.')))
    || '/';
}

// Ботовете изкривяват всяка статистика — отделят се, не се трият.
const BOT_RX = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headlesschrome|curl|wget|python-requests|go-http-client|scrapy|semrush|ahrefs|mj12|dotbot|petalbot|gptbot|claudebot|ccbot|perplexity/i;
export function isBot(ua) {
  return BOT_RX.test(String(ua || ''));
}

export function discoverLogs() {
  const out = [];
  for (const dir of LOG_DIRS) {
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      // Само живите: ротираните (.1, .gz) са минало и биха се брояли двойно.
      if (!/access.*\.log$/.test(name) || /\.\d+$|\.gz$/.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile()) out.push({ path: full, sizeBytes: st.size, mtime: st.mtime.toISOString() });
      } catch {
        /* без права — прескачаме */
      }
    }
  }
  return out.sort((a, b) => b.sizeBytes - a.sizeBytes);
}

export class AccessLogReader {
  constructor(stateDir) {
    this.stateFile = path.join(stateDir, 'accesslog.json');
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return { cursors: {} }; // път → { inode, offset }
    }
  }

  save() {
    try {
      // Нарочно НЕ пазим нищо от съдържанието — само отмествания. IP-тата и
      // адресите са лични данни; състоянието не е място за тях.
      fs.writeFileSync(this.stateFile, JSON.stringify({ cursors: this.state.cursors }), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }

  // Чете САМО новото от файла. Връща и решението си за ротацията, за да е видимо
  // защо понякога се чете отначало.
  // `persist: false` чете от края БЕЗ да мести курсора — за човешко гледане.
  readNew(file, { persist = true } = {}) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return { lines: [], rotated: false, error: 'няма достъп' };
    }
    // При четене за човек курсорът се игнорира: винаги последният прозорец.
    const cur = persist ? this.state.cursors[file] : null;
    let start = 0;
    let rotated = false;
    if (cur && cur.inode === st.ino) {
      if (st.size < cur.offset) {
        // Файлът се е смалил → пресечен на място (copytruncate). Четем отначало.
        rotated = true;
      } else {
        start = cur.offset;
      }
    } else if (cur) {
      rotated = true; // друг inode → logrotate е сменил файла
    }
    // Първо пускане: не гълтаме целия исторически лог, а последните MAX_READ.
    // `partial` е ВАЖЕН: когато сме скочили по средата на файла, първият ред е
    // отрязан и се хвърля. Когато сме продължили от курсора, отместването е
    // точна граница на ред — хвърлянето там изяжда истински запис при ВСЯКО
    // следващо четене.
    let partial = false;
    if (!cur || rotated) {
      const jump = Math.max(0, st.size - MAX_READ);
      if (jump > 0) {
        start = jump;
        partial = true;
      } else {
        start = 0;
      }
    } else if (st.size - start > MAX_READ) {
      start = st.size - MAX_READ;
      partial = true;
    }

    let text = '';
    try {
      const fd = fs.openSync(file, 'r');
      try {
        const len = st.size - start;
        const buf = Buffer.alloc(Math.max(0, len));
        if (len > 0) fs.readSync(fd, buf, 0, len, start);
        text = buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      return { lines: [], rotated, error: err.message };
    }
    if (persist) this.state.cursors[file] = { inode: st.ino, offset: st.size };
    const lines = text.split('\n');
    if (partial && lines.length) lines.shift(); // отрязаният първи ред
    return { lines: lines.filter(Boolean), rotated, error: null };
  }

  // Пълният анализ: агрегати по адрес, статус, IP и бот.
  analyze({ files = null, limit = 25, persist = true, windowBytes = 4 * 1024 * 1024 } = {}) {
    const targets = files || discoverLogs().map((f) => f.path);
    if (!targets.length) {
      return { available: false, note: 'Не са намерени access log файлове (търсено в /var/log/nginx, /var/log/caddy, /var/log/apache2).' };
    }
    const byPath = new Map();
    const byStatus = new Map();
    const byIp = new Map();
    const errors = [];
    let total = 0;
    let bots = 0;
    let bytes = 0;
    let withTiming = 0;
    let unparsed = 0;
    let rotated = false;
    let oldest = null;
    let newest = null;

    for (const file of targets) {
      const r = this.readNew(file, { persist });
      if (r.rotated) rotated = true;
      for (const line of r.lines) {
        const rec = parseLine(line);
        if (!rec) {
          unparsed++;
          continue;
        }
        total++;
        bytes += rec.bytes;
        if (rec.ts) {
          if (!oldest || rec.ts < oldest) oldest = rec.ts;
          if (!newest || rec.ts > newest) newest = rec.ts;
        }
        const bot = isBot(rec.ua);
        if (bot) bots++;
        if (rec.requestTime != null) withTiming++;

        const key = `${rec.method} ${normalizePath(rec.path)}`;
        const g = byPath.get(key) || { key, method: rec.method, path: normalizePath(rec.path), count: 0, bot: 0, bytes: 0, times: [], upTimes: [], waits: [], statuses: {}, errors: 0 };
        g.count++;
        g.bytes += rec.bytes;
        if (bot) g.bot++;
        if (rec.requestTime != null && g.times.length < 5000) g.times.push(rec.requestTime);
        // Разделяне на вината: `$request_time` е ЦЯЛОТО време, което nginx е
        // видял (вкл. четене от бавен клиент, TLS ръкостискане, чакане на
        // свободен worker). `$upstream_response_time` е само приложението.
        // Разликата е „nginx/мрежата", а не „приложението" — без нея всеки
        // бавен адрес изглежда като бавен код и оптимизираш грешното нещо.
        if (rec.upstreamTime != null && rec.upstreamTime >= 0) {
          if (g.upTimes.length < 5000) g.upTimes.push(rec.upstreamTime);
          if (rec.requestTime != null && g.waits.length < 5000) {
            g.waits.push(Math.max(0, rec.requestTime - rec.upstreamTime));
          }
        }
        g.statuses[rec.status] = (g.statuses[rec.status] || 0) + 1;
        if (rec.status >= 400) g.errors++;
        byPath.set(key, g);

        const cls = `${Math.floor(rec.status / 100)}xx`;
        byStatus.set(cls, (byStatus.get(cls) || 0) + 1);

        // IP-тата се броят В ПАМЕТТА и не напускат тази функция записани на диск.
        const ipRec = byIp.get(rec.ip) || { ip: rec.ip, count: 0, errors: 0, bot };
        ipRec.count++;
        if (rec.status >= 400) ipRec.errors++;
        byIp.set(rec.ip, ipRec);

        if (rec.status >= 500) {
          if (errors.length < 200) errors.push({ ts: rec.ts, status: rec.status, path: rec.path.slice(0, 200), method: rec.method });
        }
      }
    }
    if (persist) this.save();

    const paths = [...byPath.values()].map((g) => {
      const times = g.times.sort((a, b) => a - b);
      const upTimes = g.upTimes.sort((a, b) => a - b);
      const waits = g.waits.sort((a, b) => a - b);
      const p95 = pct(times, 0.95);
      const p95Up = pct(upTimes, 0.95);
      const p95Wait = pct(waits, 0.95);
      return {
        method: g.method,
        path: g.path,
        count: g.count,
        botPct: g.count ? Math.round((g.bot / g.count) * 1000) / 10 : 0,
        errorPct: g.count ? Math.round((g.errors / g.count) * 1000) / 10 : 0,
        bytes: g.bytes,
        p50: pct(times, 0.5),
        p95,
        p95Upstream: p95Up,
        p95Wait,
        // Присъдата се дава само когато и двете числа ги има И разликата е
        // смислена — „51% приложение" при 12 ms общо време е шум, не находка.
        blame: blameOf(p95, p95Up, p95Wait),
        max: times.length ? times[times.length - 1] : null,
        statuses: g.statuses,
      };
    });

    return {
      available: true,
      persisted: persist,
      files: targets,
      rotated,
      total,
      unparsed,
      bots,
      botPct: total ? Math.round((bots / total) * 1000) / 10 : 0,
      bytes,
      hasTiming: withTiming > 0,
      // Без $request_time половината полза липсва — казваме точно как се включва.
      timingHint: withTiming > 0
        ? null
        : 'Логът няма време за заявка. Добави в nginx: log_format timed \'$remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent" rt=$request_time ut=$upstream_response_time\'; и access_log /var/log/nginx/access.log timed;',
      window: { from: oldest, to: newest },
      byStatus: Object.fromEntries(byStatus),
      topByCount: [...paths].sort((a, b) => b.count - a.count).slice(0, limit),
      // Бавното се подрежда по p95, не по средно: средното крие опашката, а
      // потребителят усеща точно нея.
      topBySlow: [...paths].filter((p) => p.p95 != null).sort((a, b) => b.p95 - a.p95).slice(0, limit),
      topByErrors: [...paths].filter((p) => p.errorPct > 0).sort((a, b) => b.errorPct - a.errorPct || b.count - a.count).slice(0, limit),
      topIps: [...byIp.values()].sort((a, b) => b.count - a.count).slice(0, limit),
      serverErrors: errors.slice(-50).reverse(),
    };
  }
}

// Кой бави: приложението (upstream) или всичко останало (nginx, TLS, бавен
// клиент, липсващ worker). Мълчи под 200 ms — там разликата е измервателен шум.
export function blameOf(p95, p95Upstream, p95Wait) {
  if (p95 == null || p95Upstream == null || p95Wait == null) return null;
  if (p95 < 0.2) return null;
  const share = p95 > 0 ? p95Upstream / p95 : 0;
  if (share >= 0.8) return 'приложение';
  if (share <= 0.5) return 'nginx/мрежа';
  return 'смесено';
}

function pct(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
  return Math.round(sorted[i] * 1000) / 1000;
}
