import type { Prisma } from '@prisma/client';

/**
 * Filtri del centro notifiche — un solo posto, usato dalla pagina e dalle rotte
 * API. Erano duplicati, e una copia che cambia senza l'altra fa vedere due conteggi
 * diversi per la stessa cosa.
 *
 * Due stati distinti, da non confondere:
 *  · lettura → è PER UTENTE, sta in `NotificationRead`;
 *  · risoluzione → è della CONDIZIONE (giacenza risalita), sta in `resolvedAt`.
 */

export type StatoNotifiche = 'tutte' | 'non_lette' | 'lette';

/** Le notifiche generali (`userId` nullo) più le proprie. Mai quelle di un collega. */
export function visibiliDa(userId: string): Prisma.NotificationWhereInput {
  return { OR: [{ userId: null }, { userId } ] };
}

/**
 * Non letta = NON esiste una riga di lettura per questo utente. L'assenza della
 * riga è lo stato «da leggere»: così un avviso generale letto da un collega
 * resta da leggere per tutti gli altri.
 */
export function filtroLettura(
  userId: string,
  stato: StatoNotifiche,
): Prisma.NotificationWhereInput {
  if (stato === 'non_lette') return { reads: { none: { userId } } };
  if (stato === 'lette') return { reads: { some: { userId } } };
  return {};
}

export function whereNotifiche(
  userId: string,
  { stato, tipo }: { stato: StatoNotifiche; tipo?: Prisma.NotificationWhereInput['type'] },
): Prisma.NotificationWhereInput {
  return {
    ...visibiliDa(userId),
    ...(tipo ? { type: tipo } : {}),
    ...filtroLettura(userId, stato),
  };
}

/** Selezione comune, con lo stato di lettura del solo utente corrente. */
export function selectNotifica(userId: string) {
  return {
    id: true,
    type: true,
    level: true,
    title: true,
    body: true,
    entity: true,
    entityId: true,
    resolvedAt: true,
    createdAt: true,
    reads: {
      where: { userId },
      select: { readAt: true },
      take: 1,
    },
  } satisfies Prisma.NotificationSelect;
}

type ConLetture = { reads: Array<{ readAt: Date }> };

/** Appiattisce la relazione in un semplice `readAt` per l'interfaccia. */
export function letturaDi(n: ConLetture): Date | null {
  return n.reads[0]?.readAt ?? null;
}
