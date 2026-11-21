// Чиста логика на лимитера (без next/headers) — тества се отделно.
// В паметта на процеса; виж rate-limit.ts за употребата и ограниченията.

interface Bucket {
  hits: number[];
  /** Прозорецът, с който последно е ползвана кофата — за правилно чистене. */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;
// Критичните ключове (вход, регистрация, 2FA, общите тавани) НЕ се изхвърлят
// при наводняване с нови ключове — иначе публичен endpoint с ключ от нападателя
// нулира защитата на входа и AI тавана (червен екип). Те имат собствен,
// много по-висок таван (нападателят плаща bcrypt/лимит за всеки).
const MAX_CRITICAL_KEYS = 200_000;
const CRITICAL = /^(login-|register|mfa|2fa|stepup|reset-|verify-)|:global$/;

export function isCriticalKey(key: string): boolean {
  return CRITICAL.test(key);
}

/**
 * IP за ключ на лимит: IPv4 — целият адрес; IPv6 — мрежата /64 (един абонат
 * обикновено има цяла /64 — иначе всеки адрес от нея е „нов“ лимит).
 */
export function ipBucket(ip: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(':')) return ip;
  const [head = '', tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = ip.includes('::') ? Array(Math.max(0, 8 - left.length - right.length)).fill('0') : [];
  const full = [...left, ...fill, ...right].slice(0, 8);
  if (full.length < 4 || full.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return ip;
  return `${full.slice(0, 4).map((part) => part.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}
// Изтеклите кофи (с IP в ключа) се чистят поне веднъж в минута — политиката
// обещава, че IP-то за лимита стои в паметта само докато трае прозорецът.
const PRUNE_EVERY_MS = 60_000;
let lastPrune = 0;

/** Само за тестове. */
export function resetRateLimits(): void {
  buckets.clear();
  lastPrune = 0;
}

/** Само за тестове: брой кофи в паметта. */
export function rateLimitKeyCount(): number {
  return buckets.size;
}

/** true = заявката е позволена (и се брои); false = над лимита. */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key) ?? { hits: [], windowMs };
  bucket.windowMs = windowMs;
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  if (buckets.size > MAX_KEYS || now - lastPrune >= PRUNE_EVERY_MS) prune(now);
  return true;
}

/** Над лимита ли е ключът — БЕЗ да брои удар (за „броим само неуспехите“). */
export function isRateLimited(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);
  if (!bucket) return false;
  return bucket.hits.filter((t) => now - t < windowMs).length >= max;
}

// Чистим според ПРОЗОРЕЦА НА САМАТА КОФА — иначе 10-минутна заявка би
// изтрила 1-часовите кофи на анкетите и би нулирала броячите им точно при
// атака (одит: Качествения т. 4).
function prune(now: number): void {
  lastPrune = now;
  for (const [k, b] of buckets) {
    const last = b.hits[b.hits.length - 1];
    if (last === undefined || now - last >= b.windowMs) buckets.delete(k);
  }
  // Крайна защита: при атака с безкрайно нови ключове изхвърляме най-старите
  // НЕкритични; критичните имат отделен (по-висок) таван.
  let normal = 0;
  let critical = 0;
  for (const k of buckets.keys()) {
    if (isCriticalKey(k)) critical += 1;
    else normal += 1;
  }
  if (normal > MAX_KEYS) {
    for (const k of buckets.keys()) {
      if (isCriticalKey(k)) continue;
      buckets.delete(k);
      normal -= 1;
      if (normal <= MAX_KEYS / 2) break;
    }
  }
  if (critical > MAX_CRITICAL_KEYS) {
    for (const k of buckets.keys()) {
      if (!isCriticalKey(k)) continue;
      buckets.delete(k);
      critical -= 1;
      if (critical <= MAX_CRITICAL_KEYS / 2) break;
    }
  }
}

/**
 * IP на клиента по хедърите (чисто — тества се). Моделът на деплоя (DEPLOY.md):
 * Cloudflare отпред, а сървърът приема САМО заявки от Cloudflare → първо
 * `CF-Connecting-IP` (Cloudflare винаги го презаписва). Без Cloudflare —
 * `X-Real-IP`, който Nginx презаписва; накрая ПОСЛЕДНИЯТ елемент на XFF
 * (добавен от нашия proxy; първият е подправим).
 */
export function pickClientIp(get: (name: string) => string | null | undefined): string {
  const cf = get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const real = get('x-real-ip')?.trim();
  if (real) return real;
  const parts = (get('x-forwarded-for') ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1]! : 'unknown';
}
