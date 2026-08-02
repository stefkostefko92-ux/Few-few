// Тихите пазачи — двата сигнала, които панелът ПОКАЗВАШЕ, но не пазеше.
//
//  1. **Дрейф на /etc.** Отпечатъкът имаше бутон „Провери отново" — а никой не
//     го натиска в 3 сутринта. Проверка, която чака човек да се сети, изгубва
//     смисъла си: сега дрейфът се проверява по каданс и вдига аларма-СЪСТОЯНИЕ
//     (стои, докато промяната не бъде приета с нов отпечатък).
//  2. **Нов SSH вход.** „Последни входове" се показваха — но успешен вход, който
//     НЕ си ти, е точно сигналът, за който минутите значат нещо. Нов вход от
//     ПОЗНАТ адрес е info (дневник, не телефон); от НЕПОЗНАТ — warning.
//
// Доктрината за IP-тата важи и тук: на диска се пазят САМО хешове (sha256, първите
// 16 знака) — достатъчно за „виждан ли е", безполезно за възстановяване на адреса.
// Самият адрес се показва на живо в известието (законен интерес — сигурност),
// точно както прави анализът на access log-а.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { run } from './exec.js';
import { diffEtc, loadBaseline } from './posture.js';

const STATE = 'guardians.json';
const DAY_MS = 24 * 3600000;

export function ipHash(addr) {
  return crypto.createHash('sha256').update(String(addr)).digest('hex').slice(0, 16);
}

// „last --time-format iso" ред: user tty източник ISO-време …
// Прескачаме системните редове (reboot/shutdown/wtmp) и локалните конзоли без
// мрежов източник — интересува ни ВХОД ОТВЪН.
export function parseLast(text) {
  const out = [];
  for (const line of String(text || '').split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 4) continue;
    const [user, tty, source, ts] = f;
    if (['reboot', 'shutdown', 'wtmp', 'btmp'].includes(user)) continue;
    if (!/^\d{4}-\d{2}-\d{2}T/.test(ts)) continue;
    // Източникът трябва да прилича на адрес/хост — вход без мрежов източник
    // (локална конзола, su) не е „някой влезе отвън".
    if (!source || source === ':0' || source === '-' || !/[.:]/.test(source)) continue;
    const when = Date.parse(ts);
    if (!Number.isFinite(when)) continue;
    out.push({ user, tty, source, ts: when });
  }
  return out;
}

export class Guardians {
  constructor(stateDir) {
    this.stateDir = stateDir;
    this.file = path.join(stateDir, STATE);
    this.state = this.load();
    this.lastEtc = null; // кеширан резултат от последната проверка на дрейфа
    this.lastEtcAt = 0;
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { lastLoginTs: 0, ipHashes: [], ...raw };
    } catch {
      return { lastLoginTs: 0, ipHashes: [] };
    }
  }

  save() {
    try {
      // Таван на списъка: пазим последните 200 хеша — достатъчно за „познат",
      // без да расте вечно.
      this.state.ipHashes = (this.state.ipHashes || []).slice(-200);
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* дискът не бива да чупи пазачите */
    }
  }

  // ── SSH входове ────────────────────────────────────────────────────────────
  async sshCheck() {
    const r = await run('last', ['-w', '-n', '50', '--time-format', 'iso'], { timeout: 10000 });
    if (!r.ok) return []; // няма last/wtmp → няма какво да кажем (не гадаем)
    return this.sshCheckFromText(r.stdout);
  }

  sshCheckFromText(text, now = Date.now()) {
    const entries = parseLast(text);
    // ПЪРВОТО пускане само зарежда котвата — иначе стартът излива историята
    // като „нови входове" (същото правило като първото четене на access log-а).
    if (!this.state.lastLoginTs) {
      this.state.lastLoginTs = now;
      for (const e of entries) {
        const h = ipHash(e.source);
        if (!this.state.ipHashes.includes(h)) this.state.ipHashes.push(h);
      }
      this.save();
      return [];
    }

    const fresh = entries.filter((e) => e.ts > this.state.lastLoginTs);
    if (!fresh.length) return [];
    this.state.lastLoginTs = Math.max(...fresh.map((e) => e.ts));

    const out = [];
    for (const e of fresh.slice(0, 10)) {
      const h = ipHash(e.source);
      const known = this.state.ipHashes.includes(h);
      if (!known) this.state.ipHashes.push(h);
      out.push({
        key: `ssh:login:${h}:${e.ts}`,
        // Нов адрес буди; познатият остава в дневника на панела.
        severity: known ? 'info' : 'warning',
        title: known ? `SSH вход: ${e.user}` : `SSH вход от НОВ адрес: ${e.user}`,
        body:
          `Потребител ${e.user} влезе от ${e.source} (${e.tty}). ` +
          (known
            ? 'Адресът е виждан преди.'
            : 'Този адрес НЕ е виждан досега. Ако не си ти — смени ключовете и виж „Достъп по IP" и fail2ban.'),
        transient: true, // вход е СЪБИТИЕ — няма какво да се „възстанови"
        sustain: false,
      });
    }
    this.save();
    return out;
  }

  // ── Дрейф на /etc ──────────────────────────────────────────────────────────
  // Снемането на отпечатък обхожда и хешира стотици файлове — НЕ на всеки 60s.
  // Кадансът по подразбиране е 30 мин; резултатът се кешира за интерфейса.
  etcCheck(cfg, now = Date.now()) {
    const every = Math.max(300, Number(cfg?.etcCheck?.intervalSec) || 1800) * 1000;
    if (now - this.lastEtcAt < every) return this.etcConditions();
    this.lastEtcAt = now;
    try {
      this.lastEtc = diffEtc(this.stateDir);
    } catch (err) {
      this.lastEtc = { error: String(err.message || err).slice(0, 200) };
    }
    return this.etcConditions();
  }

  etcConditions() {
    const d = this.lastEtc;
    if (!d) return [];
    if (d.error) return []; // stale механизмът на алармите си има отделен път
    if (!d.hasBaseline) {
      // Без отпечатък пазач няма — казва се веднъж седмично, не се крещи.
      return [
        {
          key: 'etc:baseline',
          severity: 'info',
          title: 'Няма отпечатък на /etc',
          body: 'Направи го от „Целост на /etc", докато сървърът е в изправно състояние — оттам нататък всяка промяна ще вдига аларма.',
          sustain: false,
          repeatEvery: 7 * DAY_MS,
        },
      ];
    }
    if (d.clean) return [];
    const total = d.added.length + d.removed.length + d.changed.length;
    const sample = [
      ...d.changed.map((x) => x.path),
      ...d.added.map((x) => x.path),
      ...d.removed.map((x) => x.path),
    ].slice(0, 5);
    return [
      {
        // СЪСТОЯНИЕ, не събитие: дрейфът стои, докато не бъде приет с нов
        // отпечатък — точно като новоизложения порт срещу базовата линия.
        key: 'etc:drift',
        severity: 'warning',
        title: `Промени в /etc спрямо отпечатъка (${total})`,
        body:
          `Променени: ${d.changed.length}, нови: ${d.added.length}, изтрити: ${d.removed.length}. ` +
          `Например: ${sample.join(', ')}. Ако промяната е твоя — направи нов отпечатък от „Целост на /etc"; ` +
          'ако не е, това е следа от чужда ръка.',
        sustain: false,
        repeatEvery: DAY_MS,
      },
    ];
  }
}

export { loadBaseline };
