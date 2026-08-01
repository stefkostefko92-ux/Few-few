import { hashPassword, requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { passwordResetSchema } from '@/lib/validation/inventario';

type Contesto = { params: Promise<{ id: string }> };

/**
 * Reimpostazione della password da parte dell'amministratore.
 *
 * Tutte le sessioni vive vengono revocate: se la password è stata cambiata
 * perché sospettiamo un accesso altrui, lasciare aperta la sessione del ladro
 * renderebbe il cambio del tutto inutile. La password non viene mai registrata
 * (nemmeno nell'audit, che comunque rimuove i campi sensibili).
 */
export const POST = route(async (request: Request, ctx: Contesto) => {
  const attore = await requirePermission('utenti:gestisci');
  const { id } = await ctx.params;
  const { password } = await readBody(request, passwordResetSchema);

  const utente = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true },
  });
  if (!utente) return fail(404, 'Utente non trovato.', 'non_trovato');

  const passwordHash = await hashPassword(password);

  const revocate = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash } });
    const { count } = await tx.session.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  });

  await audit({
    userId: attore.id,
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: utente.id,
    summary: `Password reimpostata per ${utente.email}; ${revocate} sessioni revocate`,
  });

  return ok({ id: utente.id, sessioniRevocate: revocate });
});
