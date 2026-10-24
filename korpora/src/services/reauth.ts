import type { User } from '@prisma/client';
import { config } from '../config.js';
import { decryptSecret } from '../crypto.js';
import { verifyPassword } from '../auth/password.js';
import { consumeRecoveryCode } from '../auth/recovery.js';
import { isTotpCode, verifyTotp } from '../auth/totp.js';
import { destroyAllSessions } from '../auth/sessions.js';
import type { RequestMeta } from '../http/meta.js';
import { accountLocale } from '../i18n.js';
import { greetingName, mailLocked } from '../mail/templates.js';
import { claimTotpStep } from './auth-common.js';
import { attemptFailed, attemptSucceeded, reserveAttempt } from './lockout.js';
import { phantomFailure } from '../auth/phantom-lock.js';

/**
 * Акаунтът се заключи от грешни потвърждения в отворена сесия: отворена сесия не дава безкрайни опити —
 * всички сесии падат и собственикът получава писмо (за потвържденията, не за кодове при вход).
 */
async function lockedBySession(user: User): Promise<void> {
  await destroyAllSessions(user.id);
  void mailLocked('reauthFailures', user.email, accountLocale(user), greetingName(user));
}

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
  const attempt = await reserveAttempt(user, meta);
  if (!attempt.reserved) {
    if (attempt.lockedNow) await lockedBySession(user);
    return 'error.tooMany';
  }
  if (await check()) {
    await attemptSucceeded(user.id, false);
    return null;
  }
  const failed = await attemptFailed(user, meta);
  // и в брояча на имейла, по който говори входът (auth/phantom-lock.ts): след заключване „входът е спрян“
  phantomFailure(user.email);
  if (failed.lockedNow) await lockedBySession(user);
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
