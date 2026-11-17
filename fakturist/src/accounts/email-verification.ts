import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { sha256Hex } from '../crypto.js';
import {
  AccountTokenError,
  findOpen,
  issueToken,
  lockUser,
  MAX_MAILS_PER_HOUR,
  sentInLastHour,
  TOKEN,
} from './tokens.js';

/** Потвърждението на имейла (връзка от писмо, 7 дни) — общите части на връзките са в tokens.ts. */

/** „Изпрати отново“ връзката за потвърждение (вписан човек). */
export async function requestEmailVerification(
  userId: string,
  now: Date = new Date(),
): Promise<'queued' | 'already' | 'rateLimited'> {
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, userId);
    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (user.emailVerifiedAt) return 'already' as const;
    if ((await sentInLastHour(tx, userId, 'EMAIL_VERIFY', now)) >= MAX_MAILS_PER_HOUR) {
      return 'rateLimited' as const;
    }
    await issueToken(tx, { userId, email: user.email, purpose: 'EMAIL_VERIFY', now });
    return 'queued' as const;
  });
}

/** Използвана връзка за потвърждение на имейл, който още е на профила и е потвърден — или null. */
async function alreadyVerified(token: string): Promise<{ userId: string } | null> {
  if (!TOKEN.test(token)) return null;
  const row = await prisma.userToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      userId: true,
      purpose: true,
      email: true,
      usedAt: true,
      user: { select: { email: true, emailVerifiedAt: true, disabledAt: true } },
    },
  });
  if (!row || row.purpose !== 'EMAIL_VERIFY' || !row.usedAt) return null;
  if (row.user.disabledAt || row.user.email !== row.email || !row.user.emailVerifiedAt) return null;
  return { userId: row.userId };
}

/** Връзката от писмото: имейлът е потвърден. Без вход — притежанието на връзката е доказателството. */
export async function verifyEmail(
  token: string,
  now: Date = new Date(),
): Promise<{ userId: string }> {
  const open = await findOpen(token, 'EMAIL_VERIFY', now);
  if (!open) {
    // Скенерите на пощата (Safe Links и подобни) отварят връзките преди човека: вече използвана връзка
    // за имейл, който е потвърден и още е на профила, пак показва „потвърден“ — нищо не се променя.
    const done = await alreadyVerified(token);
    if (done) return done;
    throw new AccountTokenError('invalid');
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.userToken.updateMany({
      where: { id: open.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new AccountTokenError('invalid');
    const updated = await tx.user.updateMany({
      where: { id: open.userId, email: open.email },
      data: { emailVerifiedAt: now },
    });
    if (updated.count !== 1) throw new AccountTokenError('invalid');
    await audit(tx, {
      actorId: open.userId,
      action: 'auth.email.verified',
      targetType: 'User',
      targetId: open.userId,
    });
  });
  return { userId: open.userId };
}
