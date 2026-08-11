// backend/src/lib/bruteForce.js
// Централна защита срещу налучкване на тайни (brute force / credential stuffing).
//
// ЗАЩО СЪЩЕСТВУВА (одит 11.08.2026): рейт лимитерите броят ВСИЧКИ заявки
// еднакво. Това пази ресурса, но не пази ТАЙНАТА: 200 заявки/мин е нищо за
// нормален клиент и цяло състояние за налучкващ. Стандартът иска дроселиране
// точно на НЕУСПЕШНИТЕ опити, с нарастващо наказание:
//   • NIST SP 800-63B §5.2.2 — ограничи неуспешните опити за автентикация
//   • OWASP ASVS 4.0 V2.2.1 — anti-automation срещу налучкване на пълномощия
//
// Разликата е съществена: легитимният клиент почти никога не бърка тайната си,
// затова праговете тук могат да са агресивни, без да пречат на никого.
//
// РЕШЕНИЯ ПО ДИЗАЙНА (всяко платено с конкретен риск):
//  1. Броим по ПОДАДЕН КЛЮЧ (обикновено IP) в плъзгащ прозорец — не по общ
//     брой, за да не наказваме цял свят заради един нападател.
//  2. Наказанието РАСТЕ (1 мин → 5 → 30 → 24 ч). Бавното нарастване държи
//     цената на налучкването експоненциална, а на човешката грешка — нулева.
//  3. ПАМЕТТА Е ОГРАНИЧЕНА. Нападател, който върти IP-та, иначе би раздул
//     Map-а до OOM — тоест самата защита става DoS вектор. Затова има таван
//     на записите и изхвърляне на най-старите.
//  4. Успех ЧИСТИ брояча — иначе човек, сбъркал няколко пъти преди месец,
//     носи наказанието завинаги.
//  5. Одитният запис се прави ВЕДНЪЖ на блокировка (не на заявка), иначе
//     нападателят би ни карал да пишем в базата вместо себе си.
//  6. Никога не хвърля. Провал в защитата не бива да сваля приложението;
//     решението е „пускай", а инцидентът се логва (fail-open по НАЛИЧНОСТ,
//     защото самата тайна си остава защитена криптографски).

const WINDOW_MS = 15 * 60 * 1000;        // плъзгащ прозорец за броене
const MAX_ENTRIES = 20_000;              // таван на паметта (виж решение 3)
const PRUNE_EVERY_MS = 60 * 1000;

// Стълбата на наказанието — първият праг, който е надхвърлен, печели.
// Подредена от най-тежкия надолу, за да не се налага сортиране при всяка заявка.
const STEPS = [
  { failures: 50, blockMs: 24 * 60 * 60 * 1000 },
  { failures: 20, blockMs: 30 * 60 * 1000 },
  { failures: 10, blockMs: 5 * 60 * 1000 },
  { failures: 5,  blockMs: 60 * 1000 },
];

/** @type {Map<string, {times:number[], blockedUntil:number, logged:boolean, seen:number}>} */
const state = new Map();
let lastPrune = 0;

const now = () => Date.now();
const entryKey = (scope, key) => `${scope}:${key}`;

// Целта при изхвърляне: слизаме под тавана със запас, за да не се пуска
// чистенето на всяка следваща заявка (амортизирана цена).
const EVICT_TO = Math.floor(MAX_ENTRIES * 0.9);

/**
 * Маха изчерпаните записи; при препълване реже най-старите (решение 3).
 *
 * ЦЕНАТА Е КРИТИЧНА, не козметична. Първата версия сортираше ЦЕЛИЯ Map при
 * всяко препълване — тоест точно при разпределена атака (сценарият, срещу
 * който пазим) защитата почваше да гори процесор на всяка заявка и ставаше
 * DoS усилвател. Хванато от собствения тест (таймаут). Сега:
 *   • пълното сканиране е ограничено ВЪВ ВРЕМЕТО (веднъж на минута);
 *   • изхвърлянето при препълване е О(изхвърлени), без сортиране — Map-ът
 *     в JS пази реда на вмъкване, значи итерацията вече върви „най-старите
 *     първо";
 *   • активните блокировки се прескачат, за да не може нападателят да се
 *     освободи, като залее Map-а с нови източници.
 */
function prune() {
  const t = now();

  if (t - lastPrune >= PRUNE_EVERY_MS) {
    lastPrune = t;
    for (const [k, e] of state) {
      const stale = e.blockedUntil <= t
        && (e.times.length === 0 || t - e.times[e.times.length - 1] > WINDOW_MS);
      if (stale) state.delete(k);
    }
  }

  if (state.size <= MAX_ENTRIES) return;

  // Първи проход: режем неблокираните, най-старите първо.
  for (const [k, e] of state) {
    if (state.size <= EVICT_TO) return;
    if (e.blockedUntil > t) continue;         // активна блокировка — пази се
    state.delete(k);
  }

  // Втори проход: ако ВСИЧКО е активно блокирано и пак сме над тавана, режем
  // най-старите въпреки това — паметта не бива да расте неограничено.
  for (const k of state.keys()) {
    if (state.size <= EVICT_TO) return;
    state.delete(k);
  }
}

function getEntry(scope, key) {
  const k = entryKey(scope, key);
  let e = state.get(k);
  if (!e) {
    e = { times: [], blockedUntil: 0, logged: false, seen: now() };
    state.set(k, e);
  }
  e.seen = now();
  return e;
}

/** Одитен запис при ЗАДЕЙСТВАНА блокировка — веднъж, извън горещия път. */
function auditBlock(scope, key, failures, blockMs) {
  Promise.resolve()
    .then(async () => {
      const { prisma } = await import("./prisma.js");
      await prisma.auditLog.create({
        data: {
          actorId: null,
          actorTag: "SYSTEM",
          action: "SECURITY_BRUTE_FORCE_BLOCK",
          // Ключът е псевдонимизиран в metadata — виж коментара в blockedKeyLabel.
          metadata: { scope, key: blockedKeyLabel(key), failures, blockMs },
        },
      });
    })
    .catch(() => { /* одитът никога не бива да чупи защитата */ });
}

/**
 * IP адресът е лични данни (GDPR съобр. 30). За одитната следа държим
 * съкратен вид: достатъчно да разпознаеш мащаба и мрежата на атаката,
 * недостатъчно да проследиш човек. Пълният адрес остава само в паметта
 * на процеса, докато трае блокировката.
 */
function blockedKeyLabel(key) {
  const s = String(key);
  if (s.includes(":")) return s.split(":").slice(0, 3).join(":") + ":…";  // IPv6 префикс
  const parts = s.split(".");
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : "…";
}

/** Текущото състояние без да го променя. */
export function check(scope, key) {
  const e = state.get(entryKey(scope, key));
  if (!e) return { blocked: false, retryAfterSec: 0 };
  const left = e.blockedUntil - now();
  return left > 0
    ? { blocked: true, retryAfterSec: Math.ceil(left / 1000) }
    : { blocked: false, retryAfterSec: 0 };
}

/** Отбелязва НЕУСПЕШЕН опит и връща новото състояние. */
export function recordFailure(scope, key) {
  prune();
  const t = now();
  const e = getEntry(scope, key);
  e.times = e.times.filter((ts) => t - ts < WINDOW_MS);
  e.times.push(t);

  const step = STEPS.find((s) => e.times.length >= s.failures);
  if (step) {
    const until = t + step.blockMs;
    // Наказанието само расте в рамките на един епизод — нов неуспех не
    // скъсява вече наложена по-тежка блокировка.
    if (until > e.blockedUntil) e.blockedUntil = until;
    if (!e.logged) {
      e.logged = true;
      auditBlock(scope, key, e.times.length, step.blockMs);
    }
    return { blocked: true, retryAfterSec: Math.ceil((e.blockedUntil - t) / 1000) };
  }
  return { blocked: false, retryAfterSec: 0 };
}

/** Успешна автентикация — чисти историята (решение 4). */
export function recordSuccess(scope, key) {
  state.delete(entryKey(scope, key));
}

/**
 * Express пазач: блокираните получават 429 + Retry-After ПРЕДИ маршрутът да
 * пипне базата. Така налучкването не струва нищо на нашата инфраструктура.
 */
export function bruteForceGuard(scope, keyFn = (req) => req.ip) {
  return function bruteForceMiddleware(req, res, next) {
    try {
      const { blocked, retryAfterSec } = check(scope, keyFn(req));
      if (blocked) {
        res.setHeader("Retry-After", String(retryAfterSec));
        return res.status(429).json({
          error: "Too many failed attempts. Try again later.",
          code: "TOO_MANY_FAILED_ATTEMPTS",
          retryAfterSeconds: retryAfterSec,
        });
      }
    } catch {
      /* решение 6 — защитата никога не сваля приложението */
    }
    next();
  };
}

/** Само за тестове — чисти състоянието между случаите. */
export function _resetBruteForceState() {
  state.clear();
  lastPrune = 0;
}

/** Само за тестове/диагностика. */
export function _stateSize() {
  return state.size;
}

export const BRUTE_FORCE_STEPS = STEPS;
export const BRUTE_FORCE_WINDOW_MS = WINDOW_MS;
export const BRUTE_FORCE_MAX_ENTRIES = MAX_ENTRIES;
