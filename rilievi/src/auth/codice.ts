import { prisma } from '../db.js';
import { decifraSegreto } from './chiavi.js';
import { consumeRecoveryCode } from './recovery.js';
import { isTotpCode, verifyTotp } from './totp.js';

/**
 * Проверката на втория фактор — една за входа (services/login-2fa.ts) и за потвържденията в отворена
 * сесия (services/reauth.ts): код от приложението или резервен код. Опитът се брои от викащия.
 */

export interface UtenteDueFattori {
  id: string;
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
  totpLastStep: number | null;
}

/** Стъпката на кода се „заема“ атомарно: същият код, приет в паралелна заявка, не минава втори път. */
export async function claimTotpStep(userId: string, step: number): Promise<boolean> {
  const claimed = await prisma.user.updateMany({
    where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return claimed.count === 1;
}

/** Какво мина: 'totp', 'recupero' — или null (грешен, повторен или 2FA не е включена). */
export async function verificaCodice(
  user: UtenteDueFattori,
  input: string,
): Promise<'totp' | 'recupero' | null> {
  if (!user.totpEnabledAt || !user.totpSecretEnc) return null;
  const code = input.trim().slice(0, 64);
  if (isTotpCode(code)) {
    const step = verifyTotp(decifraSegreto(user.totpSecretEnc), code, user.totpLastStep);
    return step !== null && (await claimTotpStep(user.id, step)) ? 'totp' : null;
  }
  return (await consumeRecoveryCode(user.id, code)) ? 'recupero' : null;
}
