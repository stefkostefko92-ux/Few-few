// backend/src/lib/bruteForce.js
// Централна защита срещу налучкване на тайни (brute force / credential stuffing).
//
// ЗАЩО СЪЩЕСТВУВА: рейт лимитерите броят ВСИЧКИ заявки еднакво. Това пази
// ресурса, но не пази ТАЙНАТА: 200 заявки/мин е нищо за нормален клиент и цяло
// състояние за налучкващ. Стандартът иска дроселиране точно на НЕУСПЕШНИТЕ
// опити, с нарастващо наказание:
//   • NIST SP 800-63B §5.2.2 — ограничи неуспешните опити за автентикация
//   • OWASP ASVS 4.0 V2.2.1 — anti-automation срещу налучкване на пълномощия
//
// ═══ ЧЕТИРИТЕ СЛОЯ ═══
//
// 1. ПО ИЗТОЧНИК (IP) — плъзгащ прозорец с растящо наказание.
//
// 2. ПО ПОДМРЕЖА (/24 IPv4, /64 IPv6) — това затваря РЕАЛНОТО заобикаляне на
//    per-IP защитата. Ботнет или прокси пул сменя адреси, но рядко сменя цели
//    мрежи; per-IP брояч сам по себе си е безсилен срещу въртене на адреси.
//    Праговете тук са по-високи, защото зад една /24 стоят и легитимни хора.
//
// 3. ГЛОБАЛНО ПО ОБХВАТ — адаптивно затягане. Ако общият брой провали за даден
//    обхват скочи, праговете за всеки източник се СВИВАТ (5 → 2). Съзнателно
//    НЕ блокираме всички: това би било самопричинен отказ на услугата, тоест
//    нападателят би изключвал легитимните клиенти вместо нас. Легитимен клиент
//    почти никога не бърка тайната си, затова свиването не го засяга.
//
// 4. ТРАЙНОСТ ПРЕЗ REDIS — броячите и блокировките преживяват рестарт и се
//    ДЕЛЯТ между процеси/реплики. Паметта остава като винаги наличен резерв:
//    решението е „по-лошото от двете", значи падналият Redis отслабва обхвата,
//    но никога не сваля защитата и никога не отключва блокиран.
//
// ═══ ДРУГИ РЕШЕНИЯ ПО ДИЗАЙНА (всяко платено с конкретен риск) ═══
//  • Наказанието РАСТЕ (1 мин → 5 → 30 → 24 ч): цената на налучкването е
//    експоненциална, а на човешката грешка — нулева.
//  • Успех ЧИСТИ брояча по източник — иначе сбъркал веднъж носи наказание вечно.
//  • ПАМЕТТА Е ОГРАНИЧЕНА и изхвърлянето е О(изхвърлени) без сортиране. Първата
//    версия сортираше целия Map при препълване — тоест точно при разпределена
//    атака защитата гореше процесор и ставаше DoS усилвател (хванато от теста).
//  • Одитният запис е ВЕДНЪЖ на блокировка, не на заявка — иначе нападателят
//    би ни карал да пишем в базата вместо себе си.
//  • Никога не хвърля и никога не чака: Redis е с бърз отказ (виж redisClient).
import { isIP } from "node:net";
import { getRedis } from "./redisClient.js";

const WINDOW_MS = 15 * 60 * 1000;
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000);
const MAX_ENTRIES = 20_000;
const EVICT_TO = Math.floor(MAX_ENTRIES * 0.9);
const PRUNE_EVERY_MS = 60 * 1000;

// Стълбата по ИЗТОЧНИК. Подредена от най-тежката надолу — първият надхвърлен
// праг печели, без да се сортира при всяка заявка.
const STEPS = [
  { failures: 50, blockMs: 24 * 60 * 60 * 1000 },
  { failures: 20, blockMs: 30 * 60 * 1000 },
  { failures: 10, blockMs: 5 * 60 * 1000 },
  { failures: 5,  blockMs: 60 * 1000 },
];

// Стълбата по ПОДМРЕЖА — по-търпелива, защото зад една мрежа има и невинни.
const SUBNET_STEPS = [
  { failures: 250, blockMs: 6 * 60 * 60 * 1000 },
  { failures: 100, blockMs: 30 * 60 * 1000 },
  { failures: 40,  blockMs: 5 * 60 * 1000 },
];

// Стълбата за ШИРОКАТА мрежа (/16, /48) — най-търпелива от трите. Тя пази от
// нападател, който върти цял блок адреси (типично при IPv6 /48), без да пипа
// нормални хора: легитимен трафик от цяла /16 рядко трупа стотици ПРОВАЛА.
const WIDE_STEPS = [
  { failures: 600, blockMs: 6 * 60 * 60 * 1000 },
  { failures: 250, blockMs: 60 * 60 * 1000 },
];

// Над този брой провали в един обхват за прозореца смятаме, че тече атака,
// и свиваме праговете по източник (слой 3).
const GLOBAL_ATTACK_THRESHOLD = 100;
const TIGHTENED_FIRST_STEP = { failures: 2, blockMs: 5 * 60 * 1000 };

/** @type {Map<string, {times:number[], blockedUntil:number, logged:boolean}>} */
const state = new Map();
/** @type {Map<string, number[]>} глобални провали по обхват */
const globalFails = new Map();
let lastPrune = 0;

const now = () => Date.now();
const entryKey = (scope, key) => `${scope}:${key}`;

// ─── Помощни ────────────────────────────────────────────────────────────────

/**
 * Подмрежата на адреса: /24 за IPv4, /64 за IPv6.
 * IPv4-mapped IPv6 („::ffff:1.2.3.4") се нормализира до IPv4 — иначе същият
 * клиент би имал ДВА независими бюджета според това как е стигнал до нас.
 */
export function subnetOf(ip) {
  const addr = normalizeAddr(ip);
  const version = isIP(addr);
  if (version === 4) return addr.split(".").slice(0, 3).join(".") + ".0/24";
  if (version === 6) return addr.split(":").slice(0, 4).join(":") + "::/64";
  // НЕ е IP (напр. „panelId:userId" при верификация): мрежовите слоеве нямат
  // смисъл — null, за да НЕ се създават фалшиви „подмрежови" кофи.
  return null;
}

/**
 * Нормализира IPv4-mapped IPv6 („::ffff:1.2.3.4" → „1.2.3.4"), иначе същият
 * клиент би имал ДВА независими бюджета според как е стигнал до нас.
 *
 * РАЗПОЗНАВАНЕТО МИНАВА ПРЕЗ `net.isIP`, не през „има ли двоеточие". Първата
 * версия използваше точно тази хлабава проверка и вземаше ключа
 * „panelId:userId" (верификация) за IPv6 адрес — хванато от теста.
 */
function normalizeAddr(ip) {
  const s = String(ip || "").trim();
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped ? mapped[1] : s;
}

/**
 * По-широката мрежа: /16 за IPv4, /48 за IPv6.
 *
 * ЗАЩО СЪЩЕСТВУВА ВТОРО НИВО (затягане, 11.08.2026): при IPv6 доставчиците
 * раздават на един клиент цял /48, тоест 65 536 различни /64 мрежи. Слой,
 * агрегиращ само по /64, е практически безсилен срещу такъв нападател — той
 * сменя „мрежа" колкото пъти поиска, без да излиза от собствения си блок.
 * Затова има и по-груба група, с още по-търпелив праг: тя не бива да пипа
 * нормални хора, а хваща именно въртенето в цял блок.
 */
export function wideNetOf(ip) {
  const addr = normalizeAddr(ip);
  const version = isIP(addr);
  if (version === 4) return addr.split(".").slice(0, 2).join(".") + ".0.0/16";
  if (version === 6) return addr.split(":").slice(0, 3).join(":") + "::/48";
  return null;   // виж бележката в subnetOf
}

/** Съкратен адрес за одита — GDPR съобр. 30: мащабът се вижда, човекът не. */
function keyLabel(key) {
  const s = String(key);
  if (s.includes("/")) return s;                       // подмрежата вече е обобщена
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":") + ":…";
  const p = s.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}.${p[2]}.x` : "…";
}

function prune() {
  const t = now();
  if (t - lastPrune >= PRUNE_EVERY_MS) {
    lastPrune = t;
    for (const [k, e] of state) {
      const stale = e.blockedUntil <= t
        && (e.times.length === 0 || t - e.times[e.times.length - 1] > WINDOW_MS);
      if (stale) state.delete(k);
    }
    for (const [k, arr] of globalFails) {
      const kept = arr.filter((ts) => t - ts < WINDOW_MS);
      if (kept.length) globalFails.set(k, kept); else globalFails.delete(k);
    }
  }
  if (state.size <= MAX_ENTRIES) return;

  // Изхвърляне без сортиране: Map-ът пази реда на вмъкване, значи итерацията
  // върви „най-старите първо". Активните блокировки се прескачат, за да не се
  // освобождава нападателят, като залее Map-а с нови източници.
  for (const [k, e] of state) {
    if (state.size <= EVICT_TO) return;
    if (e.blockedUntil > t) continue;
    state.delete(k);
  }
  for (const k of state.keys()) {
    if (state.size <= EVICT_TO) return;
    state.delete(k);
  }
}

function getEntry(scope, key) {
  const k = entryKey(scope, key);
  let e = state.get(k);
  if (!e) { e = { times: [], blockedUntil: 0, logged: false }; state.set(k, e); }
  return e;
}

function auditBlock(scope, key, failures, blockMs, kind) {
  Promise.resolve()
    .then(async () => {
      const { prisma } = await import("./prisma.js");
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorTag: "SYSTEM",
          action: "SECURITY_BRUTE_FORCE_BLOCK",
          metadata: { scope, kind, key: keyLabel(key), failures, blockMs },
        },
      });
    })
    .catch(() => { /* одитът никога не бива да чупи защитата */ });
}

// ─── Redis слой (винаги по избор, никога задължителен) ──────────────────────

async function redisBlockedUntil(scope, keys) {
  const redis = getRedis();
  if (!redis) return 0;
  try {
    const vals = await redis.mget(keys.map((k) => `bf:blk:${scope}:${k}`));
    return vals.reduce((max, v) => Math.max(max, Number(v) || 0), 0);
  } catch {
    return 0;   // Redis недостъпен → разчитаме на паметта (никога не отключва)
  }
}

async function redisBump(scope, ip, net, wide) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    // Индексите се строят динамично — не-IP ключ няма мрежови слоеве, значи
    // фиксираните позиции биха чели чужди резултати.
    const p = redis.pipeline();
    const at = {};
    let i = 0;
    const bump = (name, key) => {
      // `NX` е ЗАДЪЛЖИТЕЛНО: без него всяко увеличение подновява срока и
      // броячът никога не изтича — от ПРОЗОРЕЧЕН става КУМУЛАТИВЕН. Бавен
      // нападател (по един провал точно преди изтичане) трупа безкрайно, а
      // решението е „по-лошото от памет и Redis", значи раздутата стойност
      // печели и блокира невинни от същата мрежа. Червен екип, 12.08.2026.
      p.incr(key); p.expire(key, WINDOW_SEC, "NX");
      at[name] = i; i += 2;
    };
    bump("ip", `bf:ip:${scope}:${ip}`);
    if (net) bump("net", `bf:net:${scope}:${net}`);
    if (wide) bump("wide", `bf:wide:${scope}:${wide}`);
    bump("global", `bf:all:${scope}`);

    const res = await p.exec();
    if (!res) return null;
    const num = (name) => (at[name] === undefined ? 0 : Number(res[at[name]]?.[1]) || 0);
    return { ip: num("ip"), net: num("net"), wide: num("wide"), global: num("global") };
  } catch {
    return null;
  }
}

async function redisSetBlock(scope, key, untilMs) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const ttl = Math.max(1, Math.ceil((untilMs - now()) / 1000));
    await redis.set(`bf:blk:${scope}:${key}`, String(untilMs), "EX", ttl);
  } catch { /* тихо — паметта пази същото */ }
}

async function redisClear(scope, ip) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(`bf:ip:${scope}:${ip}`, `bf:blk:${scope}:${ip}`);
  } catch { /* тихо */ }
}

// ─── Публичен интерфейс ─────────────────────────────────────────────────────

/**
 * Текущото състояние, без да го променя.
 * Решението е ПО-ЛОШОТО от паметта и Redis — падналият Redis никога не отключва.
 */
export async function check(scope, key) {
  const t = now();
  const net = subnetOf(key);
  const wide = wideNetOf(key);
  const layers = [key, net, wide].filter(Boolean);
  const memUntil = layers.reduce(
    (max, k) => Math.max(max, state.get(entryKey(scope, k))?.blockedUntil || 0), 0,
  );
  const redisUntil = await redisBlockedUntil(scope, layers);
  const until = Math.max(memUntil, redisUntil);
  return until > t
    ? { blocked: true, retryAfterSec: Math.ceil((until - t) / 1000) }
    : { blocked: false, retryAfterSec: 0 };
}

/** Синхронна проверка само по паметта — за пътища, които не могат да чакат. */
export function checkSync(scope, key) {
  const t = now();
  const until = [key, subnetOf(key), wideNetOf(key)].filter(Boolean).reduce(
    (max, k) => Math.max(max, state.get(entryKey(scope, k))?.blockedUntil || 0), 0,
  );
  return until > t
    ? { blocked: true, retryAfterSec: Math.ceil((until - t) / 1000) }
    : { blocked: false, retryAfterSec: 0 };
}

/** Отбелязва НЕУСПЕШЕН опит по всичките слоеве и връща новото състояние. */
export async function recordFailure(scope, key) {
  prune();
  const t = now();
  const net = subnetOf(key);
  const wide = wideNetOf(key);

  // Памет
  const eIp = getEntry(scope, key);
  eIp.times = eIp.times.filter((ts) => t - ts < WINDOW_MS);
  eIp.times.push(t);

  // Мрежовите слоеве съществуват само за истински IP адреси.
  const eNet = net ? getEntry(scope, net) : null;
  if (eNet) {
    eNet.times = eNet.times.filter((ts) => t - ts < WINDOW_MS);
    eNet.times.push(t);
  }
  const eWide = wide ? getEntry(scope, wide) : null;
  if (eWide) {
    eWide.times = eWide.times.filter((ts) => t - ts < WINDOW_MS);
    eWide.times.push(t);
  }

  // Ново ЗАПИСВАНЕ в одита за НОВ епизод. `logged` пази един ред на епизод
  // (иначе всеки провал пише ред — усилвател на DoS срещу базата), но досега
  // не се въоръжаваше пак: източник, който удря дни наред, оставяше ЕДИН ред
  // за цялата кампания и седмичният преглед (breach-procedure.md, „Detection
  // Sources") виждаше еднократна грешка вместо атака. Изтекла ли е предишната
  // блокировка — следващата е нов епизод. Броят редове остава ограничен от
  // стълбата (блокировките растат до часове), не от обема заявки.
  const rearm = (e) => { if (e && e.logged && e.blockedUntil <= t) e.logged = false; };
  rearm(eIp); rearm(eNet); rearm(eWide);

  const g = (globalFails.get(scope) || []).filter((ts) => t - ts < WINDOW_MS);
  g.push(t);
  globalFails.set(scope, g);

  // Redis (ако е наличен) — броим по-голямото от двете, защото друг процес
  // може вече да е видял част от същата атака.
  const r = await redisBump(scope, key, net, wide);
  const ipCount = Math.max(eIp.times.length, r?.ip || 0);
  const netCount = eNet ? Math.max(eNet.times.length, r?.net || 0) : 0;
  const wideCount = eWide ? Math.max(eWide.times.length, r?.wide || 0) : 0;
  const globalCount = Math.max(g.length, r?.global || 0);

  const underAttack = globalCount >= GLOBAL_ATTACK_THRESHOLD;

  // Слой 1 + 3: източник, със свити прагове при атака
  let step = STEPS.find((s) => ipCount >= s.failures);
  if (!step && underAttack && ipCount >= TIGHTENED_FIRST_STEP.failures) {
    step = TIGHTENED_FIRST_STEP;
  }
  if (step) await applyBlock(scope, key, eIp, t + step.blockMs, ipCount, step.blockMs, "ip");

  // Слой 2: подмрежа
  const netStep = eNet && SUBNET_STEPS.find((s) => netCount >= s.failures);
  if (netStep) await applyBlock(scope, net, eNet, t + netStep.blockMs, netCount, netStep.blockMs, "subnet");

  // Слой 2б: широката мрежа (/16, /48) — хваща въртене в цял блок адреси.
  const wideStep = eWide && WIDE_STEPS.find((s) => wideCount >= s.failures);
  if (wideStep) await applyBlock(scope, wide, eWide, t + wideStep.blockMs, wideCount, wideStep.blockMs, "widenet");

  const until = Math.max(eIp.blockedUntil, eNet?.blockedUntil || 0, eWide?.blockedUntil || 0);
  return until > t
    ? { blocked: true, retryAfterSec: Math.ceil((until - t) / 1000) }
    : { blocked: false, retryAfterSec: 0 };
}

async function applyBlock(scope, key, entry, until, failures, blockMs, kind) {
  // Наказанието само расте в рамките на епизода — нов провал не скъсява
  // вече наложена по-тежка блокировка.
  if (until > entry.blockedUntil) {
    entry.blockedUntil = until;
    await redisSetBlock(scope, key, until);
  }
  if (!entry.logged) {
    entry.logged = true;
    auditBlock(scope, key, failures, blockMs, kind);
  }
}

/**
 * Успешна автентикация — чисти историята ПО ИЗТОЧНИК.
 * Подмрежата НЕ се чисти: един валиден ключ от мрежата не бива да изтрива
 * следата от стотиците провали на съседа му (иначе нападателят би се
 * освобождавал, като редува валиден и невалиден опит).
 */
export async function recordSuccess(scope, key) {
  state.delete(entryKey(scope, key));
  await redisClear(scope, key);
}

/** Express пазач: блокираните се отрязват ПРЕДИ маршрутът да пипне базата. */
export function bruteForceGuard(scope, keyFn = (req) => req.ip) {
  return async function bruteForceMiddleware(req, res, next) {
    try {
      const { blocked, retryAfterSec } = await check(scope, keyFn(req));
      if (blocked) {
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          error: "Too many failed attempts. Try again later.",
          code: "TOO_MANY_FAILED_ATTEMPTS",
          retryAfterSeconds: retryAfterSec,
        });
      }
    } catch {
      /* защитата никога не сваля приложението */
    }
    next();
  };
}

/** Само за тестове. */
export function _resetBruteForceState() {
  state.clear();
  globalFails.clear();
  lastPrune = 0;
}
export function _stateSize() { return state.size; }

export const BRUTE_FORCE_STEPS = STEPS;
export const BRUTE_FORCE_SUBNET_STEPS = SUBNET_STEPS;
export const BRUTE_FORCE_WIDE_STEPS = WIDE_STEPS;
export const BRUTE_FORCE_WINDOW_MS = WINDOW_MS;
export const BRUTE_FORCE_MAX_ENTRIES = MAX_ENTRIES;
export const BRUTE_FORCE_GLOBAL_THRESHOLD = GLOBAL_ATTACK_THRESHOLD;
export const BRUTE_FORCE_TIGHTENED_STEP = TIGHTENED_FIRST_STEP;
