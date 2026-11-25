import type { Prisma } from '@prisma/client';

/**
 * Връзките, които спират, когато причината за тях спре (одит, 4 ноември 2026). Викат се в транзакцията
 * на промяната — или всичко, или нищо.
 */

/**
 * Неизползваните връзки за нова парола спират. Вика се, когато се смени кой управлява акаунта (нова
 * фирма, друга роля), накъде отиват писмата (нов имейл), когато човекът сам смени паролата си и когато
 * акаунтът се деактивира: иначе връзка, дадена по-рано, пак би отворила акаунта (и след повторно
 * активиране в същия ден).
 */
export async function revokeResetLinks(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  await tx.passwordReset.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}

/**
 * Неприетите покани на човек спират — във фирмата (`aziendaId`) или навсякъде. Поканата е обещание на
 * поканилия: деактивиран, излязъл от фирмата или вече не ADMIN в нея, той не кани, и връзките, които е
 * дал, не създават акаунт с роля, която вече не може да даде.
 */
export async function revokeInvitesOf(
  tx: Prisma.TransactionClient,
  invitedById: string,
  aziendaId?: string,
): Promise<void> {
  await tx.invite.updateMany({
    where: {
      invitedById,
      acceptedAt: null,
      revokedAt: null,
      ...(aziendaId ? { aziendaId } : {}),
    },
    data: { revokedAt: new Date() },
  });
}
