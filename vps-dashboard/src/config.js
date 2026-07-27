// Конфигурация — чете /etc/vps-dashboard/config.json (mode 600, само на сървъра).
// В dev режим (CSD_DEV=1 или липсващ конфиг) генерира ефимерен конфиг с еднократна
// парола, отпечатана в конзолата — нищо не се записва в репото.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from './auth.js';

export const CONFIG_PATH = process.env.CSD_CONFIG || '/etc/vps-dashboard/config.json';

const DEFAULTS = {
  host: '127.0.0.1',
  port: 7700,
  nodeId: 'local',
  nodeName: 'Този сървър',
  adminUser: 'admin',
  sessionTtlHours: 12, // абсолютен таван на сесията
  idleMinutes: 30, // без активност толкова → сесията пада
  sessionGen: 0, // вдигането му обезсилва ВСИЧКИ издадени сесии
  // Обхват на другия VPS през federation: „read" (по подразбиране) или „full".
  // При „read" компрометиран peer не може да пипне терминала/деплоя/захранването.
  peerScope: 'read',
  // Зад reverse proxy с TLS → кукито става Secure и IP-то се чете от X-Forwarded-For.
  trustProxy: false,
  // Входящ federation токен — с него другият VPS вика нашето API. Празно = изключено.
  peerToken: '',
  // Другите VPS-и: [{ id, name, url, token }]
  peers: [],
  paths: {
    stateDir: '/var/lib/vps-dashboard',
    releasesDir: '/opt/few-few/releases',
    currentLink: '/opt/few-few/current',
    archiveDir: '/root',
    autodeploy: '', // празно = <archive>/deploy/autodeploy.sh от текущия release
  },
  // Известия — канали. Празните се пропускат. Тайните живеят само тук (mode 600).
  // `minSeverity` (празно/„info"/„warning"/„critical") е праг ПО КАНАЛ: телефонът
  // да звъни само за критичното, имейлът да носи всичко. Без праг единственият
  // избор е „всичко или нищо" — и човек изключва канала.
  notify: {
    telegram: { botToken: '', chatId: '', minSeverity: '' },
    ntfy: { server: 'https://ntfy.sh', topic: '', token: '', minSeverity: '' },
    webhook: { url: '', minSeverity: '' },
    email: { to: '', from: 'vps-dashboard@localhost', minSeverity: '' }, // праща се през sendmail, ако е наличен
  },
  // Аларми — прагове и каданс. Аларми по СИМПТОМ, не по причина (канонът на Наблюдателя).
  alerts: {
    enabled: true,
    checkIntervalSec: 60,
    cooldownMin: 60, // повторно известие за същия проблем не по-често от това
    sustainSamples: 3, // праг трябва да се задържи N проверки → без шум от пикове
    // Симетрично на горното: и ОТПАДАНЕТО иска N чисти проверки. Иначе условие,
    // което трепти около прага, произвежда безкрайни двойки „пламна/възстанови
    // се" — а резолвът не минава през cooldown и всяка двойка е две известия.
    resolveSamples: 2,
    // Мъртвецът-ключ: URL, който се пинга след всяка УСПЕШНА оценка (напр.
    // healthchecks.io, Uptime Kuma push, cron-monitor на другия VPS). Спре ли
    // пингът, външният наблюдател вдига тревога ВМЕСТО панела. Това е
    // единствената защита срещу тихо умрял мониторинг — вътрешна проверка не
    // може да открие собствената си смърт. Празно = изключено.
    heartbeatUrl: '',
    // Известията с тежест „info" (аномалии, „нужен е рестарт", „няма настроен
    // канал") стоят в панела, но НЕ отиват на телефона. Аларма по аномалия е
    // класическият източник на умора от известия — виж доктрината. Вдигни го на
    // true само ако наистина искаш всичко.
    notifyInfo: false,
    // Заглушавания: [{ key, until (ms), note }]. Заглушената аларма продължава
    // да се смята и да се вижда в панела — само известието спира. Срокът е
    // задължителен: безсрочното заглушаване е начинът да забравиш, че си сляп.
    silences: [],
    thresholds: {
      // СИМПТОМИ (предпочитани): колко % от времето задачите са били блокирани.
      psiCpu: 40,
      psiIo: 30,
      psiMem: 10,
      stealPct: 10, // хостерът краде процесор → тикет към доставчика
      // Капацитет.
      diskPct: 85,
      diskEtaDays: 7, // прогноза: предупреди, ако дискът се пълни за под N дни
      inodePct: 85,
      certDays: 14,
      fdPct: 80, // изчерпани файлови дескриптори → EMFILE вали Node мигновено
      // Резерва за ядра БЕЗ PSI (иначе не се ползва).
      cpuPct: 90,
      memPct: 95,
    },
  },
  // Двуфакторна автентикация (TOTP). secret и хешовете на резервните кодове се
  // записват при включване от панела.
  totp: { enabled: false, secret: '', recoveryHashes: [] },
  // Изнасяне на одита към другия VPS — единствената истинска защита срещу root,
  // който чисти следите си (хеш-веригата само ОТКРИВА).
  auditShip: { enabled: false, intervalSec: 300 },
  // Публични адреси, които ДРУГИТЕ възли да сондират за нас (външна гледна точка).
  probeTargets: [],
  // SLO: цел за наличност и burn-rate аларми (канонът на Google SRE).
  // 99.9% за 30 дни = 43 минути допустим престой. Вдигай целта съзнателно —
  // 99.99% значи 4 минути на месец, което е скъпо обещание.
  slo: {
    enabled: true,
    target: 0.999,
    latencyTargetMs: 800, // над това пробата е „бавна" (ОТДЕЛЕН SLI от „долу")
    latencyTarget: 0.99, // дял заявки под прага; по-мек от целта за наличност
    minBadShort: 3, // пази от „една лоша проба = страница" при малко проби
  },
  // Redis: праг за заетост на паметта. Изхвърлените ключове се следят по
  // РАЗЛИКА и нямат праг — всяко ново изхвърляне е тиха загуба на данни.
  redis: { enabled: true, memPct: 90 },
  // Access log: дял 5xx от РЕАЛНИЯ трафик. Пробата пита един URL и вижда 200;
  // потребителите в същия момент може да получават 500 на checkout-а. Броим само
  // новото от последната проверка, и то само над минимален брой заявки — иначе
  // „1 грешка от 3 заявки в 4 сутринта" вдига страница.
  // `windowMin` е ПЛЪЗГАЩ прозорец: изискването „поне N заявки" се мери за него,
  // не за един тик. Иначе на малък сайт прагът на видимост е ~30 000 заявки/ден
  // и алармата не пламва никога.
  accesslog: { enabled: true, errorPct: 5, minRequests: 20, windowMin: 10 },
  // Аналитика на журнала: групиране по отпечатък и откриване на НОВИ грешки.
  logmine: { enabled: true, priority: 4, intervalSec: 300 },
  // Бекъпи: аларма по ВЪЗРАСТТА на най-новия (спрял крон не вдига грешка сам) и
  // планирана проба за възстановяване (бекъп без възстановяване е обещание).
  backups: {
    alertEnabled: true,
    maxAgeDays: 2,
    drillEnabled: true,
    drillIntervalDays: 30,
  },
  // Домейни, чиято РЕГИСТРАЦИЯ да се следи през RDAP. Празно = само домейните от
  // намерените сертификати. Сертификатът е безполезен, ако домейнът падне.
  watchDomains: [],
  domainExpiryDays: 30,
  // Публични адреси за проверка на заглавките за сигурност (какво реално получава
  // браузърът, не какво пише в конфига).
  headerTargets: [],
  // .env файлове на продуктите, които редакторът да показва. Автоматично се
  // намират и тези под currentLink//opt//srv, но с изричен запис даваш и unit-а
  // за рестарт: [{ name, path, unit }]
  envFiles: [],
  // Входящ webhook от GitHub. САМО известява (не деплойва — виж src/webhook.js).
  // Празна тайна = маршрутът връща 404, все едно го няма.
  webhook: { githubSecret: '' },
  // Списък с разрешени адреси/CIDR за целия панел. ПРАЗЕН = изключено (не
  // „никой не влиза") — иначе едно погрешно записване заключва собственика
  // извън собствения му сървър. Зад прокси работи само с trustProxy: true И
  // прокси, което ПРЕЗАПИСВА X-Real-IP.
  allowIps: [],
  // Режим „sudo": повторна автентикация преди необратимите действия.
  sudoMode: { enabled: true },
  // Имейл за Let's Encrypt (известия за изтичащ сертификат от самия издател).
  acmeEmail: '',
  // Качване на архиви от браузъра (за деплой).
  uploads: { maxBytes: 3 * 1024 * 1024 * 1024 },
  // Продуктови health проверки (име + локален URL). Съвпадат с autodeploy.sh.
  healthChecks: [
    { name: 'zabobovdol', url: 'http://127.0.0.1:80/' },
    { name: 'medqr', url: 'http://127.0.0.1:3000/' },
    { name: 'vizitka', url: 'http://127.0.0.1:3100/' },
    { name: 'mastilko', url: 'http://127.0.0.1:3200/' },
    { name: 'nexus', url: 'http://127.0.0.1:4000/api/health' },
    { name: 'supreme', url: 'http://127.0.0.1:8080/' },
    { name: 'eternaltouch', url: 'http://127.0.0.1:4300/healthz' },
    { name: 'ospedali', url: 'http://127.0.0.1:8788/healthz' },
    // Статичен сайт зад Caddy (root /var/www/adblock) — няма собствен процес,
    // затова проверката минава през самия Caddy с правилния Host.
    { name: 'adblock', url: 'http://127.0.0.1/', host: 'adblock.carbonstealth.eu' },
  ],
};

function deepMerge(base, over) {
  const out = { ...base };
  for (const [k, v] of Object.entries(over || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function loadConfig({ configPath = CONFIG_PATH, allowDev = true } = {}) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Невалиден конфиг ${configPath}: ${err.message}`);
  }

  if (!raw) {
    if (!allowDev) {
      throw new Error(`Липсва конфиг ${configPath} — пусни deploy/install.sh веднъж на сървъра.`);
    }
    // Dev fallback: еднократна парола, ефимерни тайни, state в локална папка.
    const password = crypto.randomBytes(9).toString('base64url');
    const cfg = deepMerge(DEFAULTS, {
      nodeName: 'DEV',
      passwordHash: hashPassword(password),
      sessionSecret: crypto.randomBytes(32).toString('hex'),
      paths: { stateDir: path.resolve('.state') },
      dev: true,
    });
    // eslint-disable-next-line no-console
    console.log(`\n▸ DEV режим: потребител "${cfg.adminUser}", парола "${password}" (еднократна)\n`);
    return finalize(cfg);
  }

  const cfg = deepMerge(DEFAULTS, raw);
  if (!cfg.passwordHash) throw new Error('Конфигът няма passwordHash — пусни deploy/install.sh.');
  if (!cfg.sessionSecret || cfg.sessionSecret.length < 32) {
    throw new Error('Конфигът няма силен sessionSecret (≥32 знака).');
  }
  return finalize(cfg);
}

function finalize(cfg) {
  fs.mkdirSync(cfg.paths.stateDir, { recursive: true, mode: 0o700 });
  return cfg;
}

// Записва промяна по конфига (2FA, канали за известия, прагове) обратно на диск.
// Атомарно (tmp + rename), mode 600. Мутира и обекта в паметта, за да е в синхрон.
// В dev режим (без файл) само мутира паметта — нищо не се записва.
export function saveConfig(cfg, patch, { configPath = CONFIG_PATH } = {}) {
  const merged = deepMerge(cfg, patch);
  Object.assign(cfg, merged);
  if (cfg.dev) return cfg;
  const { dev, ...toWrite } = merged;
  const tmp = `${configPath}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(toWrite, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, configPath);
  return cfg;
}
