import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { meta, ok, pagination, route } from '@/lib/api';
import {
  letturaDi,
  selectNotifica,
  visibiliDa,
  whereNotifiche,
} from '@/lib/notifiche';

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

  const where = whereNotifiche(utente.id, {
    stato: filtro.stato,
    tipo: filtro.tipo,
  });

  const [righe, totale, nonLette] = await Promise.all([
    prisma.notification.findMany({
      where,
      // Prima le aperte, poi le più recenti: un avviso ancora valido conta più
      // di uno già rientrato, indipendentemente da quando è nato.
      orderBy: [{ resolvedAt: 'asc' }, { createdAt: 'desc' }],
      skip: p.skip,
      take: p.take,
      select: selectNotifica(utente.id),
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({
      where: { ...visibiliDa(utente.id), reads: { none: { userId: utente.id } } },
    }),
  ]);

  const notifiche = righe.map(({ reads, ...n }) => ({
    ...n,
    readAt: letturaDi({ reads }),
  }));

  return ok({ notifiche, nonLette }, meta(p, totale));
});
