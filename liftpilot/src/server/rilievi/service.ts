import 'server-only';
// The survey sheets' writes, always within the company of the signed-in user. Each one runs in one transaction with its
// audit entry (no sheet content in it, no IP: who, what, which sheet), as in rilievi (src/schede/service.ts). A sheet is
// edited in place, only over the version the form was opened on (`base` = its updatedAt to the millisecond): a change
// by someone else meanwhile is a conflict, never a silent overwrite. The company of a sheet never changes. The fields taken
// off the sheet (src/lib/rilievi/validation.ts) are not in the data: a save leaves their old answers in their columns.
import { Prisma, type Scheda } from '@prisma/client';
import { prisma } from '@/lib/db';
import { auditTx, type AuditAction } from '@/lib/audit';
import { schedaIdSchema } from '@/lib/rilievi/inputs';
import { searchTextOf } from '@/lib/rilievi/search';
import type { SchedaData } from '@/lib/rilievi/validation';

const audit = (tx: Prisma.TransactionClient, action: AuditAction, companyId: string, userId: string, id: string) =>
  auditTx(tx, { companyId, userId, action, entity: 'Scheda', entityId: id });

/** The sheet's columns (the rows of the measurements are their own table) and its search text. */
function persisted(data: SchedaData): Omit<Prisma.SchedaUncheckedCreateInput, 'createdById' | 'companyId'> {
  const { misureBottoniere: _rows, ordineQuadro, preventivoArgano, ordineSospensioni, ...fields } = data;
  void _rows;
  return {
    ...fields,
    // the suppliers' modules — JSON or a real NULL in the database (never JSON null)
    ordineQuadro: ordineQuadro ?? Prisma.DbNull,
    preventivoArgano: preventivoArgano ?? Prisma.DbNull,
    ordineSospensioni: ordineSospensioni ?? Prisma.DbNull,
    searchText: searchTextOf(fields),
  };
}

/** A new sheet of the company, written by `actorId`. */
export async function createScheda(data: SchedaData, actorId: string, companyId: string): Promise<Scheda> {
  return prisma.$transaction(async (tx) => {
    const scheda = await tx.scheda.create({
      data: {
        ...persisted(data),
        companyId,
        createdById: actorId,
        updatedById: actorId,
        misureBottoniere: { createMany: { data: data.misureBottoniere } },
      },
    });
    await audit(tx, 'SCHEDA_CREATED', companyId, actorId, scheda.id);
    return scheda;
  });
}

export type UpdateOutcome = 'ok' | 'conflict' | 'missing';

/**
 * The change is written only over the opened version: the form sends `base` (= updatedAt when opened). A change by
 * someone else meanwhile → `conflict`, nothing overwritten. A sheet of another company, unknown or in the trash →
 * `missing`.
 */
export async function updateScheda(companyId: string, id: string, base: string, data: SchedaData, actorId: string): Promise<UpdateOutcome> {
  if (!schedaIdSchema.safeParse(id).success) return 'missing';
  const baseDate = new Date(base);
  if (Number.isNaN(baseDate.getTime())) return 'conflict';
  return prisma.$transaction(async (tx) => {
    const updated = await tx.scheda.updateMany({
      where: { id, companyId, updatedAt: baseDate, deletedAt: null },
      data: { ...persisted(data), updatedById: actorId },
    });
    if (updated.count === 0) {
      const exists = await tx.scheda.count({ where: { id, companyId, deletedAt: null } });
      return exists ? 'conflict' : 'missing';
    }
    // the measurements per stop are written anew — exactly what is in the form, nothing old stays
    await tx.misuraBottoniera.deleteMany({ where: { schedaId: id } });
    if (data.misureBottoniere.length > 0) {
      await tx.misuraBottoniera.createMany({ data: data.misureBottoniere.map((row) => ({ ...row, schedaId: id })) });
    }
    await audit(tx, 'SCHEDA_UPDATED', companyId, actorId, id);
    return 'ok';
  });
}

/** Into the trash — restorable. */
export async function trashScheda(companyId: string, id: string, actorId: string): Promise<boolean> {
  if (!schedaIdSchema.safeParse(id).success) return false;
  return prisma.$transaction(async (tx) => {
    const moved = await tx.scheda.updateMany({ where: { id, companyId, deletedAt: null }, data: { deletedAt: new Date(), deletedById: actorId } });
    if (moved.count === 0) return false;
    await audit(tx, 'SCHEDA_TRASHED', companyId, actorId, id);
    return true;
  });
}

/** Out of the trash, back in the list. */
export async function restoreScheda(companyId: string, id: string, actorId: string): Promise<boolean> {
  if (!schedaIdSchema.safeParse(id).success) return false;
  return prisma.$transaction(async (tx) => {
    const restored = await tx.scheda.updateMany({
      where: { id, companyId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, updatedById: actorId },
    });
    if (restored.count === 0) return false;
    await audit(tx, 'SCHEDA_RESTORED', companyId, actorId, id);
    return true;
  });
}

/** For good — only from the trash (the measurements go with it, by cascade). */
export async function purgeScheda(companyId: string, id: string, actorId: string): Promise<boolean> {
  if (!schedaIdSchema.safeParse(id).success) return false;
  return prisma.$transaction(async (tx) => {
    const removed = await tx.scheda.deleteMany({ where: { id, companyId, deletedAt: { not: null } } });
    if (removed.count === 0) return false;
    await audit(tx, 'SCHEDA_PURGED', companyId, actorId, id);
    return true;
  });
}
