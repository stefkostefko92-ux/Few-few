// Аналитика на journald: инкрементално четене, отпечатъци на съобщенията и
// скорост на грешките по unit.
//
// Защо отпечатъци: 4200 реда „connection refused to 10.0.0.7:5432" са ЕДНА
// грешка, повторена 4200 пъти. Групирането по шаблон превръща стената от текст в
// „5 различни грешки, най-честата 4200 пъти" — и прави възможен най-полезния
// сигнал след деплой: „това е НОВА грешка, не се е случвала преди".
//
// ВЕТО за PII/тайни: journald съдържа произволен текст от приложенията (и от
// интернет — sshd записва „Invalid user <какво напише атакуващият>"). Затова
// маскирането тук е и редактор на чувствителното: нищо сурово не тръгва към
// известие. Отпечатъкът е хеш → не изтича съдържание.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.js';

// Редът на замените има значение: първо тайните, после общите шаблони.
const MASKS = [
  [/\bBearer\s+[\w.\-+/=]+/gi, 'Bearer «скрито»'],
  [/\b(password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=«скрито»'],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/g, '«jwt»'], // JSON Web Token
  [/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, '«имейл»'],
  [/\b[0-9a-f]{32,}\b/gi, '«хеш»'],
  [/\b\d{1,3}(\.\d{1,3}){3}\b/g, '«ip»'],
  [/\b[0-9a-f]{4}(:[0-9a-f]{0,4}){2,7}\b/gi, '«ipv6»'],
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '«uuid»'],
  [/\/[\w./-]*\/[\w.-]+/g, '«път»'],
  [/\b\d+\b/g, '«n»'],
];

export function maskMessage(msg) {
  let out = String(msg || '');
  for (const [rx, rep] of MASKS) out = out.replace(rx, rep);
  return out.trim().slice(0, 300);
}

export function fingerprint(msg) {
  return crypto.createHash('sha256').update(maskMessage(msg)).digest('base64url').slice(0, 16);
}

export class LogMiner {
  constructor(stateDir) {
    this.stateFile = path.join(stateDir, 'logmine.json');
    this.state = this.load();
  }

  load() {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    } catch {
      return { cursor: null, seen: {}, lastRun: 0 };
    }
  }

  save() {
    try {
      // `seen` расте — пазим само отпечатъци, виждани в последните 14 дни.
      const cutoff = Date.now() - 14 * 86400000;
      for (const [fp, meta] of Object.entries(this.state.seen)) {
        if (meta.last < cutoff) delete this.state.seen[fp];
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* best-effort */
    }
  }

  // Чете САМО новото след курсора — точен брой без препокриване и без да
  // прехвърляме целия журнал всеки път.
  // `persist: false` е за ЧЕТЕНЕ ОТ ЧОВЕК: не мести курсора и не маркира
  // отпечатъците като видени. Без това отварянето на секцията в браузъра
  // консумира курсора и следващата проверка вече не обявява грешките за НОВИ —
  // точно по време на инцидент, когато човек рефрешва най-често.
  async collect({ priority = 4, limit = 2000, persist = true, sinceMin = null } = {}) {
    const args = ['-o', 'json', '--no-pager', '-p', String(priority), '--show-cursor', '-n', String(limit)];
    if (!persist) {
      // Четенето от човек гледа ФИКСИРАН прозорец назад — иначе показва „каквото
      // се е случило, откакто гледах последно", което е безполезно за въпроса
      // „какво стана през последния час".
      const mins = Math.min(1440, Math.max(5, Number(sinceMin) || 60));
      args.push('--since', `-${mins}min`);
    } else if (this.state.cursor) {
      args.push(`--after-cursor=${this.state.cursor}`);
    } else {
      args.push('--since', '-1h'); // първо пускане: последният час, не всичко
    }

    const r = await run('journalctl', args, { timeout: 25000, maxBuffer: 32 * 1024 * 1024 });
    if (!r.ok) return { available: false, error: (r.stderr || '').trim().slice(0, 200), groups: [] };

    const groups = new Map();
    let newCursor = this.state.cursor;
    let lines = 0;

    for (const line of r.stdout.split('\n')) {
      if (!line.trim()) continue;
      if (line.startsWith('-- cursor:')) {
        newCursor = line.replace('-- cursor:', '').trim();
        continue;
      }
      let rec;
      try {
        rec = JSON.parse(line);
      } catch {
        continue;
      }
      lines++;
      if (rec.__CURSOR) newCursor = rec.__CURSOR;
      const unit = rec._SYSTEMD_UNIT || rec.SYSLOG_IDENTIFIER || '(без unit)';
      const msg = typeof rec.MESSAGE === 'string' ? rec.MESSAGE : Array.isArray(rec.MESSAGE) ? String.fromCharCode(...rec.MESSAGE) : '';
      if (!msg) continue;
      const fp = fingerprint(msg);
      const key = `${unit}|${fp}`;
      const g = groups.get(key) || {
        unit,
        fingerprint: fp,
        pattern: maskMessage(msg),
        count: 0,
        priority: Number(rec.PRIORITY ?? 6),
        firstTs: Number(rec.__REALTIME_TIMESTAMP || 0) / 1000,
        lastTs: 0,
      };
      g.count++;
      g.lastTs = Number(rec.__REALTIME_TIMESTAMP || 0) / 1000;
      g.priority = Math.min(g.priority, Number(rec.PRIORITY ?? 6));
      groups.set(key, g);
    }

    // Кое е НОВО: отпечатък, невиждан досега. Това е най-полезният сигнал след
    // деплой — „тази грешка не се е случвала преди".
    const now = Date.now();
    const out = [];
    for (const g of groups.values()) {
      const known = this.state.seen[g.fingerprint];
      g.isNew = !known;
      g.firstSeenEver = known ? known.first : now;
      out.push(g);
      // Само алармения път записва „видяно". Иначе човек, който погледне,
      // отнема на алармата единствения ѝ признак за новост.
      if (persist) this.state.seen[g.fingerprint] = { first: known ? known.first : now, last: now };
    }
    if (persist) {
      this.state.cursor = newCursor;
      this.state.lastRun = now;
      this.save();
    }

    return {
      available: true,
      persisted: persist,
      windowMin: persist ? null : Math.min(1440, Math.max(5, Number(sinceMin) || 60)),
      scannedLines: lines,
      groups: out.sort((a, b) => b.count - a.count),
      newCount: out.filter((g) => g.isNew).length,
    };
  }

  // Скорост на грешките по unit за прозорец (редове/минута).
  static ratesByUnit(groups, windowMinutes) {
    const byUnit = new Map();
    for (const g of groups) {
      if (g.priority > 3) continue; // само error и по-лошо
      const cur = byUnit.get(g.unit) || { unit: g.unit, errors: 0, distinct: 0, newest: 0 };
      cur.errors += g.count;
      cur.distinct++;
      cur.newest = Math.max(cur.newest, g.lastTs);
      byUnit.set(g.unit, cur);
    }
    return [...byUnit.values()]
      .map((u) => ({ ...u, perMinute: windowMinutes ? u.errors / windowMinutes : null }))
      .sort((a, b) => b.errors - a.errors);
  }
}
