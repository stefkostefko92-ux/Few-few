// Портове — КАРТА НА ИЗЛОЖЕНОСТТА, не списък.
//
// Досега панелът показваше `ss -tlnp` като таблица „адрес + процес". Тя е вярна и
// почти безполезна, защото не отговаря на единствения въпрос, който има значение:
// **достъпен ли е този порт от интернет?**
//
// Отговорът е сечение на две неща и никое от тях само по себе си не стига:
//   1. на КАКВО слуша сокетът — `127.0.0.1` е недостъпен отвън по конструкция,
//      `0.0.0.0` е достъпен, ако нищо не го спира;
//   2. какво казва защитната стена — услуга на `0.0.0.0`, която ufw блокира, е
//      безобидна; същата услуга с отворено правило е изложена.
//
// Затова тук се смята ТРЕТО състояние, не булево: „изложен", „защитен от стената"
// и **„не знам"**. Третото е задължително и е принципно: ако не сме разпознали
// правило на ufw (именуван профил, който не можем да разрешим до порт), НЕ казваме
// „защитен". Панел, който твърди „защитен", когато не знае, е по-лош от панел,
// който мълчи — това е същата доктрина като при алармите.
//
// Два пропуска на стария изглед, които също се затварят тук: `ss -tlnp` е САМО
// TCP (DNS, WireGuard и QUIC бяха невидими) и няма PID/unit, тоест „какво да спра,
// за да затворя този порт" изискваше второ търсене.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './exec.js';
import { firewallStatus } from './firewall.js';

const STATE = 'ports.json';

// ── Слушащи сокети ───────────────────────────────────────────────────────────
// `-l` слушащи, `-n` числа, `-t`+`-u` TCP и UDP, `-p` процес, `-H` без заглавие.
export async function listeningSockets() {
  const r = await run('ss', ['-lntupH'], { timeout: 10000 });
  if (r.ok) {
    return { ok: true, source: 'ss', sockets: r.stdout.split('\n').map(parseSocketLine).filter(Boolean) };
  }
  // Резерва през `/proc/net/*` — БЕЗ външен инструмент. Панелът вече чете /proc
  // директно за метриките, значи това е идиомът на продукта, а не заобиколен път.
  // Полезно е двойно: минимален образ без iproute2 не остава сляп, и самата карта
  // става тестваема на машина без `ss`.
  const viaProc = socketsFromProc();
  if (viaProc.length) return { ok: true, source: '/proc/net', sockets: viaProc };
  // Провалът е ОТЛИЧИМ от „нищо не слуша" — иначе картата казва „всичко е
  // чисто" точно когато не знае нищо.
  return { ok: false, error: (r.stderr || r.error || 'нито ss, нито /proc/net дадоха резултат').slice(0, 200), sockets: [] };
}

// ── Резервно четене от /proc/net ──────────────────────────────────────────────
// Формат: „ sl local_address rem_address st … inode". Адресът е ШЕСТНАЙСЕТИЧЕН и
// с обърнати байтове по думи от 4 байта (little-endian) — 0100007F е 127.0.0.1.
// Това обръщане е класическото място, където такъв парсер се пише грешно и после
// показва 1.0.0.127.
export function parseHexAddr(hex) {
  if (hex.length === 8) {
    const b = hex.match(/../g).reverse().map((h) => parseInt(h, 16));
    return b.join('.');
  }
  if (hex.length === 32) {
    // IPv6: четири 32-битови думи, всяка с обърнати байтове.
    const words = hex.match(/.{8}/g).map((w) => w.match(/../g).reverse().join(''));
    const groups = words.join('').match(/.{4}/g).map((g) => g.replace(/^0+/, '') || '0');
    const full = groups.join(':');
    // Свиваме най-дългата поредица нули — „0:0:0:0:0:0:0:1" е „::1".
    return full.replace(/\b(?:0:){2,}0\b/, ':').replace(/^:(?!:)/, '::').replace(/:{3,}/, '::');
  }
  return hex;
}

const TCP_LISTEN = '0A';
const UDP_UNCONN = '07';

export function socketsFromProc() {
  const out = [];
  const inodes = new Map(); // inode → сокет, за да закачим PID след това
  for (const [file, proto] of [
    ['/proc/net/tcp', 'tcp'],
    ['/proc/net/tcp6', 'tcp'],
    ['/proc/net/udp', 'udp'],
    ['/proc/net/udp6', 'udp'],
  ]) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n').slice(1)) {
      const f = line.trim().split(/\s+/);
      if (f.length < 10) continue;
      const [hexAddr, hexPort] = (f[1] || '').split(':');
      if (!hexPort) continue;
      const st = f[3];
      // Слушащи TCP и bound UDP. Всичко останало е активна връзка, не порт,
      // който чака — а картата е за портовете, които чакат.
      if (proto === 'tcp' ? st !== TCP_LISTEN : st !== UDP_UNCONN) continue;
      const port = parseInt(hexPort, 16);
      if (!port) continue;
      const rec = {
        proto,
        addr: parseHexAddr(hexAddr),
        port,
        local: `${parseHexAddr(hexAddr)}:${port}`,
        state: proto === 'tcp' ? 'LISTEN' : 'UNCONN',
        process: '',
        pid: null,
        inode: f[9],
      };
      out.push(rec);
      if (rec.inode && rec.inode !== '0') inodes.set(rec.inode, rec);
    }
  }
  if (inodes.size) attachPids(inodes);
  return out;
}

// PID-ът се намира по inode на сокета: /proc/<pid>/fd/* е символна връзка
// „socket:[<inode>]". Иска root (панелът е root) — при отказ просто няма PID,
// което картата вече умее да показва.
function attachPids(inodes) {
  let pids = [];
  try {
    pids = fs.readdirSync('/proc').filter((n) => /^\d+$/.test(n));
  } catch {
    return;
  }
  for (const pid of pids) {
    let fds = [];
    try {
      fds = fs.readdirSync(path.join('/proc', pid, 'fd'));
    } catch {
      continue; // чужд/изчезнал процес
    }
    for (const fd of fds) {
      let link;
      try {
        link = fs.readlinkSync(path.join('/proc', pid, 'fd', fd));
      } catch {
        continue;
      }
      const m = /^socket:\[(\d+)\]$/.exec(link);
      if (!m) continue;
      const rec = inodes.get(m[1]);
      if (!rec || rec.pid) continue;
      rec.pid = Number(pid);
      try {
        rec.process = fs.readFileSync(path.join('/proc', pid, 'comm'), 'utf8').trim();
      } catch {
        /* изчезнал процес — PID-ът пак е полезен */
      }
    }
  }
}

// „tcp LISTEN 0 511 0.0.0.0:80 0.0.0.0:* users:(("nginx",pid=123,fd=6))"
export function parseSocketLine(line) {
  const f = String(line || '').trim().split(/\s+/);
  if (f.length < 5) return null;
  const proto = f[0];
  if (proto !== 'tcp' && proto !== 'udp') return null;
  const local = f[4];
  // IPv6 идва като „[::]:80" или „[::1]:443" — портът е СЛЕД последното двоеточие.
  const i = local.lastIndexOf(':');
  if (i < 0) return null;
  const port = Number(local.slice(i + 1));
  if (!Number.isInteger(port) || port < 1) return null;
  const addr = local.slice(0, i).replace(/^\[|\]$/g, '');
  const users = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
  return {
    proto,
    addr,
    port,
    local,
    state: f[1],
    process: users?.[1] || '',
    pid: users?.[2] ? Number(users[2]) : null,
  };
}

// Кой systemd unit държи този процес. Чете се от `/proc/<pid>/cgroup` — нула
// допълнителни команди и работи и за контейнери (там показва docker scope-а).
export function unitOfPid(pid) {
  if (!pid) return null;
  let text;
  try {
    text = fs.readFileSync(path.join('/proc', String(pid), 'cgroup'), 'utf8');
  } catch {
    return null;
  }
  const m = text.match(/([\w@.\\-]+\.(?:service|scope|socket))/);
  return m ? m[1] : null;
}

// ── Правилата на стената, преведени до портове ────────────────────────────────
// Именуваните профили („OpenSSH", „Nginx Full") НЕ могат да се разрешат от изхода
// на `ufw status`. Разпознаваме простите имена през /etc/services, а за профилите
// пазим малка карта — и всичко неразпознато се маркира като НЕИЗВЕСТНО, вместо да
// се приеме за безобидно.
const APP_PROFILES = {
  openssh: [22],
  ssh: [22],
  'nginx full': [80, 443],
  'nginx http': [80],
  'nginx https': [443],
  'apache full': [80, 443],
  www: [80],
  'www full': [80, 443],
  'www secure': [443],
  postfix: [25],
  dovecot: [143, 993],
};

let servicesCache = null;
function servicePort(name) {
  if (servicesCache === null) {
    servicesCache = new Map();
    try {
      for (const line of fs.readFileSync('/etc/services', 'utf8').split('\n')) {
        const m = line.match(/^([\w.-]+)\s+(\d+)\/(tcp|udp)/);
        if (m) servicesCache.set(`${m[1].toLowerCase()}/${m[3]}`, Number(m[2]));
      }
    } catch {
      /* липсващ /etc/services не е фатално — просто по-малко разпознати имена */
    }
  }
  return servicesCache.get(`${name.toLowerCase()}/tcp`) ?? servicesCache.get(`${name.toLowerCase()}/udp`) ?? null;
}

// Връща { ports:Set, ranges:[[от,до]], protos:Set|null, unresolved:[…] }
export function parseAllowRules(rules) {
  const ports = new Set();
  const ranges = [];
  const unresolved = [];
  for (const r of rules || []) {
    if (r.action !== 'ALLOW' || r.dir !== 'IN') continue;
    const to = String(r.to || '').trim();
    // „22/tcp", „80", „1000:2000/udp", „OpenSSH", „192.168.1.1 22/tcp"
    const tail = to.split(/\s+/).pop();
    const m = /^(\d+)(?::(\d+))?(?:\/(tcp|udp))?$/.exec(tail);
    if (m) {
      const from = Number(m[1]);
      const till = m[2] ? Number(m[2]) : from;
      if (till > from) ranges.push([from, till]);
      else ports.add(from);
      continue;
    }
    const named = APP_PROFILES[to.toLowerCase()] || (servicePort(tail) ? [servicePort(tail)] : null);
    if (named) {
      for (const p of named) ports.add(p);
      continue;
    }
    unresolved.push(to);
  }
  return { ports, ranges, protos: null, unresolved };
}

export function allowsPort(allow, port) {
  if (allow.ports.has(port)) return true;
  return allow.ranges.some(([a, b]) => port >= a && port <= b);
}

// ── Картата ──────────────────────────────────────────────────────────────────
const LOCAL_ONLY = new Set(['127.0.0.1', '::1', 'localhost']);

export function classify({ addr, port }, { fwActive, fwAvailable, allow }) {
  if (LOCAL_ONLY.has(addr)) {
    return { exposure: 'локален', why: 'Слуша само на loopback — отвън е недостъпен по конструкция.' };
  }
  const anywhere = addr === '0.0.0.0' || addr === '::' || addr === '*';
  const where = anywhere ? 'всички интерфейси' : `адрес ${addr}`;
  if (!fwAvailable) {
    return { exposure: 'неизвестно', why: `Слуша на ${where}, но ufw не отговори — не знам дали нещо го спира.` };
  }
  if (!fwActive) {
    return { exposure: 'изложен', why: `Слуша на ${where}, а защитната стена е ИЗКЛЮЧЕНА — нищо не го спира.` };
  }
  if (allowsPort(allow, port)) {
    return { exposure: 'изложен', why: `Слуша на ${where} и ufw има правило ALLOW за порт ${port}.` };
  }
  if (allow.unresolved.length) {
    return {
      exposure: 'неизвестно',
      why:
        `Слуша на ${where}. Няма разпознато правило за ${port}, но ufw има правила, които не мога да преведа ` +
        `до порт (${allow.unresolved.slice(0, 3).join(', ')}) — затова не твърдя, че е защитен.`,
    };
  }
  return { exposure: 'защитен', why: `Слуша на ${where}, но ufw не пуска порт ${port} отвън.` };
}

export async function exposureMap(cfg) {
  const [sock, fw] = await Promise.all([listeningSockets(), firewallStatus()]);
  const fwAvailable = fw.available !== false;
  const allow = parseAllowRules(fwAvailable ? fw.rules : []);
  // Кой продукт седи на кой порт — от нашите health проверки.
  const owners = new Map();
  for (const h of cfg?.healthChecks || []) {
    try {
      const u = new URL(h.url);
      const p = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
      owners.set(p, h.name);
    } catch {
      /* невалиден URL в конфига — не чупим картата заради него */
    }
  }
  if (cfg?.port) owners.set(Number(cfg.port), 'самият панел');
  if (cfg?.desktop?.port) owners.set(Number(cfg.desktop.port), 'десктоп');

  const rows = sock.sockets
    .map((s) => {
      const c = classify(s, { fwActive: fw.active, fwAvailable, allow });
      return { ...s, ...c, unit: unitOfPid(s.pid), owner: owners.get(s.port) || null };
    })
    // Изложените отгоре — това е редът, по който човек чете таблица.
    .sort((a, b) => rank(a.exposure) - rank(b.exposure) || a.port - b.port);

  return {
    available: sock.ok,
    error: sock.error || null,
    firewall: { available: fwAvailable, active: Boolean(fw.active), unresolved: allow.unresolved },
    counts: {
      изложени: rows.filter((r) => r.exposure === 'изложен').length,
      неизвестни: rows.filter((r) => r.exposure === 'неизвестно').length,
      защитени: rows.filter((r) => r.exposure === 'защитен').length,
      локални: rows.filter((r) => r.exposure === 'локален').length,
    },
    rows,
  };
}

const RANK = { изложен: 0, неизвестно: 1, защитен: 2, локален: 3 };
const rank = (e) => RANK[e] ?? 9;

// ── Базова линия: алармата е за НОВО изложен порт ─────────────────────────────
// Аларма „порт 443 е отворен" е безполезна — той трябва да е отворен. Полезният
// сигнал е ПРОМЯНАТА: порт, който преди не беше изложен, а сега е. Затова се пази
// приета базова линия, точно както `NRestarts` се следи по разлика.
export class PortBaseline {
  constructor(stateDir) {
    this.file = path.join(stateDir, STATE);
    this.state = { accepted: [], acceptedAt: null };
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (Array.isArray(raw.accepted)) this.state = raw;
    } catch {
      /* първо пускане */
    }
  }

  save() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.state), { mode: 0o600 });
    } catch {
      /* дискът не бива да чупи картата */
    }
  }

  // Ключът е „порт/протокол", не само порт: 53/udp и 53/tcp са различни неща.
  static key(r) {
    return `${r.port}/${r.proto}`;
  }

  accept(rows) {
    this.state = {
      accepted: rows.filter((r) => r.exposure === 'изложен').map(PortBaseline.key).sort(),
      acceptedAt: new Date().toISOString(),
    };
    this.save();
    return this.state;
  }

  // Нови спрямо приетото. Празна базова линия значи „още нищо не е прието" —
  // тогава НЕ заливаме човека, а казваме да приеме текущото състояние (info).
  diff(rows) {
    const now = rows.filter((r) => r.exposure === 'изложен');
    if (!this.state.acceptedAt) return { primed: false, fresh: [], gone: [] };
    const accepted = new Set(this.state.accepted);
    const nowKeys = new Set(now.map(PortBaseline.key));
    return {
      primed: true,
      fresh: now.filter((r) => !accepted.has(PortBaseline.key(r))),
      gone: [...accepted].filter((k) => !nowKeys.has(k)),
    };
  }
}

// Условия за двигателя на алармите.
export function portChecks(map, baseline) {
  const out = [];
  if (!map.available) return out;
  const d = baseline.diff(map.rows);
  if (!d.primed) {
    if (map.counts.изложени) {
      out.push({
        key: 'ports:baseline',
        severity: 'info',
        title: `${map.counts.изложени} изложени порта, без приета базова линия`,
        body: 'Отвори „Портове" и приеми текущото състояние за нормално. След това всеки НОВО изложен порт вдига аларма — а „порт 443 е отворен" не е новина.',
        sustain: false,
        repeatEvery: 7 * 24 * 3600000,
      });
    }
    return out;
  }
  for (const r of d.fresh) {
    out.push({
      key: `ports:new:${PortBaseline.key(r)}`,
      severity: 'warning',
      title: `Нов изложен порт: ${r.port}/${r.proto}`,
      body:
        `${r.why} Процес: ${r.process || '?'}${r.unit ? ` (${r.unit})` : ''}${r.owner ? ` · ${r.owner}` : ''}. ` +
        'Ако е нарочно, приеми новата базова линия от секция „Портове".',
    });
  }
  // Изчезнал изложен порт е ИНФОРМАЦИЯ, не проблем — но е информация, която
  // обяснява защо продукт е спрял да отговаря.
  if (d.gone.length) {
    out.push({
      key: 'ports:gone',
      severity: 'info',
      title: `${d.gone.length} порта вече не слушат`,
      body: `Липсват спрямо приетата линия: ${d.gone.join(', ')}. Ако продукт не отговаря, започни оттук.`,
      sustain: false,
      repeatEvery: 24 * 3600000,
    });
  }
  return out;
}
