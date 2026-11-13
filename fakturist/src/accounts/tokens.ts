import type { Prisma, UserTokenPurpose } from '@prisma/client';
import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { randomToken, sha256Hex } from '../crypto.js';
import { encryptUserToken } from '../auth/keys.js';
import { hashPassword, passwordProblem, PASSWORD_MAX_LENGTH } from '../auth/password.js';
import { DAY, HOUR } from '../time.js';

/**
 * Еднократните връзки по имейл (SPEC 36–38): „Забравена парола“ и потвърждение на имейла. Токенът е 32
 * случайни байта (base64url, 43 знака); в базата е само SHA-256, а в опашката с писма — шифрован и вързан
 * с id-то на реда (src/auth/keys.ts). Връзката е еднократна: заема се с условен UPDATE.
 */
export const TOKEN_TTL: Record<UserTokenPurpose, number> = {
  PASSWORD_RESET: HOUR,
  EMAIL_VERIFY: 7 * DAY,
};

/** Писма от един вид за един профил в рамките на час — повече не тръгват (пощата е и чужда кутия). */
export const MAX_MAILS_PER_HOUR = 3;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Видът писмо в опашката (src/mail/outbox.ts) за всяко предназначение. */
export const MAIL_KIND: Record<UserTokenPurpose, string> = {
  PASSWORD_RESET: 'account.passwordReset',
  EMAIL_VERIFY: 'account.verifyEmail',
};

export class AccountTokenError extends Error {
  constructor(readonly code: 'invalid' | `password.${string}`) {
    super(code);
  }
}

type Tx = Prisma.TransactionClient;

/** Заключва профила — броенето на писмата и новата връзка не се разминават при едновременни заявки. */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

/**
 * Нова връзка + писмото ѝ в опашката, в транзакцията на извикващия (регистрацията я ползва за своето
 * писмо). Профилът трябва да е заключен, ако се брои таванът.
 */
export async function issueToken(
  tx: Tx,
  input: { userId: string; email: string; purpose: UserTokenPurpose; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const token = randomToken(32);
  const row = await tx.userToken.create({
    data: {
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: sha256Hex(token),
      email: input.email,
      expiresAt: new Date(now.getTime() + TOKEN_TTL[input.purpose]),
      createdAt: now,
    },
  });
  await tx.notification.create({
    data: {
      kind: MAIL_KIND[input.purpose],
      toEmail: input.email,
      payload: { tokenId: row.id, tokenEnc: encryptUserToken(token, row.id) },
    },
  });
}

/**
 * Затваря неизползваните връзки за парола на профила и писмата им, които още чакат в опашката — иначе
 * опашката би опитвала да прати отменена връзка и накрая би я отбелязала като неуспешна.
 */
async function revokeResetLinks(tx: Tx, userId: string, now: Date): Promise<void> {
  const open = await tx.userToken.findMany({
    where: { userId, purpose: 'PASSWORD_RESET', usedAt: null },
    select: { id: true },
  });
  if (open.length === 0) return;
  await tx.userToken.updateMany({
    where: { id: { in: open.map((row) => row.id) } },
    data: { usedAt: now },
  });
  await tx.notification.updateMany({
    where: {
      kind: MAIL_KIND.PASSWORD_RESET,
      status: 'PENDING',
      OR: open.map((row) => ({ payload: { path: ['tokenId'], equals: row.id } })),
    },
    data: { status: 'FAILED', lastError: 'Заменена с нова връзка.' },
  });
}

async function sentInLastHour(
  tx: Tx,
  userId: string,
  purpose: UserTokenPurpose,
  now: Date,
): Promise<number> {
  return tx.userToken.count({
    where: { userId, purpose, createdAt: { gt: new Date(now.getTime() - HOUR) } },
  });
}

/**
 * „Забравена парола“. Резултатът е за тестовете и одита — страницата казва едно и също на всички
 * (не издава кой имейл има профил). Нова връзка отменя неизползваните стари.
 */
export async function requestPasswordReset(
  rawEmail: string,
  now: Date = new Date(),
): Promise<'queued' | 'ignored' | 'rateLimited'> {
  const email = rawEmail.trim().toLowerCase();
  if (email.length === 0 || email.length > 254) return 'ignored';
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, disabledAt: true },
  });
  if (!user || user.disabledAt) return 'ignored';
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    if ((await sentInLastHour(tx, user.id, 'PASSWORD_RESET', now)) >= MAX_MAILS_PER_HOUR) {
      return 'rateLimited' as const;
    }
    await revokeResetLinks(tx, user.id, now);
    await issueToken(tx, { userId: user.id, email, purpose: 'PASSWORD_RESET', now });
    await audit(tx, {
      actorId: user.id,
      action: 'auth.password.resetRequested',
      targetType: 'User',
      targetId: user.id,
    });
    return 'queued' as const;
  });
}

/** Отворена връзка: същото предназначение, неизползвана, неизтекла, за текущия имейл на профила. */
async function findOpen(
  token: string,
  purpose: UserTokenPurpose,
  now: Date,
): Promise<{ id: string; userId: string; email: string } | null> {
  if (!TOKEN.test(token)) return null;
  const row = await prisma.userToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      id: true,
      userId: true,
      purpose: true,
      email: true,
      usedAt: true,
      expiresAt: true,
      user: { select: { email: true, disabledAt: true } },
    },
  });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt <= now) return null;
  if (row.user.disabledAt || row.user.email !== row.email) return null;
  return { id: row.id, userId: row.userId, email: row.email };
}

/** За страницата „Нова парола“: имейлът, за който е връзката, или null. */
export async function findPasswordReset(
  token: string,
  now: Date = new Date(),
): Promise<{ email: string } | null> {
  const open = await findOpen(token, 'PASSWORD_RESET', now);
  return open ? { email: open.email } : null;
}

/**
 * Новата парола. Слабата парола се отказва, преди връзката да се заеме (не я изгаря). Успехът прекратява
 * всички сесии на профила (и откраднатата), потвърждава имейла — връзката е стигнала до него — и
 * затваря другите връзки за парола.
 */
export async function resetPassword(input: {
  token: string;
  password: string;
  now?: Date;
}): Promise<{ userId: string }> {
  const now = input.now ?? new Date();
  const open = await findOpen(input.token, 'PASSWORD_RESET', now);
  if (!open) throw new AccountTokenError('invalid');
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: open.userId },
    select: { email: true, name: true },
  });
  const problem =
    input.password.length > PASSWORD_MAX_LENGTH
      ? 'tooLong'
      : passwordProblem(input.password, [user.email, user.name]);
  if (problem) throw new AccountTokenError(`password.${problem}`);
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.userToken.updateMany({
      where: { id: open.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw new AccountTokenError('invalid');
    await revokeResetLinks(tx, open.userId, now);
    const updated = await tx.user.updateMany({
      where: { id: open.userId, email: open.email, disabledAt: null },
      data: { passwordHash, mustChangePassword: false },
    });
    if (updated.count !== 1) throw new AccountTokenError('invalid');
    await tx.user.updateMany({
      where: { id: open.userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: open.userId } });
    await audit(tx, {
      actorId: open.userId,
      action: 'auth.password.reset',
      targetType: 'User',
      targetId: open.userId,
    });
  });
  return { userId: open.userId };
}

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
