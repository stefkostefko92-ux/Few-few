import type { User } from '@prisma/client';
import { config } from '../config.js';
import { decryptSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { verifyPassword } from '../auth/password.js';
import { consumeRecoveryCode } from '../auth/recovery.js';
import { isTotpCode, verifyTotp } from '../auth/totp.js';
import type { RequestMeta } from '../http/meta.js';
import { claimTotpStep } from './auth-common.js';
import { lockOnReauthFailure, MAX_FAILED_LOGINS } from './lockout.js';

/**
 * Повторно удостоверяване за чувствително действие (смяна на парола или имейл, 2FA, изтриване). Опитът
 * се заема атомно в брояча на грешките ПРЕДИ проверката: паралелни заявки от една (може би открадната)
 * сесия не получават повече от MAX_FAILED_LOGINS опита, а заключен акаунт не се проверява изобщо. При
 * успех заетият опит се връща; при неуспех остава като грешка и на петата акаунтът се заключва.
 *
 * Връща null, ако проверката минава, иначе ключа на съобщението: `wrongKey` или „изчакайте“ (акаунтът е
 * заключен или опитите са заети от паралелни заявки).
 */
async function reauth(
  user: User,
  meta: RequestMeta,
  wrongKey: string,
  check: () => Promise<boolean>,
): Promise<string | null> {
  const reserved = await prisma.user.updateMany({
    where: {
      id: user.id,
      failedLogins: { lt: MAX_FAILED_LOGINS },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: new Date() } }],
    },
    data: { failedLogins: { increment: 1 } },
  });
  if (reserved.count === 0) return 'error.tooMany';
  if (await check()) {
    await prisma.user.updateMany({
      where: { id: user.id, failedLogins: { gt: 0 } },
      data: { failedLogins: { decrement: 1 } },
    });
    return null;
  }
  await lockOnReauthFailure(user, meta);
  return wrongKey;
}

export function reauthPassword(
  user: User,
  password: string,
  meta: RequestMeta,
): Promise<string | null> {
  return reauth(user, meta, 'flash.wrongPassword', () =>
    verifyPassword(password, user.passwordHash),
  );
}

/** Код от приложението или резервен код. Без включена 2FA няма какво да се проверява. */
export async function reauthCode(
  user: User,
  input: string,
  meta: RequestMeta,
): Promise<string | null> {
  const secretEnc = user.totpSecretEnc;
  if (!user.totpEnabledAt || !secretEnc) return null;
  return reauth(user, meta, 'flash.wrongCode', async () => {
    const code = input.trim();
    if (!isTotpCode(code)) return consumeRecoveryCode(user.id, code);
    const step = verifyTotp(decryptSecret(secretEnc, config().ENC_KEY), code, user.totpLastStep);
    return step !== null && claimTotpStep(user.id, step);
  });
}
