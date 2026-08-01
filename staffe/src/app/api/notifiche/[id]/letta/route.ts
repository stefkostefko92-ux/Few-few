import { z } from 'zod';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { fail, ok, route } from '@/lib/api';
import { visibiliDa } from '@/lib/notifiche';

/**
 * Segna una notifica come letta (o di nuovo da leggere) PER CHI LO CHIEDE.
 *
 * La lettura è una riga in `NotificationRead`, non un campo sulla notifica: un
 * avviso generale segnato letto da un operatore resta da leggere per i colleghi.
 *
 * Si verifica prima la visibilità: la notifica di un altro utente non viene
 * toccata e la risposta non rivela nemmeno che esista (404, come se non ci fosse).
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

    const visibile = await prisma.notification.findFirst({
      where: { id, ...visibiliDa(utente.id) },
      select: { id: true },
    });
    if (!visibile) return fail(404, 'Notifica non trovata.', 'non_trovato');

    if (letta) {
      // Idempotente: ripremere «segna come letta» non deve fallire sul vincolo
      // di unicità né spostare la data di lettura già registrata.
      await prisma.notificationRead.upsert({
        where: {
          notificationId_userId: { notificationId: id, userId: utente.id },
        },
        create: { notificationId: id, userId: utente.id },
        update: {},
      });
    } else {
      await prisma.notificationRead.deleteMany({
        where: { notificationId: id, userId: utente.id },
      });
    }

    const nonLette = await prisma.notification.count({
      where: { ...visibiliDa(utente.id), reads: { none: { userId: utente.id } } },
    });
    return ok({ id, letta, nonLette });
  },
);
