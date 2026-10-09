import { createHash, randomBytes } from 'node:crypto';
import { LOCK_MS, MAX_FAILED_LOGINS } from './lock.js';

/**
 * Заключването на входа за имейл, за който НЯМА акаунт — в паметта на процеса, по същото правило като за
 * истинския акаунт (services/lockout.ts): MAX_FAILED_LOGINS грешни опита подред заключват за LOCK_MS, а
 * докато трае, опитите не се броят. Така „входът с този имейл е спрян“ излиза еднакво за всеки имейл —
 * заключеният човек с вярната парола научава какво става, а опитващият не научава кой има акаунт.
 *
 * Пази се само хеш на имейла със сол на процеса (не излиза от паметта); при рестарт броенето почва отначало.
 */
const MAX_ENTRIES = 50_000;
const salt = randomBytes(16);

interface Entry {
  count: number;
  lockedUntil: number;
}
const entries = new Map<string, Entry>();

function keyOf(email: string): string {
  return createHash('sha256').update(salt).update(email.trim().toLowerCase()).digest('base64url');
}

export interface PhantomAttempt {
  /** Заключен е — или точно този опит го заключи. */
  locked: boolean;
}

/** Грешен опит за имейл без акаунт: броенето и заключването като за истински акаунт. */
export function phantomFailure(email: string, now: number = Date.now()): PhantomAttempt {
  const key = keyOf(email);
  const entry = entries.get(key) ?? { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil > now) return { locked: true };
  entry.count += 1;
  let locked = false;
  if (entry.count >= MAX_FAILED_LOGINS) {
    entry.count = 0;
    entry.lockedUntil = now + LOCK_MS;
    locked = true;
  }
  // най-скоро ползваните остават отзад: при препълване излиза най-отдавна неползваният
  entries.delete(key);
  entries.set(key, entry);
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest !== undefined) entries.delete(oldest);
  }
  return { locked };
}
