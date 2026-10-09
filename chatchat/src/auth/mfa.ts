import { decryptSecret } from '../crypto.js';
import { totpStep, verifyTotp } from './totp.js';

/**
 * Помощници за втория фактор: пазач срещу повторно използван код и проверка на кода.
 * Издателят в приложението за удостоверяване (Google Authenticator, Aegis…) е „ChatChat“.
 */

export const MFA_ISSUER = 'ChatChat';

/**
 * Последната приета TOTP стъпка на човек — прихванат код не минава втори път в прозореца си.
 * В паметта на процеса (приложението е един процес зад Nginx); при рестарт се губи, което
 * отваря най-много ±1 стъпка (≤ 90 s) за вече използван код. Колона в базата — при няколко копия.
 */
export class TotpReplayGuard {
  private readonly last = new Map<string, number>();

  lastStep(userId: string): number | null {
    return this.last.get(userId) ?? null;
  }

  accept(userId: string, step: number): void {
    const prev = this.last.get(userId);
    if (prev === undefined || step > prev) this.last.set(userId, step);
    // Стари стъпки не пазят нищо (прозорецът е ±1) — таванът не позволява растеж без край.
    if (this.last.size > 10_000) {
      const floor = totpStep(Date.now() / 1000) - 2;
      for (const [id, s] of this.last) if (s < floor) this.last.delete(id);
    }
  }

  forget(userId: string): void {
    this.last.delete(userId);
  }
}

/**
 * Проверява код срещу шифрованата тайна. Повреден запис или грешен ключ → false (fail-closed),
 * не 500 — човекът вижда „грешен код“, администраторът нулира MFA.
 */
export function checkTotp(
  key: Buffer,
  replay: TotpReplayGuard,
  user: { id: string; totpSecretEnc: string | null },
  code: string,
): boolean {
  if (!user.totpSecretEnc) return false;
  let secret: string;
  try {
    secret = decryptSecret(user.totpSecretEnc, key);
  } catch {
    return false;
  }
  const step = verifyTotp(secret, code, replay.lastStep(user.id));
  if (step === null) return false;
  replay.accept(user.id, step);
  return true;
}
