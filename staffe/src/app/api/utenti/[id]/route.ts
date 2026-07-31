import { Prisma } from '@prisma/client';
import { requirePermission } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { fail, ok, readBody, route } from '@/lib/api';
import { utenteAggiornaSchema } from '@/lib/validation/inventario';

type Contesto = { params: Promise<{ id: string }> };

const CAMPI = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const GET = route(async (_request: Request, ctx: Contesto) => {
  await requirePermission('utenti:gestisci');
  const { id } = await ctx.params;

  const utente = await prisma.user.findUnique({
    where: { id },
    select: {
      ...CAMPI,
      _count: { select: { sessions: true } },
    },
  });
  if (!utente) return fail(404, 'Utente non trovato.', 'non_trovato');
  return ok(utente);
});

/**
 * Modifica nome, ruolo e stato.
 *
 * Disattivazione e cambio di ruolo REVOCANO le sessioni vive: il ruolo viaggia
 * dentro il token e la revoca è l'unico modo per farlo scadere subito. Senza
 * questa riga «disattivare» significherebbe soltanto «non potrà più entrare da
 * domani», mentre la scheda già aperta continuerebbe a lavorare.
 */
export const PATCH = route(async (request: Request, ctx: Contesto) => {
  const attore = await requirePermission('utenti:gestisci');
  const { id } = await ctx.params;
  const input = await readBody(request, utenteAggiornaSchema);

  const utente = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  if (!utente) return fail(404, 'Utente non trovato.', 'non_trovato');

  const disattiva = input.active === false && utente.active;
  const declassa =
    input.role !== undefined &&
    input.role !== utente.role &&
    utente.role === 'AMMINISTRATORE';

  // Nessuno si chiude fuori da solo: senza questo controllo basta un clic per
  // restare senza amministratori e senza modo di rientrare.
  if (attore.id === utente.id && (disattiva || declassa)) {
    return fail(
      409,
      'Non puoi disattivare né declassare il tuo stesso account.',
      'auto_blocco',
    );
  }

  if (disattiva || declassa) {
    const altriAmministratori = await prisma.user.count({
      where: { role: 'AMMINISTRATORE', active: true, id: { not: utente.id } },
    });
    if (utente.role === 'AMMINISTRATORE' && altriAmministratori === 0) {
      return fail(
        409,
        'È l’ultimo amministratore attivo: nominarne un altro prima di disattivarlo o cambiargli ruolo.',
        'ultimo_amministratore',
      );
    }
  }

  const cambiaRuolo = input.role !== undefined && input.role !== utente.role;
  const aggiornato = await prisma.$transaction(async (tx) => {
    const nuovo = await tx.user.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.active === undefined ? {} : { active: input.active }),
      },
      select: CAMPI,
    });
    if (disattiva || cambiaRuolo) {
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return nuovo;
  });

  await audit({
    userId: attore.id,
    action: 'UPDATE',
    entity: 'User',
    entityId: aggiornato.id,
    summary: `Modificato utente ${aggiornato.email}${disattiva ? ' (disattivato, sessioni revocate)' : ''}${cambiaRuolo ? ` (ruolo ${utente.role} → ${aggiornato.role}, sessioni revocate)` : ''}`,
    changes: {
      prima: { name: utente.name, role: utente.role, active: utente.active },
      dopo: {
        name: aggiornato.name,
        role: aggiornato.role,
        active: aggiornato.active,
      },
    },
  });

  return ok(aggiornato);
});
