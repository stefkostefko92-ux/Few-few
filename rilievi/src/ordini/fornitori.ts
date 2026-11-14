import { z } from 'zod';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import type { SessionUser } from '../types.js';

/**
 * Адресникът на доставчиците на фирмата за поръчките от портала (собственикът, 12 ноември 2026 — точка C2):
 * име и имейл, до 200 на фирма; пише го администраторът ѝ (`aziende:settings`). Одит без имейла.
 */
export const MAX_FORNITORI = 200;

const pulito = (max: number) =>
  z
    .string()
    .transform((v) =>
      v
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .pipe(z.string().min(1).max(max));

export const fornitoreSchema = z.object({
  nome: pulito(120),
  email: z.string().trim().toLowerCase().max(254).email(),
});
export type DatiFornitore = z.output<typeof fornitoreSchema>;

export function fornitoriDi(aziendaId: string) {
  return prisma.fornitore.findMany({
    where: { aziendaId },
    orderBy: { nome: 'asc' },
    select: { id: true, nome: true, email: true },
  });
}

export type EsitoFornitore = 'ok' | 'doppio' | 'troppi';

export async function aggiungiFornitore(
  actor: SessionUser,
  aziendaId: string,
  dati: DatiFornitore,
): Promise<EsitoFornitore> {
  return prisma.$transaction(async (tx) => {
    // Записите на една фирма — един по един: таванът и „вече е в адресника“ не се разминават.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fornitori:' + aziendaId}))`;
    if ((await tx.fornitore.count({ where: { aziendaId } })) >= MAX_FORNITORI) return 'troppi';
    const esiste = await tx.fornitore.findUnique({
      where: { aziendaId_email: { aziendaId, email: dati.email } },
      select: { id: true },
    });
    if (esiste) return 'doppio';
    const f = await tx.fornitore.create({ data: { aziendaId, ...dati }, select: { id: true } });
    await writeAudit(
      {
        actorId: actor.id,
        action: 'FORNITORE_CREATE',
        aziendaId,
        targetType: 'fornitore',
        targetId: f.id,
      },
      tx,
    );
    return 'ok';
  });
}

export async function togliFornitore(
  actor: SessionUser,
  aziendaId: string,
  id: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.fornitore.deleteMany({ where: { id, aziendaId } });
    if (count === 0) return false;
    await writeAudit(
      {
        actorId: actor.id,
        action: 'FORNITORE_DELETE',
        aziendaId,
        targetType: 'fornitore',
        targetId: id,
      },
      tx,
    );
    return true;
  });
}
