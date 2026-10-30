import 'server-only';
// The survey sheets' writes, always within the company of the signed-in user. Each one runs in one transaction with its
// audit entry (no sheet content in it, no IP: who, what, which sheet), as in rilievi (src/schede/service.ts). A sheet is
// edited in place, only over the version the form was opened on (`base` = its updatedAt to the millisecond): a change
// by someone else meanwhile is a conflict, never a silent overwrite. The company of a sheet never changes. The fields taken
// off the sheet (src/lib/rilievi/validation.ts) are not in the data: a save leaves their old answers in their columns.
// A save sent again after its answer was lost (round 48: no signal on the way back, keep-on-failure.ts) carries the same
// write key as the first: the company's sheet that already has it is that save — no second sheet, and its version is the
// person's own, not somebody else's change.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { auditTx, type AuditAction } from '@/lib/audit';
import { RILIEVO_SELECT, datiLetti } from '@/lib/collega/rilievo';
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

/** The company's sheet a save with this write key already made or updated, or null (no key: never one). */
export async function schedaByWriteKey(companyId: string, writeKey: string | null): Promise<{ id: string } | null> {
  if (!writeKey) return null;
  return prisma.scheda.findFirst({ where: { companyId, writeKey }, select: { id: true } });
}

/** The unique index on (companyId, writeKey) refused the row: the same save, sent twice at once. */
const sameKeyRace = (err: unknown): boolean => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

/** A new sheet of the company, written by `actorId` with the form's `writeKey` (null: the form sent none). The same key
 *  again is the same save: the sheet it made is the answer (`again`), and nothing is written twice — also when the two
 *  attempts arrive together (the unique index refuses the second). */
export async function createScheda(data: SchedaData, actorId: string, companyId: string, writeKey: string | null = null): Promise<{ id: string; again: boolean }> {
  const done = await schedaByWriteKey(companyId, writeKey);
  if (done) return { id: done.id, again: true };
  try {
    return await prisma.$transaction(async (tx) => {
      const scheda = await tx.scheda.create({
        data: {
          ...persisted(data),
          writeKey,
          companyId,
          createdById: actorId,
          updatedById: actorId,
          misureBottoniere: { createMany: { data: data.misureBottoniere } },
        },
        select: { id: true },
      });
      await audit(tx, 'SCHEDA_CREATED', companyId, actorId, scheda.id);
      return { id: scheda.id, again: false };
    });
  } catch (err) {
    const raced = writeKey && sameKeyRace(err) ? await schedaByWriteKey(companyId, writeKey) : null;
    if (raced) return { id: raced.id, again: true };
    throw err;
  }
}

export type UpdateOutcome = 'ok' | 'conflict' | 'missing';

/**
 * The change is written only over the opened version: the form sends `base` (= updatedAt when opened). A change by
 * someone else meanwhile → `conflict`, nothing overwritten — unless the version there was written with this form's
 * `writeKey`: that is this very save, sent again after its answer was lost (`ok`, nothing written twice). A sheet of
 * another company, unknown or in the trash → `missing`.
 */
export async function updateScheda(companyId: string, id: string, base: string, data: SchedaData, actorId: string,
  writeKey: string | null = null): Promise<UpdateOutcome> {
  if (!schedaIdSchema.safeParse(id).success) return 'missing';
  // nothing written: the sheet as it is now says which — gone, this save already there, or somebody else's version
  const unwritten = async (db: Prisma.TransactionClient): Promise<UpdateOutcome> => {
    const row = await db.scheda.findFirst({ where: { id, companyId, deletedAt: null }, select: { writeKey: true } });
    return !row ? 'missing' : writeKey && row.writeKey === writeKey ? 'ok' : 'conflict';
  };
  const baseDate = new Date(base);
  if (Number.isNaN(baseDate.getTime())) return unwritten(prisma);
  try {
    return await prisma.$transaction(async (tx) => {
      // what the installation reads of the sheet, before and after: `datiAt` moves only when that changes (round 57)
      const before = await tx.scheda.findFirst({ where: { id, companyId, updatedAt: baseDate, deletedAt: null }, select: RILIEVO_SELECT });
      const updated = await tx.scheda.updateMany({
        where: { id, companyId, updatedAt: baseDate, deletedAt: null },
        data: { ...persisted(data), writeKey, updatedById: actorId },
      });
      if (updated.count === 0) return unwritten(tx);
      const after = await tx.scheda.findFirst({ where: { id, companyId }, select: RILIEVO_SELECT });
      if (!before || !after || datiLetti(before) !== datiLetti(after)) await tx.scheda.updateMany({ where: { id, companyId }, data: { datiAt: new Date() } });
      // the measurements per stop are written anew — exactly what is in the form, nothing old stays
      await tx.misuraBottoniera.deleteMany({ where: { schedaId: id } });
      if (data.misureBottoniere.length > 0) {
        await tx.misuraBottoniera.createMany({ data: data.misureBottoniere.map((row) => ({ ...row, schedaId: id })) });
      }
      await audit(tx, 'SCHEDA_UPDATED', companyId, actorId, id);
      return 'ok';
    });
  } catch (err) {
    // the key is on another of the company's sheets already (a form's key is its own: only a forged one), or the two
    // attempts of this save ran at once: nothing written, the sheet says which
    if (writeKey && sameKeyRace(err)) return unwritten(prisma);
    throw err;
  }
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
