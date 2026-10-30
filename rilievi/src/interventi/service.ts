import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { PAGE_SIZE, pageOf } from '../schede/list.js';
import { firmaSalvata } from './firma.js';
import type { InterventoData } from './form.js';

/**
 * Листовете за интервенция в базата: номер за фирмата (брояч на фирмата, в транзакцията на листа — без
 * дупки и без повторения), запис на черновата (с проверка, че никой не я е сменил междувременно),
 * потвърждението, след което листът не се пипа. Одитът е в същата транзакция.
 */

const INCLUDE = {
  azienda: {
    select: {
      id: true,
      name: true,
      logoType: true,
      logoWidth: true,
      logoHeight: true,
      logoUpdatedAt: true,
    },
  },
  createdBy: { select: { name: true } },
  updatedBy: { select: { name: true } },
  confermatoBy: { select: { name: true } },
} satisfies Prisma.InterventoInclude;

export type InterventoFull = Prisma.InterventoGetPayload<{ include: typeof INCLUDE }>;

const LIST_SELECT = {
  id: true,
  numero: true,
  data: true,
  indirizzo: true,
  citta: true,
  matricola: true,
  tecnici: true,
  confermatoAt: true,
  aziendaId: true,
  azienda: { select: { name: true } },
} satisfies Prisma.InterventoSelect;

export type InterventoRow = Prisma.InterventoGetPayload<{ select: typeof LIST_SELECT }>;

/** „000042“ — номерът като на хартиения блок (шест цифри). */
export const numeroModulo = (numero: number): string => String(numero).padStart(6, '0');

function persisted(data: InterventoData) {
  return {
    data: data.data,
    turno: data.turno,
    indirizzo: data.indirizzo,
    citta: data.citta,
    tecnici: data.tecnici,
    matricola: data.matricola,
    voci: data.voci as Prisma.InputJsonObject,
    altro: data.altro,
    prove: data.prove,
    oreTecnico: data.oreTecnico,
    oreTotali: data.oreTotali,
    // Подписът е за съдържанието, с което е положен: всеки запис на черновата пише и подписите си —
    // недонарисуваните (редакцията ги иска наново) остават празни.
    firmaTecnico: data.firmaTecnico ?? Prisma.DbNull,
    firmaTecnicoNome: data.firmaTecnicoNome,
    firmaCliente: data.firmaCliente ?? Prisma.DbNull,
    firmaClienteNome: data.firmaClienteNome,
  };
}

export async function createIntervento(
  data: InterventoData,
  actorId: string,
  aziendaId: string,
): Promise<{ id: string; numero: number }> {
  return prisma.$transaction(async (tx) => {
    // Редът на фирмата се заключва до края на транзакцията: два листа едновременно вземат два номера.
    const [counter] = await tx.$queryRaw<Array<{ numero: number }>>`
      UPDATE "Azienda" SET "interventiNumero" = "interventiNumero" + 1
      WHERE "id" = ${aziendaId}
      RETURNING "interventiNumero" AS numero`;
    if (!counter) throw new Error('фирмата на листа липсва');
    const row = await tx.intervento.create({
      data: {
        ...persisted(data),
        aziendaId,
        numero: counter.numero,
        createdById: actorId,
        updatedById: actorId,
      },
      select: { id: true },
    });
    await writeAudit(
      {
        actorId,
        action: 'INTERVENTO_CREATE',
        aziendaId,
        targetType: 'intervento',
        targetId: row.id,
        meta: { numero: counter.numero },
      },
      tx,
    );
    return { id: row.id, numero: counter.numero };
  });
}

/** Листът в обхвата, или null — няма го или е на друга фирма. */
export async function getIntervento(scope: Scope, id: string): Promise<InterventoFull | null> {
  return prisma.intervento.findFirst({ where: { id, ...aziendaWhere(scope) }, include: INCLUDE });
}

export type EsitoModifica = 'ok' | 'conflict' | 'chiuso' | 'missing';

/** Черновата се записва само ако е същата, която човекът е отворил (`base` = updatedAt тогава). */
export async function updateIntervento(
  scope: Scope,
  id: string,
  base: string,
  data: InterventoData,
  actorId: string,
): Promise<EsitoModifica> {
  const baseDate = new Date(base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.intervento.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: { aziendaId: true, confermatoAt: true },
    });
    if (!current) return 'missing';
    if (current.confermatoAt) return 'chiuso';
    if (Number.isNaN(baseDate.getTime())) return 'conflict';
    const updated = await tx.intervento.updateMany({
      where: { id, aziendaId: current.aziendaId, confermatoAt: null, updatedAt: baseDate },
      data: { ...persisted(data), updatedById: actorId },
    });
    if (updated.count === 0) {
      const stillOpen = await tx.intervento.count({ where: { id, confermatoAt: null } });
      return stillOpen ? 'conflict' : 'chiuso';
    }
    await writeAudit(
      {
        actorId,
        action: 'INTERVENTO_UPDATE',
        aziendaId: current.aziendaId,
        targetType: 'intervento',
        targetId: id,
      },
      tx,
    );
    return 'ok';
  });
}

export type EsitoConferma = 'ok' | 'conflict' | 'chiuso' | 'missing' | 'firme';

/**
 * „Conferma“: листът, както е на екрана (`base`), с двата подписа и имената им — оттук нататък не се
 * пипа. Условията са и в самия UPDATE: два едновременни клика или запис между тях не минават.
 */
export async function confermaIntervento(
  scope: Scope,
  id: string,
  base: string,
  actorId: string,
): Promise<EsitoConferma> {
  const baseDate = new Date(base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.intervento.findFirst({
      where: { id, ...aziendaWhere(scope) },
      select: {
        aziendaId: true,
        numero: true,
        confermatoAt: true,
        updatedAt: true,
        firmaTecnico: true,
        firmaTecnicoNome: true,
        firmaCliente: true,
        firmaClienteNome: true,
      },
    });
    if (!current) return 'missing';
    if (current.confermatoAt) return 'chiuso';
    if (Number.isNaN(baseDate.getTime()) || current.updatedAt.getTime() !== baseDate.getTime())
      return 'conflict';
    if (!firmato(current)) return 'firme';
    const updated = await tx.intervento.updateMany({
      where: { id, aziendaId: current.aziendaId, confermatoAt: null, updatedAt: baseDate },
      data: { confermatoAt: new Date(), confermatoById: actorId },
    });
    if (updated.count === 0) return 'conflict';
    await writeAudit(
      {
        actorId,
        action: 'INTERVENTO_CONFIRM',
        aziendaId: current.aziendaId,
        targetType: 'intervento',
        targetId: id,
        meta: { numero: current.numero },
      },
      tx,
    );
    return 'ok';
  });
}

/** И двата подписа са положени и имената са написани. */
export function firmato(row: {
  firmaTecnico: unknown;
  firmaTecnicoNome: string | null;
  firmaCliente: unknown;
  firmaClienteNome: string | null;
}): boolean {
  return Boolean(
    firmaSalvata(row.firmaTecnico) &&
    firmaSalvata(row.firmaCliente) &&
    row.firmaTecnicoNome &&
    row.firmaClienteNome,
  );
}

/** Изпратеният имейл — само в одита (без адреса: лични данни в одита не влизат). */
export async function registraInvio(
  actorId: string,
  intervento: { id: string; aziendaId: string; numero: number },
): Promise<void> {
  await writeAudit({
    actorId,
    action: 'INTERVENTO_EMAIL',
    aziendaId: intervento.aziendaId,
    targetType: 'intervento',
    targetId: intervento.id,
    meta: { numero: intervento.numero },
  });
}

export interface InterventiPage {
  rows: InterventoRow[];
  total: number;
  page: number;
  pages: number;
}

/** Списъкът в обхвата — най-новите отгоре (по номер в рамките на фирмата). */
export async function listInterventi(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
}): Promise<InterventiPage> {
  const page = pageOf(options.page);
  const where = aziendaWhere(options.scope, options.azienda);
  const [total, rows] = await prisma.$transaction([
    prisma.intervento.count({ where }),
    prisma.intervento.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { numero: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
