// Автентикация: scrypt хеш на паролата + HMAC-подписани сесийни токени (stateless).
// Нула зависимости — само node:crypto. Времево-константни сравнения навсякъде.
import crypto from 'node:crypto';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return `scrypt:${SCRYPT.N}:${SCRYPT.r}:${SCRYPT.p}:${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split(':');
    if (scheme !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

// Токен: base64url(JSON{u, exp, ab, g, jti, n}) + "." + HMAC.
//   exp — кога изтича ТАЗИ бисквитка (плъзгащ се, подновява се при активност)
//   ab  — абсолютен таван: докъдето сесията може да се подновява изобщо
//   g   — поколение: увеличиш ли го в конфига, ВСИЧКИ издадени токени падат
//         (изход от всички устройства, смяна на парола/2FA)
//   jti — идентификатор на сесията (за списък и поименна отмяна)
export function createSession(secret, user, ttlMs, { absoluteMs = ttlMs, gen = 0, jti } = {}) {
  const now = Date.now();
  const payload = Buffer.from(
    JSON.stringify({
      u: user,
      exp: now + ttlMs,
      ab: now + absoluteMs,
      g: gen,
      jti: jti || crypto.randomBytes(9).toString('base64url'),
      n: crypto.randomBytes(8).toString('hex'),
    })
  ).toString('base64url');
  return `${payload}.${hmac(secret, payload)}`;
}

export function verifySession(secret, token, { gen = 0, revoked = null } = {}) {
  if (typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(secret, payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Date.now();
    if (!data.exp || now > data.exp) return null; // бездействие
    if (data.ab && now > data.ab) return null; // абсолютен таван
    if ((data.g || 0) !== gen) return null; // отменено поколение
    if (revoked && data.jti && revoked.has(data.jti)) return null; // поименно отменена
    return { user: data.u, exp: data.exp, absolute: data.ab, jti: data.jti, gen: data.g || 0 };
  } catch {
    return null;
  }
}

export function tokenEqual(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  return ba.length > 0 && ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ── Лимитер срещу налучкване ─────────────────────────────────────────────────
//
// Брои ОПИТИ, не провали, и брои ПРЕДИ проверката. Разликата не е стилистична:
// старата версия проверяваше квотата на входа, а увеличаваше брояча чак СЛЕД
// `await readJson` + scrypt. Между двете има точка на изчакване, тоест сто
// паралелни заявки минават гейта, преди първата да е отчетена — лимитът „5"
// на практика ставаше „5 + колкото връзки отвориш наведнъж". Тук проверката и
// увеличаването са в един синхронен блок, без нищо между тях.
//
// Вторият пласт е ГЛОБАЛЕН. Брояч само по IP не вижда разпределена атака: с
// хиляда адреса квотата от 5 става 5000 на прозорец. Затова има и общ брояч,
// който НЕ блокира (това би бил безплатен начин да заключиш собственика отвън),
// а въвежда нарастващо забавяне. Налучкването става безсмислено бавно, а човек
// с вярната парола губи най-много няколко секунди.
const FAIL_LIMIT = 5;
const FAIL_WINDOW_MS = 10 * 60 * 1000;
const FAIL_MAX_KEYS = 5000; // таван на картата — иначе подправени IP-та я растат без край
// Праг, над който общият брой провали (от ВСИЧКИ адреси) започва да бави.
const GLOBAL_SOFT = 20;
const GLOBAL_DELAY_STEP_MS = 250;
const GLOBAL_DELAY_MAX_MS = 5000;
// ДВА глобални брояча, защото отговарят на различни въпроси.
//   `globalFails` — опити, които са МИНАЛИ гейта, тоест стрували са ни работа.
//                   Той движи забавянето: бави се това, което реално товари.
//   `observed`    — всичко ВИДЯНО, включително отказаното. Той движи алармата.
// Разликата е важна: ако алармата се хранеше само от първия, упорит нападач от
// един адрес щеше да ИЗЧЕЗНЕ от радара точно след като лимитерът го спре — а
// това е моментът, в който човек най-много иска да знае. Обратното също е вярно:
// ако забавянето се хранеше от втория, нападателят щеше да може да наказва
// собственика с чужди отказани опити.
const globalFails = [];
const observed = [];
const fails = new Map();

function pruneGlobal() {
  const cut = Date.now() - FAIL_WINDOW_MS;
  while (globalFails.length && globalFails[0] < cut) globalFails.shift();
  while (observed.length && observed[0] < cut) observed.shift();
}

// Колко да се забави ОТГОВОРЪТ при текущото ниво на шум. Нула при спокойствие.
export function globalDelayMs() {
  pruneGlobal();
  const over = globalFails.length - GLOBAL_SOFT;
  if (over <= 0) return 0;
  return Math.min(over * GLOBAL_DELAY_STEP_MS, GLOBAL_DELAY_MAX_MS);
}

// Състояние за таблото/алармите: „под атака ли съм в момента".
export function bruteForceState() {
  pruneGlobal();
  return { recentFails: observed.length, delayMs: globalDelayMs(), addresses: fails.size };
}

// Изхвърля изтеклите записи и налага таван (най-старите падат първи).
function pruneFails() {
  const now = Date.now();
  for (const [ip, times] of fails) {
    const recent = times.filter((t) => now - t < FAIL_WINDOW_MS);
    if (recent.length) fails.set(ip, recent);
    else fails.delete(ip);
  }
  if (fails.size > FAIL_MAX_KEYS) {
    const excess = fails.size - FAIL_MAX_KEYS;
    let i = 0;
    for (const ip of fails.keys()) {
      if (i++ >= excess) break;
      fails.delete(ip);
    }
  }
}

export function loginAllowed(ip) {
  const rec = fails.get(ip);
  if (!rec) return true;
  const recent = rec.filter((t) => Date.now() - t < FAIL_WINDOW_MS);
  fails.set(ip, recent);
  return recent.length < FAIL_LIMIT;
}

// Заема слот АТОМАРНО: проверява и веднага записва, в един синхронен блок.
// Върнатото `false` значи „квотата е изчерпана" — обаждащият спира веднага.
// Слотът се освобождава само при УСПЕХ (`loginSucceeded`); при провал остава
// зает, защото точно това е опитът, който броим.
export function attemptStart(ip) {
  const now = Date.now();
  const recent = (fails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  observed.push(now);
  if (recent.length >= FAIL_LIMIT) {
    fails.set(ip, recent);
    pruneGlobal();
    return false; // отказан, но ВИДЯН — иначе упоритият нападач изчезва от радара
  }
  recent.push(now);
  fails.set(ip, recent);
  globalFails.push(now);
  pruneGlobal();
  pruneFails();
  return true;
}

export function loginFailed(ip) {
  const rec = fails.get(ip) || [];
  rec.push(Date.now());
  fails.set(ip, rec);
  globalFails.push(Date.now());
  observed.push(Date.now());
  pruneGlobal();
  pruneFails();
}

// Само за тестове — нулира състоянието на лимитера.
export function _resetLoginLimiter() {
  fails.clear();
  globalFails.length = 0;
  observed.length = 0;
  bearerFails.clear();
}

// ── Bearer (peerToken) — най-тихата дупка ────────────────────────────────────
//
// Сравнението е времево-константно, но НЯМА брояч: всяка заявка към който и да
// е `/api/*` с грешен `Authorization: Bearer` беше безплатен опит. Неограничено
// налучкване на токена, който дава пълен достъп („user: peer"), без нито един
// ред в одита и без аларма — тоест атаката е не просто възможна, а НЕВИДИМА.
// Дължината на токена я прави непрактична, но „непрактично" не е „затворено", а
// и слаб токен, сложен на ръка, отваря вратата напълно.
const BEARER_LIMIT = 10;
const bearerFails = new Map();

export function bearerAllowed(ip) {
  const now = Date.now();
  const recent = (bearerFails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  bearerFails.set(ip, recent);
  return recent.length < BEARER_LIMIT;
}

export function bearerFailed(ip) {
  const now = Date.now();
  const recent = (bearerFails.get(ip) || []).filter((t) => now - t < FAIL_WINDOW_MS);
  recent.push(now);
  bearerFails.set(ip, recent);
  globalFails.push(now);
  observed.push(now);
  pruneGlobal();
  if (bearerFails.size > FAIL_MAX_KEYS) {
    for (const k of bearerFails.keys()) {
      bearerFails.delete(k);
      if (bearerFails.size <= FAIL_MAX_KEYS) break;
    }
  }
}

export function loginSucceeded(ip) {
  fails.delete(ip);
}
