// Политиката на сесиите — чиста, тества се (docs/security-2fa-settings-spec.md).

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const SESSION_LIMITS = {
  user: { absolute: 30 * DAY, idle: 7 * DAY },
  admin: { absolute: 1 * DAY, idle: 12 * HOUR },
} as const;

/** Колко често се обновява lastSeenAt (да не пишем на всяка заявка). */
export const LAST_SEEN_EVERY_MS = HOUR;
/** Step-up: 2FA код от последните 10 минути. */
export const STEP_UP_MS = 10 * 60 * 1000;

export function sessionExpired(
  session: { createdAt: Date; expiresAt: Date; lastSeenAt: Date },
  admin: boolean,
  now: number = Date.now(),
): boolean {
  const limits = admin ? SESSION_LIMITS.admin : SESSION_LIMITS.user;
  return (
    now - session.lastSeenAt.getTime() > limits.idle ||
    session.expiresAt.getTime() < now ||
    now - session.createdAt.getTime() > limits.absolute
  );
}

export function stepUpFresh(session: { mfaAt: Date | null }, now: number = Date.now()): boolean {
  return !!session.mfaAt && now - session.mfaAt.getTime() <= STEP_UP_MS;
}
