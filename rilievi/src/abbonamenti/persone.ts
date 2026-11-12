import type { Prisma } from '@prisma/client';
import { statoAbbonamento } from './regole.js';

/**
 * Таванът на хората по нивото на абонамента (#31 — до 10, до 25, над 25): заетите места са хората на фирмата с
 * активен акаунт и живите ѝ покани (иначе таванът се заобикаля с много покани наведнъж). Броят се в
 * транзакцията на новата покана, с реда на фирмата заключен — две покани едновременно не взимат едно място.
 */
export async function postoLibero(
  tx: Prisma.TransactionClient,
  aziendaId: string,
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  await tx.$queryRaw`SELECT id FROM "Azienda" WHERE id = ${aziendaId} FOR UPDATE`;
  const azienda = await tx.azienda.findUnique({
    where: { id: aziendaId },
    select: {
      abbonamentoFino: true,
      abbonamentoProva: true,
      abbonamentoLivello: true,
      abbonamentoCambioAt: true,
      abbonamentoCambioLivello: true,
    },
  });
  if (!azienda) return false;
  const max = statoAbbonamento(azienda, now).maxPersone;
  if (max === null) return true;
  const [membri, inviti] = await Promise.all([
    tx.membership.count({ where: { aziendaId, user: { deactivatedAt: null } } }),
    // Новата покана за същия имейл обезсилва старата — тя не заема второ място.
    tx.invite.count({
      where: {
        aziendaId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
        NOT: { email },
      },
    }),
  ]);
  return membri + inviti < max;
}

/** Колко места са заети (за страницата на абонамента). */
export async function personeOccupate(
  tx: Prisma.TransactionClient,
  aziendaId: string,
  now: Date = new Date(),
): Promise<{ membri: number; inviti: number }> {
  const [membri, inviti] = await Promise.all([
    tx.membership.count({ where: { aziendaId, user: { deactivatedAt: null } } }),
    tx.invite.count({
      where: { aziendaId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    }),
  ]);
  return { membri, inviti };
}
