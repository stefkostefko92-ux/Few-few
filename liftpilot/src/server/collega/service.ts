import 'server-only';
// The link between a survey sheet and an installation (round 44), written only here: within one company — the sheet's and
// the installation's `companyId` checked in the same statement —, together with its row in the activity log
// (SCHEDA_LINKED / SCHEDA_UNLINKED, without the sheet's content). The link is not the sheet's content nor its version: it
// is written with plain SQL so that `updatedAt` stays (a form opened on the sheet is not put in conflict, «Ultima
// modifica» keeps naming who changed the sheet). Only a sheet out of the trash is linked or unlinked, only to an active
// installation (an archived one is read only).
import type { ProjectKind } from '@prisma/client';
import { prisma } from '@/lib/db';
import { auditTx } from '@/lib/audit';

export type Esito = 'ok' | 'notFound' | 'projectNotFound' | 'alreadyLinked';

/** The sheet linked to the installation (another link replaced: the log says from which). */
export async function collega(companyId: string, schedaId: string, projectId: string, userId: string): Promise<Esito> {
  return prisma.$transaction(async (tx) => {
    const prev = await tx.scheda.findFirst({ where: { id: schedaId, companyId, deletedAt: null }, select: { projectId: true } });
    if (!prev) return 'notFound';
    if (prev.projectId === projectId) return 'ok';
    const n = await tx.$executeRaw`UPDATE "Scheda" AS s SET "projectId" = p."id" FROM "Project" AS p
      WHERE s."id" = ${schedaId} AND s."companyId" = ${companyId} AND s."deletedAt" IS NULL
        AND p."id" = ${projectId} AND p."companyId" = ${companyId} AND p."archivedAt" IS NULL`;
    if (n !== 1) return 'projectNotFound';
    await auditTx(tx, { companyId, userId, action: 'SCHEDA_LINKED', entity: 'Scheda', entityId: schedaId,
      meta: prev.projectId ? { projectId, from: prev.projectId } : { projectId } });
    return 'ok';
  });
}

/** The sheet unlinked from its installation; the installation it was linked to, or null when it was not linked. */
export async function scollega(companyId: string, schedaId: string, userId: string): Promise<{ esito: Esito; projectId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const prev = await tx.scheda.findFirst({ where: { id: schedaId, companyId, deletedAt: null }, select: { projectId: true } });
    if (!prev) return { esito: 'notFound' as const, projectId: null };
    if (!prev.projectId) return { esito: 'ok' as const, projectId: null };
    const n = await tx.$executeRaw`UPDATE "Scheda" SET "projectId" = NULL
      WHERE "id" = ${schedaId} AND "companyId" = ${companyId} AND "deletedAt" IS NULL AND "projectId" = ${prev.projectId}`;
    if (n !== 1) return { esito: 'notFound' as const, projectId: null };
    await auditTx(tx, { companyId, userId, action: 'SCHEDA_UNLINKED', entity: 'Scheda', entityId: schedaId, meta: { projectId: prev.projectId } });
    return { esito: 'ok' as const, projectId: prev.projectId };
  });
}

/** A rollback of the transaction that says why (the installation is not created when the sheet cannot be linked). */
class Annulla extends Error {
  constructor(readonly esito: Esito) { super(esito); }
}

export interface NuovoImpianto {
  name: string;
  address: string | null;
  city: string | null;
  province: string | null;
  plantNumber: string | null;
  client: string | null;
  notes: string | null;
}

/** A new installation created from a survey and linked to it in one transaction: the sheet must be the company's, out
 *  of the trash and not linked yet (else nothing is created). */
export async function creaDaRilievo(companyId: string, userId: string, data: NuovoImpianto, kind: ProjectKind, schedaId: string): Promise<{ esito: Esito; id?: string }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const s = await tx.scheda.findFirst({ where: { id: schedaId, companyId, deletedAt: null }, select: { projectId: true } });
      if (!s) throw new Annulla('notFound');
      if (s.projectId) throw new Annulla('alreadyLinked');
      const project = await tx.project.create({ data: { ...data, kind, companyId, createdById: userId }, select: { id: true } });
      const n = await tx.$executeRaw`UPDATE "Scheda" SET "projectId" = ${project.id}
        WHERE "id" = ${schedaId} AND "companyId" = ${companyId} AND "deletedAt" IS NULL AND "projectId" IS NULL`;
      if (n !== 1) throw new Annulla('alreadyLinked');
      await auditTx(tx, { companyId, userId, action: 'PROJECT_CREATED', entity: 'Project', entityId: project.id, meta: { kind, rilievo: schedaId } });
      await auditTx(tx, { companyId, userId, action: 'SCHEDA_LINKED', entity: 'Scheda', entityId: schedaId, meta: { projectId: project.id } });
      return { esito: 'ok' as const, id: project.id };
    });
  } catch (e) {
    if (e instanceof Annulla) return { esito: e.esito };
    throw e;
  }
}
