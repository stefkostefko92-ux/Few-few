import 'server-only';
import { prisma } from '@/lib/db';
import { needsReseal, open as openSealed, seal } from '@/lib/secret-box';

/**
 * TOTP секретът на потребителя. Ротация на SETTINGS_KEY (старият →
 * SETTINGS_KEY_OLD): прочетен със стария ключ → шифрова се с новия, за да не
 * изгуби 2FA, когато старият ключ се махне (Кодаджията L2). Условен запис —
 * само ако никой не го е сменил междувременно.
 */
export async function openTotpSecret(user: { id: string; totpSecretSealed: string | null }): Promise<string | null> {
  if (!user.totpSecretSealed) return null;
  const secret = openSealed(user.totpSecretSealed, `totp:${user.id}`);
  if (secret && needsReseal(user.totpSecretSealed)) {
    await prisma.user
      .updateMany({
        where: { id: user.id, totpSecretSealed: user.totpSecretSealed },
        data: { totpSecretSealed: seal(secret, `totp:${user.id}`) },
      })
      .catch(() => undefined);
  }
  return secret;
}
