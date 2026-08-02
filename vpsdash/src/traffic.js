// Месечен трафик срещу квотата на хостера.
//
// Дупката е ПАРИЧНА, не техническа: Hetzner (и всеки друг) таксува преразход над
// включените терабайти, а панелът мереше само моментните rx/tx и пазеше 7 дни
// история. Тоест никъде не се отговаряше на „с това темпо минавам ли квотата
// този месец" — научаваш го от фактурата.
//
// Четири решения, които не са очевидни:
//
//  1. **Броячите в `/proc/net/dev` СЕ НУЛИРАТ при рестарт.** Абсолютната стойност
//     не е месечен сбор; трябва натрупване по РАЗЛИКИ. И понеже нулирането
//     изглежда като „по-малко от преди", то се разпознава изрично (`cur < last`)
//     и текущата стойност се брои като разлика от нула. Без това един рестарт
//     дава отрицателна разлика и месечният сбор тръгва надолу.
//  2. **Броят се само ФИЗИЧЕСКИТЕ интерфейси.** Трафикът на контейнер минава и
//     през `docker0`/`veth*`/`br-*`, И през `eth0`. Съберат ли се всички, всеки
//     байт се брои двойно и панелът вдига аларма за квота на половината път.
//     Същото за `wg*`/`tun*` — те са капсуловани ВЪВ физическия интерфейс.
//  3. **Мери се ИЗХОДЯЩИЯТ трафик по подразбиране.** Почти всички хостери
//     таксуват само egress (Hetzner: входящият е безплатен). Сборът от двете
//     посоки би вдигал аларма за трафик, който никой не плаща.
//  4. **Числото е ДОЛНА граница, не отчетът на хостера.** Спрян панел, рестарт
//     между две проби и трафик преди първата проба се губят. Това се КАЗВА на
//     екрана — панел, който представя своя сбор за фактура, лъже точно когато
//     човек взема решение по него.
import fs from 'node:fs';
import path from 'node:path';
import { parseNetDevPerIface } from './kernel.js';

const STATE = 'traffic.json';
const KEEP_MONTHS = 13;
const TB = 1024 ** 4;

// Физическите интерфейси. Всичко останало е капсуловано в тях (или е локално).
const PHYSICAL_RX = /^(eth|en|ens|eno|enp|wl|wlan|bond|eth-)/;
const VIRTUAL_RX = /^(docker|br-|veth|virbr|tun|tap|wg|tailscale|zt|cni|flannel|kube|dummy|sit|ip6tnl|teql)/;

export function isBilledIface(name, cfg) {
  const explicit = cfg?.traffic?.ifaces;
  if (Array.isArray(explicit) && explicit.length) return explicit.includes(name);
  if (VIRTUAL_RX.test(name)) return false;
  return PHYSICAL_RX.test(name);
}

// „YYYY-MM" по UTC. Хостерът таксува по календарен месец; UTC е единственото,
// което не се мени с часовата зона на машината (и се КАЗВА в интерфейса).
export function monthKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 7);
}

export function monthProgress(now = Date.now()) {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  const total = end - start;
  const elapsed = now - start;
  return { start, end, total, elapsed, fraction: elapsed / total, daysTotal: total / 86400000 };
}

// Една проба: превръща абсолютните броячи в добавка към месечния сбор.
//
// `prev` е предишната снимка по интерфейс. Връща какво да се добави + кои
// интерфейси са се нулирали (за да е видимо в панела, а не мълчаливо).
export function diffSample(prev, cur) {
  let rx = 0;
  let tx = 0;
  const resets = [];
  for (const n of cur) {
    const p = prev?.[n.iface];
    if (!p) continue; // първата проба само запомня — няма от какво да е разлика
    // Нулиране: рестарт на машината или превъртане на 32-битов брояч. Текущата
    // стойност е трафикът СЛЕД нулирането, значи тя е разликата.
    if (n.rxBytes < p.rxBytes || n.txBytes < p.txBytes) {
      resets.push(n.iface);
      rx += Math.max(0, n.rxBytes);
      tx += Math.max(0, n.txBytes);
      continue;
    }
    rx += n.rxBytes - p.rxBytes;
    tx += n.txBytes - p.txBytes;
  }
  return { rx, tx, resets };
}

export class TrafficStore {
  constructor(stateDir) {
    this.file = path.join(stateDir, STATE);
    this.state = this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { months: {}, last: {}, firstSampleAt: null, resets: 0, ...raw };
    } catch {
      return { months: {}, last: {}, firstSampleAt: null, resets: 0 };
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* дискът не бива да чупи броенето */
    }
  }

  // Чете /proc/net/dev и добавя разликата към текущия месец.
  sample(cfg, now = Date.now(), text = null) {
    let raw;
    try {
      raw = text ?? fs.readFileSync('/proc/net/dev', 'utf8');
    } catch {
      return null;
    }
    const ifaces = parseNetDevPerIface(raw).filter((n) => isBilledIface(n.iface, cfg));
    if (!ifaces.length) return null;

    const d = diffSample(this.state.last, ifaces);
    const key = monthKey(now);
    const m = this.state.months[key] || { rx: 0, tx: 0, samples: 0 };
    this.state.months[key] = { rx: m.rx + d.rx, tx: m.tx + d.tx, samples: m.samples + 1 };
    this.state.last = Object.fromEntries(ifaces.map((n) => [n.iface, { rxBytes: n.rxBytes, txBytes: n.txBytes }]));
    this.state.lastSampleAt = new Date(now).toISOString();
    if (!this.state.firstSampleAt) this.state.firstSampleAt = this.state.lastSampleAt;
    if (d.resets.length) this.state.resets = (this.state.resets || 0) + 1;

    // Подрязване: 13 месеца стигат за „същия месец миналата година".
    const keys = Object.keys(this.state.months).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_MONTHS))) delete this.state.months[k];

    this.save();
    return { ...d, month: key, ifaces: ifaces.map((n) => n.iface) };
  }

  status(cfg, now = Date.now()) {
    const key = monthKey(now);
    const cur = this.state.months[key] || { rx: 0, tx: 0, samples: 0 };
    const dir = direction(cfg);
    const used = dir === 'rx' ? cur.rx : dir === 'both' ? cur.rx + cur.tx : cur.tx;
    const quotaBytes = quotaOf(cfg);
    const prog = monthProgress(now);
    // Прогнозата е ПРОСТА пропорция и това е нарочно: месечният сбор е монотонен
    // по конструкция, значи Theil–Sen/Mann–Kendall (за тренд на шумна редица)
    // тук не носи нищо. Единственият честен въпрос е „с това средно темпо".
    const projected = prog.fraction > 0 ? Math.round(used / prog.fraction) : null;
    return {
      month: key,
      direction: dir,
      ifaces: Object.keys(this.state.last || {}),
      rx: cur.rx,
      tx: cur.tx,
      used,
      samples: cur.samples,
      quotaBytes,
      quotaTB: quotaBytes ? quotaBytes / TB : null,
      usedPct: quotaBytes ? Math.round((used / quotaBytes) * 1000) / 10 : null,
      projected,
      projectedPct: quotaBytes && projected ? Math.round((projected / quotaBytes) * 1000) / 10 : null,
      monthFraction: Math.round(prog.fraction * 1000) / 10,
      daysLeft: Math.round(((prog.end - now) / 86400000) * 10) / 10,
      // Кога би се стигнала квотата с текущото темпо — денят е по-действен от процента.
      quotaAtDay: quotaBytes && used > 0 ? quotaDay(used, quotaBytes, prog) : null,
      firstSampleAt: this.state.firstSampleAt || null,
      lastSampleAt: this.state.lastSampleAt || null,
      counterResets: this.state.resets || 0,
      // Прозорецът, в който прогнозата МЪЛЧИ (виж trafficChecks).
      warmedUp: prog.fraction >= MIN_FRACTION,
      history: Object.entries(this.state.months)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 13)
        .map(([month, v]) => ({ month, rx: v.rx, tx: v.tx, samples: v.samples })),
    };
  }
}

function quotaDay(used, quotaBytes, prog) {
  const perMs = used / Math.max(1, prog.elapsed);
  const msToQuota = (quotaBytes - used) / perMs;
  if (!Number.isFinite(msToQuota) || msToQuota < 0) return 1;
  const at = prog.start + prog.elapsed + msToQuota;
  if (at > prog.end) return null; // не се стига този месец
  return new Date(at).getUTCDate();
}

function direction(cfg) {
  const d = cfg?.traffic?.countDirection;
  return d === 'rx' || d === 'both' ? d : 'tx';
}

function quotaOf(cfg) {
  const tb = Number(cfg?.traffic?.quotaTB);
  return Number.isFinite(tb) && tb > 0 ? Math.round(tb * TB) : null;
}

// Първите ~10% от месеца прогнозата МЪЛЧИ: на 2-ро число 3% употреба се
// проектират до 45%, а един ден с деплой и синхронизация на бекъпи изкривява
// всичко. Цената е ~3 дни закъснение — същата съзнателна размяна като твърдия
// минимум лоши проби при burn-rate алармата.
const MIN_FRACTION = 0.1;

export function trafficChecks(cfg, store, now = Date.now()) {
  const out = [];
  if (cfg?.traffic?.enabled === false) return out;
  const s = store?.status(cfg, now);
  // Без зададена квота няма какво да се сравнява — показваме, не алармираме.
  if (!s || !s.quotaBytes) return out;

  const label = s.direction === 'rx' ? 'входящ' : s.direction === 'both' ? 'общ' : 'изходящ';

  if (s.used >= s.quotaBytes) {
    out.push({
      key: 'traffic:quota',
      severity: 'critical',
      title: `Квотата за трафик е МИНАТА (${s.usedPct}%)`,
      body:
        `${label} трафик ${fmtTB(s.used)} от ${fmtTB(s.quotaBytes)} за ${s.month}. Оттук нататък всеки байт се ` +
        `таксува отделно. Остават ${s.daysLeft} дни до нулиране.`,
      sustain: false,
      repeatEvery: 24 * 3600000,
    });
    return out;
  }

  if (s.warmedUp && s.projectedPct >= 100) {
    out.push({
      key: 'traffic:quota',
      severity: s.usedPct >= 80 ? 'critical' : 'warning',
      title: `Прогноза: квотата за трафик пада на ${s.quotaAtDay ?? '?'}-о число`,
      body:
        `${label} трафик ${fmtTB(s.used)} (${s.usedPct}%) на ${s.monthFraction}% от месец ${s.month} → прогноза ` +
        `${fmtTB(s.projected)} от ${fmtTB(s.quotaBytes)}. Прогнозата е проста пропорция и се смята само след ` +
        '10% от месеца. Числото е ДОЛНА граница — спрян панел не брои.',
      sustain: false,
      repeatEvery: 24 * 3600000,
    });
  } else if (s.usedPct >= 80) {
    out.push({
      key: 'traffic:quota',
      severity: 'warning',
      title: `${s.usedPct}% от квотата за трафик`,
      body: `${label} трафик ${fmtTB(s.used)} от ${fmtTB(s.quotaBytes)}, остават ${s.daysLeft} дни до нулиране.`,
      sustain: false,
      repeatEvery: 24 * 3600000,
    });
  }
  return out;
}

export function fmtTB(bytes) {
  const n = Number(bytes) || 0;
  if (n >= TB) return `${(n / TB).toFixed(2)} TB`;
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}
