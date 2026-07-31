import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { ok, route } from '@/lib/api';
import { visibiliDa } from '@/lib/notifiche';

/**
 * Segna come lette tutte le notifiche visibili all'utente, eventualmente di un
 * solo tipo. Utile dopo un rifornimento: decine di avvisi di scorta minima
 * diventano rumore e nascondono quello nuovo.
 *
 * Nota sulla ripetizione: `checkLowStock` non ricrea una notifica finché ne
 * esiste una NON letta per lo stesso prodotto. Segnare tutto come letto
 * riapre quindi la possibilità che un nuovo prelievo generi di nuovo l'avviso —
 * ed è il comportamento voluto: l'avviso deve tornare se il problema resta.
 */

const TIPI = [
  'SCORTA_MINIMA',
  'ESAURITO',
  'ACQUISTO_RICEVUTO',
  'SPEDIZIONE_PRONTA',
  'NUOVO_ORDINE',
  'INVENTARIO_DISCREPANZA',
] as const;

const schemaCorpo = z.object({
  tipo: z
    .union([z.literal(''), z.enum(TIPI)])
    .optional()
    .transform((v) => v || undefined),
});

/** Corpo facoltativo; se presente ma malformato nei campi, resta un 422. */
async function corpoFacoltativo(request: Request): Promise<unknown> {
  const testo = await request.text().catch(() => '');
  if (!testo.trim()) return {};
  try {
    return JSON.parse(testo);
  } catch {
    return {};
  }
}

export const POST = route(async (request: Request) => {
  const utente = await requireUser();
  const corpo = schemaCorpo.parse(await corpoFacoltativo(request));

  const where: Prisma.NotificationWhereInput = {
    ...visibiliDa(utente.id),
    reads: { none: { userId: utente.id } },
    ...(corpo.tipo ? { type: corpo.tipo } : {}),
  };

  // La lettura è per utente: si inseriscono righe di lettura, non si tocca la
  // notifica (che è condivisa con i colleghi).
  const daLeggere = await prisma.notification.findMany({
    where,
    select: { id: true },
  });

  const { count } = await prisma.notificationRead.createMany({
    data: daLeggere.map((n) => ({ notificationId: n.id, userId: utente.id })),
    // Una richiesta ripetuta (doppio clic, due schede aperte) non deve fallire
    // sul vincolo di unicità.
    skipDuplicates: true,
  });

  // Il residuo si riconta: con il filtro per tipo non è detto che sia zero, e
  // un contatore dedotto invece che letto è un contatore che prima o poi mente.
  const nonLette = await prisma.notification.count({
    where: { ...visibiliDa(utente.id), reads: { none: { userId: utente.id } } },
  });

  return ok({ lette: count, nonLette });
});
