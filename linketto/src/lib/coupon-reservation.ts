// Резервация на промо код (ядро: пари). Ползването се резервира АТОМАРНО при
// старт на checkout-а (условен инкремент под лимита) — иначе N отворени
// сесии с еднократен код дават N продажби с отстъпка. Тук е чистата логика;
// условните SQL записи са в coupon-ledger.ts, моделът за тестовете — в
// __tests__/coupon-model.ts.
import { createHmac, randomBytes } from 'node:crypto';

/** Ключ в metadata на Checkout сесията: id на резервацията (маркер за новия поток). */
export const COUPON_RESERVATION_KEY = 'couponReservationId';

/**
 * Stripe: expires_at е 30 мин–24 ч след създаването (по подразбиране 24 ч).
 * 35 мин = минимумът + резерв за разминаване на часовниците; резервацията не
 * се държи цял ден заради изоставена сесия.
 */
const RESERVED_CHECKOUT_TTL_SECONDS = 35 * 60;

/** HELD по-стара от това е застояла (сесията ѝ отдавна е изтекла) → sweep. */
export const STALE_RESERVATION_MS = 2 * 60 * 60 * 1000;

/**
 * HELD БЕЗ session.id (attachSession се е провалил): сесията може да е платена, а
 * webhook-ът да закъснее — Stripe опитва доставката до 3 дни. Освобождава се
 * едва след това (ревю, L1), иначе платена продажба би върнала мястото на кода.
 */
export const NULL_SESSION_RELEASE_MS = 72 * 60 * 60 * 1000;

/** Таван на едновременно държаните резервации на един код от един клиент. */
export const MAX_HELD_PER_CLIENT = 2;

export function reservedCheckoutExpiresAt(nowMs: number): number {
  return Math.floor(nowMs / 1000) + RESERVED_CHECKOUT_TTL_SECONDS;
}

/**
 * Псевдонимен ключ на клиента за тавана (GDPR: суров IP не се пази). HMAC с
 * тайна → без тайната ключът не се обръща (IPv4 пространството е малко за
 * обикновен хеш). Обвързан с кода → не свързва клиента между кодовете.
 */
export function couponClientKey(ip: string, couponId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${couponId}\n${normalizeClientIp(ip)}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Клиентът за тавана (ревю, M1): IPv6 клиент държи цяла /64 мрежа и сменя адреса
 * си на всяка заявка — ключът е по /64 префикса. IPv4-mapped (::ffff:a.b.c.d) =
 * IPv4; zone id (%eth0) се маха. IPv4 остава по адрес.
 */
export function normalizeClientIp(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/%.*$/, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1]!;
  if (!ip.includes(':')) return ip;
  const [head = '', tail] = ip.split('::', 2) as [string, string | undefined];
  const h = head ? head.split(':') : [];
  const tl = tail === undefined ? [] : tail ? tail.split(':') : [];
  const groups = tail === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - tl.length)).fill('0'), ...tl];
  const prefix = groups.slice(0, 4).map((g) => (parseInt(g || '0', 16) || 0).toString(16));
  while (prefix.length < 4) prefix.push('0');
  return `${prefix.join(':')}::/64`;
}

let processSecret: string | null = null;
/** COUPON_CLIENT_SECRET от env; без него — случайна тайна за живота на процеса. */
export function couponClientSecret(env: Readonly<Record<string, string | undefined>>): string {
  const fromEnv = env.COUPON_CLIENT_SECRET?.trim();
  if (fromEnv) return fromEnv;
  processSecret ??= randomBytes(32).toString('hex');
  return processSecret;
}

export type ReserveOutcome = { id: string } | { refused: 'exhausted' | 'client-limit' };

export interface StaleReservation {
  id: string;
  stripeSessionId: string | null;
  createdAt: Date;
}

/** Порт към базата: всяка операция е един условен (CAS) запис/транзакция. */
export interface CouponLedger {
  /** Условен +1 под лимита + таван на клиента + запис HELD (една транзакция). */
  reserve(couponId: string, clientKey: string | null): Promise<ReserveOutcome>;
  /** Записва session.id в резервацията (само ако е празно). */
  attachSession(reservationId: string, sessionId: string): Promise<void>;
  /** HELD → RELEASED и −1 в една транзакция; false = вече не е HELD (идемпотентно). */
  release(reservationId: string, sessionId?: string | null): Promise<boolean>;
  /** HELD → CONSUMED (без +1); RELEASED → CONSUMED (+1, реално платено); иначе нищо. */
  consume(reservationId: string, sessionId?: string | null): Promise<void>;
  /** Заварени сесии без маркер: условен +1, както досега. */
  countLegacy(couponId: string): Promise<void>;
  /** HELD резервации, създадени преди `before` (за sweep). */
  listStaleHeld(before: Date, limit: number): Promise<StaleReservation[]>;
}

export type ReserveResult<T> =
  | { ok: true; reservationId: string; value: T }
  | { ok: false; reason: 'exhausted' | 'client-limit' }
  | { ok: false; reason: 'create-failed'; error: unknown; releaseError?: unknown };

/**
 * Резервира и чак тогава създава Stripe сесията. Неуспешна резервация → без
 * сесия. Провал при създаването → резервацията се връща; грешката от create
 * се връща на извикващия дори ако и връщането се провали (тогава HELD остава
 * за sweep-а). Успех → session.id се записва в резервацията.
 */
export async function reserveCouponForCheckout<T extends { id: string }>(
  ledger: CouponLedger,
  couponId: string,
  clientKey: string | null,
  create: (reservationId: string) => Promise<T>,
): Promise<ReserveResult<T>> {
  const outcome = await ledger.reserve(couponId, clientKey);
  if ('refused' in outcome) return { ok: false, reason: outcome.refused };
  const reservationId = outcome.id;
  let value: T;
  try {
    value = await create(reservationId);
  } catch (error) {
    // Ако Stripe все пак е създал сесията (timeout), тя никога не стига до
    // купувача; плащане по нея би минало през consume RELEASED → CONSUMED.
    try {
      await ledger.release(reservationId);
    } catch (releaseError) {
      return { ok: false, reason: 'create-failed', error, releaseError };
    }
    return { ok: false, reason: 'create-failed', error };
  }
  try {
    await ledger.attachSession(reservationId, value.id);
  } catch (attachError) {
    // Сесията е жива и купувачът трябва да стигне до нея; webhook-ът пише
    // session.id при уреждане, а sweep-ът покрива останалото.
    console.error(
      '[coupon] attachSession failed:',
      attachError instanceof Error ? attachError.message : 'unknown error',
    );
  }
  return { ok: true, reservationId, value };
}

export type CouponStep =
  | { action: 'consume'; reservationId: string }
  | { action: 'release'; reservationId: string }
  | { action: 'count-legacy'; couponId: string }
  | { action: 'none' };

/**
 * Какво прави webhook-ът с кода при събитие по магазинна сесия.
 * - completed/async_succeeded (платено): с маркер → consume; без маркер →
 *   досегашното броене, само при първия запис на покупката.
 * - expired/async_payment_failed: с маркер → release; без маркер → нищо
 *   (заварената сесия не е резервирала).
 */
export function couponStepForEvent(
  eventType: string,
  metadata: Readonly<Record<string, string>> | null | undefined,
  opts: { paid: boolean; firstRecord: boolean },
): CouponStep {
  const reservationId = metadata?.[COUPON_RESERVATION_KEY] ?? '';
  const couponId = metadata?.couponId ?? '';
  switch (eventType) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      if (!opts.paid) return { action: 'none' };
      if (reservationId) return { action: 'consume', reservationId };
      if (couponId && opts.firstRecord) return { action: 'count-legacy', couponId };
      return { action: 'none' };
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed':
      return reservationId ? { action: 'release', reservationId } : { action: 'none' };
    default:
      return { action: 'none' };
  }
}

export async function applyCouponStep(
  ledger: CouponLedger,
  step: CouponStep,
  sessionId: string,
): Promise<void> {
  switch (step.action) {
    case 'consume':
      await ledger.consume(step.reservationId, sessionId);
      return;
    case 'release':
      await ledger.release(step.reservationId, sessionId);
      return;
    case 'count-legacy':
      await ledger.countLegacy(step.couponId);
      return;
    case 'none':
      return;
  }
}

// ── Sweep на застояли резервации ────────────────────────────────────────

export interface StaleSessionView {
  status: string | null;
  payment_status: string;
}

export type StaleAction = 'release' | 'consume' | 'keep';

/**
 * Застояла HELD (по-стара от STALE_RESERVATION_MS, т.е. сесията ѝ отдавна е
 * изтекла): без сесия → release (create се е провалил/сринал); expired →
 * release; complete + paid → consume (пропуснат webhook); иначе keep (напр.
 * отложено плащане в обработка — решава async_payment_* събитието).
 */
export function staleReservationAction(session: StaleSessionView | null): StaleAction {
  if (!session) return 'release';
  if (session.status === 'expired') return 'release';
  if (session.status === 'complete' && session.payment_status === 'paid') return 'consume';
  return 'keep';
}

export interface SweepResult {
  id: string;
  action: StaleAction;
  error?: string;
}

/**
 * Идемпотентно (release/consume са CAS). Грешка от Stripe → keep (fail-safe:
 * не освобождаваме без доказателство, че сесията е мъртва).
 */
export async function sweepStaleReservations(
  ledger: CouponLedger,
  getSession: (sessionId: string) => Promise<StaleSessionView>,
  opts: { now: Date; apply: boolean; maxAgeMs?: number; limit?: number },
): Promise<SweepResult[]> {
  const before = new Date(opts.now.getTime() - (opts.maxAgeMs ?? STALE_RESERVATION_MS));
  const stale = await ledger.listStaleHeld(before, opts.limit ?? 500);
  const results: SweepResult[] = [];
  for (const r of stale) {
    let session: StaleSessionView | null = null;
    if (r.stripeSessionId) {
      try {
        session = await getSession(r.stripeSessionId);
      } catch (error) {
        results.push({
          id: r.id,
          action: 'keep',
          error: error instanceof Error ? error.message : 'unknown error',
        });
        continue;
      }
    }
    // Без сесия: пазим до NULL_SESSION_RELEASE_MS (webhook-ът на платена сесия може да закъснее).
    const tooFresh =
      !r.stripeSessionId &&
      opts.now.getTime() - r.createdAt.getTime() <= NULL_SESSION_RELEASE_MS;
    const action = tooFresh ? 'keep' : staleReservationAction(session);
    // Грешка от базата при един ред не спира sweep-а за останалите (ревю, L2).
    try {
      if (opts.apply) {
        if (action === 'release') await ledger.release(r.id, r.stripeSessionId);
        if (action === 'consume') await ledger.consume(r.id, r.stripeSessionId);
      }
      results.push({ id: r.id, action });
    } catch (error) {
      results.push({ id: r.id, action, error: error instanceof Error ? error.message : 'unknown error' });
    }
  }
  return results;
}
