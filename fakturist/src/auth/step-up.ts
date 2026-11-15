import type { Prisma } from '@prisma/client';
import { decryptTotpSecret } from './keys.js';
import { verifyTotp } from './totp.js';

/**
 * Потвърждение с втория фактор за опасно действие (мастър роля): кодът от приложението на действащия.
 * Стъпката се записва условно — същият код не минава втори път (и при едновременни заявки), както при
 * входа (src/routes/auth.ts). Връща false при грешен код или без 2FA.
 */
export async function consumeTotpCode(
  tx: Prisma.TransactionClient,
  userId: string,
  code: string,
): Promise<boolean> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, totpSecretEnc: true, totpEnabledAt: true, totpLastStep: true },
  });
  if (!user?.totpSecretEnc || !user.totpEnabledAt) return false;
  const step = verifyTotp(decryptTotpSecret(user.totpSecretEnc, user.id), code, user.totpLastStep);
  if (step === null) return false;
  const accepted = await tx.user.updateMany({
    where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
    data: { totpLastStep: step },
  });
  return accepted.count === 1;
}
