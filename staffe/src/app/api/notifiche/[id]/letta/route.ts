import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, route } from '@/lib/api';

/**
 * Segna una notifica come letta (o di nuovo da leggere).
 *
 * L'aggiornamento passa da `updateMany` con il filtro di visibilità: una
 * notifica di un altro utente non viene toccata e la risposta non rivela
 * nemmeno che esista (conteggio zero → 404, come se non ci fosse).
 *
 * Attenzione: le notifiche generali (`userId` nullo) hanno un solo campo
 * `readAt`, condiviso. Segnarle lette vale per tutti gli operatori — è un
 * limite dello schema, dichiarato anche nell'interfaccia.
 */

const schemaCorpo = z.object({ letta: z.boolean().optional() });

/**
 * Corpo facoltativo: una richiesta senza corpo significa «segna come letta».
 * Un corpo PRESENTE ma con campi sbagliati resta un errore di validazione (422):
 * ignorarlo silenziosamente farebbe credere all'operatore di aver fatto una cosa
 * diversa da quella avvenuta.
 */
async function corpoFacoltativo(request: Request): Promise<unknown> {
  const testo = await request.text().catch(() => '');
  if (!testo.trim()) return {};
  try {
    return JSON.parse(testo);
  } catch {
    return {};
  }
}

export const POST = route(
  async (request: Request, contesto: { params: Promise<{ id: string }> }) => {
    const utente = await requireUser();
    const { id } = await contesto.params;

    const corpo = schemaCorpo.parse(await corpoFacoltativo(request));
    const letta = corpo.letta ?? true;

    const { count } = await prisma.notification.updateMany({
      where: { id, OR: [{ userId: null }, { userId: utente.id }] },
      data: { readAt: letta ? new Date() : null },
    });

    if (count === 0) return fail(404, 'Notifica non trovata.', 'non_trovato');

    const nonLette = await prisma.notification.count({
      where: { OR: [{ userId: null }, { userId: utente.id }], readAt: null },
    });
    return ok({ id, letta, nonLette });
  },
);
