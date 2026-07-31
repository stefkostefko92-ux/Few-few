import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { meta, ok, pagination, route } from '@/lib/api';

/**
 * Centro notifiche — elenco.
 *
 * Visibilità: una notifica con `userId` nullo è generale (destinata a chi ha il
 * ruolo competente), una con `userId` valorizzato è personale. L'utente vede le
 * generali e le proprie, mai quelle di un collega: il filtro sta nella query,
 * non nell'interfaccia.
 *
 * Le notifiche di scorta minima ed esaurito NON si generano qui: le scrive
 * `checkLowStock` in `src/lib/stock.ts`, dentro la transazione del movimento
 * che le causa. Duplicare quella logica significherebbe due sorgenti di verità
 * e notifiche doppie.
 */

const TIPI = [
  'SCORTA_MINIMA',
  'ESAURITO',
  'ACQUISTO_RICEVUTO',
  'SPEDIZIONE_PRONTA',
  'NUOVO_ORDINE',
  'INVENTARIO_DISCREPANZA',
] as const;

const schemaFiltro = z.object({
  stato: z
    .union([z.literal(''), z.enum(['tutte', 'non_lette', 'lette'])])
    .optional()
    .transform((v) => v || 'non_lette'),
  tipo: z
    .union([z.literal(''), z.enum(TIPI)])
    .optional()
    .transform((v) => v || undefined),
});

export const GET = route(async (request: Request) => {
  const utente = await requireUser();
  const url = new URL(request.url);
  const filtro = schemaFiltro.parse({
    stato: url.searchParams.get('stato') ?? undefined,
    tipo: url.searchParams.get('tipo') ?? undefined,
  });
  const p = pagination(url, 50);

  const where: Prisma.NotificationWhereInput = {
    OR: [{ userId: null }, { userId: utente.id }],
    ...(filtro.tipo ? { type: filtro.tipo } : {}),
    ...(filtro.stato === 'non_lette'
      ? { readAt: null }
      : filtro.stato === 'lette'
        ? { readAt: { not: null } }
        : {}),
  };

  const [righe, totale, nonLette] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
      skip: p.skip,
      take: p.take,
      select: {
        id: true,
        type: true,
        level: true,
        title: true,
        body: true,
        entity: true,
        entityId: true,
        readAt: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { OR: [{ userId: null }, { userId: utente.id }], readAt: null },
    }),
  ]);

  return ok({ notifiche: righe, nonLette }, meta(p, totale));
});
