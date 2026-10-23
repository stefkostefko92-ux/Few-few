import { Prisma, type Scheda } from '@prisma/client';
import { prisma } from '../db.js';
import { rimuoviScheda } from '../allegati/archivio.js';
import { errorMessage, logger } from '../logger.js';
import { writeAudit } from '../audit.js';
import { inScope, schedaScope, type Scope } from '../auth/scope.js';
import { salvaSchizzi } from '../schizzi/service.js';
import { searchTextOf } from './search.js';
import type { SceltaFoto } from './stampa.js';
import type { SchedaData } from './validation.js';

/**
 * Картите. Всяка функция тук получава обхвата на човека (src/auth/scope.ts): фирмата вижда и
 * променя само своите карти, MASTER — всички. Чужда карта е „няма такава“ (404), не „забранено“ —
 * отговорът не казва, че съществува.
 */

const WITH_PEOPLE = {
  misureBottoniere: { orderBy: { fermata: 'asc' } },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  deletedBy: { select: { name: true } },
  azienda: {
    select: {
      id: true,
      name: true,
      logoType: true,
      logoWidth: true,
      logoHeight: true,
      logoUpdatedAt: true,
      ordineSezioni: true,
      schizzi: true,
    },
  },
} satisfies Prisma.SchedaInclude;

export type SchedaFull = Prisma.SchedaGetPayload<{ include: typeof WITH_PEOPLE }>;

/** Карта по id в обхвата; изтритата — само за обхвата на кошчето (`trashScope`, ролята във фирмата ѝ). */
export async function getScheda(
  scope: Scope,
  id: string,
  trashScope?: Scope,
): Promise<SchedaFull | null> {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  const scheda = await prisma.scheda.findFirst({
    where: { id, ...schedaScope(scope) },
    include: WITH_PEOPLE,
  });
  if (!scheda) return null;
  if (scheda.deletedAt && !(trashScope && inScope(trashScope, scheda.aziendaId))) return null;
  return scheda;
}

/** Колоните на картата (без редовете с мерки — те са отделна таблица) и текстът за търсене. */
function persisted(
  data: SchedaData,
): Omit<Prisma.SchedaUncheckedCreateInput, 'createdById' | 'aziendaId'> {
  const {
    misureBottoniere: _rows,
    fotoInStampa: _foto,
    schizzi: _schizzi,
    ordineQuadro,
    preventivoArgano,
    ordineSospensioni,
    ...fields
  } = data;
  return {
    ...fields,
    // Модулите на доставчиците — JSON или истинско NULL в базата (не JSON null).
    ordineQuadro: ordineQuadro ?? Prisma.DbNull,
    preventivoArgano: preventivoArgano ?? Prisma.DbNull,
    ordineSospensioni: ordineSospensioni ?? Prisma.DbNull,
    searchText: searchTextOf(fields),
  };
}

/** Нова карта във фирмата `aziendaId` — тази на човека или избраната (и проверена) от MASTER. */
export async function createScheda(
  data: SchedaData,
  actorId: string,
  aziendaId: string,
): Promise<Scheda> {
  return prisma.$transaction(async (tx) => {
    const scheda = await tx.scheda.create({
      data: {
        ...persisted(data),
        aziendaId,
        createdById: actorId,
        updatedById: actorId,
        misureBottoniere: { createMany: { data: data.misureBottoniere } },
      },
    });
    if (data.schizzi) await salvaSchizzi(tx, scheda.id, data.schizzi);
    await writeAudit(
      { actorId, action: 'SCHEDA_CREATE', aziendaId, targetType: 'scheda', targetId: scheda.id },
      tx,
    );
    return scheda;
  });
}

/** Фирмата на карта в обхвата (за одита), или null — няма я или е чужда. */
async function aziendaOf(
  tx: Prisma.TransactionClient,
  scope: Scope,
  id: string,
): Promise<string | null> {
  const row = await tx.scheda.findFirst({
    where: { id, ...schedaScope(scope) },
    select: { aziendaId: true },
  });
  return row?.aziendaId ?? null;
}

/**
 * Снимките в печата (иконките в края на формата): само показаните — отметнатите влизат, другите не;
 * снимка, качена междувременно, остава каквато е. Само снимките на тази карта. `fotoStampate` следва
 * избора („поне една“) за предишния код — без да мести `updatedAt` на картата.
 */
async function salvaFotoInStampa(
  tx: Prisma.TransactionClient,
  schedaId: string,
  { mostrate, scelte }: SceltaFoto,
): Promise<void> {
  if (mostrate.length === 0) return;
  await tx.allegato.updateMany({
    where: { schedaId, id: { in: mostrate } },
    data: { inStampa: false },
  });
  if (scelte.length > 0) {
    await tx.allegato.updateMany({
      where: { schedaId, tipo: 'FOTO', id: { in: scelte } },
      data: { inStampa: true },
    });
  }
  await tx.$executeRaw`
    UPDATE "Scheda" SET "fotoStampate" = EXISTS (
      SELECT 1 FROM "Allegato" WHERE "schedaId" = ${schedaId} AND tipo = 'FOTO' AND "inStampa"
    )
    WHERE id = ${schedaId}`;
}

export type UpdateOutcome = 'ok' | 'conflict' | 'missing';

/**
 * Записът е само върху отворената версия: формата праща `base` (= updatedAt при отварянето). Промяна
 * от друг човек междувременно → `conflict`, нищо не се презаписва тихо. Фирмата на картата не се мени.
 */
export async function updateScheda(
  scope: Scope,
  id: string,
  base: string,
  data: SchedaData,
  actorId: string,
): Promise<UpdateOutcome> {
  const baseDate = new Date(base);
  if (Number.isNaN(baseDate.getTime())) return 'conflict';
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return 'missing';
    const updated = await tx.scheda.updateMany({
      where: { id, aziendaId, updatedAt: baseDate, deletedAt: null },
      data: { ...persisted(data), updatedById: actorId },
    });
    if (updated.count === 0) {
      const exists = await tx.scheda.count({ where: { id, aziendaId, deletedAt: null } });
      return exists ? 'conflict' : 'missing';
    }
    // Мерките по спирки се записват наново — точно каквото е във формата, нищо старо не остава.
    await tx.misuraBottoniera.deleteMany({ where: { schedaId: id } });
    if (data.misureBottoniere.length > 0) {
      await tx.misuraBottoniera.createMany({
        data: data.misureBottoniere.map((row) => ({ ...row, schedaId: id })),
      });
    }
    if (data.fotoInStampa) await salvaFotoInStampa(tx, id, data.fotoInStampa);
    if (data.schizzi) await salvaSchizzi(tx, id, data.schizzi);
    await writeAudit(
      { actorId, action: 'SCHEDA_UPDATE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return 'ok';
  });
}

/** В кошчето — възстановима. */
export async function trashScheda(scope: Scope, id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return false;
    const moved = await tx.scheda.updateMany({
      where: { id, aziendaId, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: actorId },
    });
    if (moved.count === 0) return false;
    await writeAudit(
      { actorId, action: 'SCHEDA_DELETE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return true;
  });
}

export async function restoreScheda(scope: Scope, id: string, actorId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return false;
    const restored = await tx.scheda.updateMany({
      where: { id, aziendaId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedById: null, updatedById: actorId },
    });
    if (restored.count === 0) return false;
    await writeAudit(
      { actorId, action: 'SCHEDA_RESTORE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return true;
  });
}

/**
 * Окончателно — само от кошчето, само ADMIN и нагоре (маршрутът го проверява). Снимките и клиповете
 * падат с картата (каскада), папката им — след записа (грешка на диска не връща картата).
 */
export async function purgeScheda(scope: Scope, id: string, actorId: string): Promise<boolean> {
  const purged = await prisma.$transaction(async (tx) => {
    const aziendaId = await aziendaOf(tx, scope, id);
    if (!aziendaId) return false;
    const removed = await tx.scheda.deleteMany({
      where: { id, aziendaId, deletedAt: { not: null } },
    });
    if (removed.count === 0) return false;
    await writeAudit(
      { actorId, action: 'SCHEDA_PURGE', aziendaId, targetType: 'scheda', targetId: id },
      tx,
    );
    return true;
  });
  if (purged) {
    await rimuoviScheda(id).catch((error: unknown) => {
      logger.error({ err: errorMessage(error), scheda: id }, 'папката на картата не се изтри');
    });
  }
  return purged;
}
