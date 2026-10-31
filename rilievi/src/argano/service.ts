import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { datiSalvati, type DatiArgano } from './dati.js';

/**
 * Записаното изчисление за аргано на картата: четене (с недоверие — `datiSalvati`) и запис върху
 * отворената версия (`base` = updatedAt на изчислението; празно — още няма). Проверката коя карта и дали
 * човекът пише в нейната фирма е в маршрута; тук картата се търси пак — не в кошчето.
 */

export interface CalcoloSalvato {
  dati: DatiArgano | null;
  updatedAt: Date;
  autore: string | null;
}

export async function leggiCalcolo(schedaId: string): Promise<CalcoloSalvato | null> {
  const row = await prisma.calcoloArgano.findUnique({
    where: { schedaId },
    select: { dati: true, updatedAt: true, updatedBy: { select: { name: true } } },
  });
  return row
    ? { dati: datiSalvati(row.dati), updatedAt: row.updatedAt, autore: row.updatedBy?.name ?? null }
    : null;
}

export type EsitoCalcolo = 'ok' | 'conflict' | 'missing';

export async function salvaCalcolo(
  scheda: { id: string; aziendaId: string },
  base: string,
  dati: DatiArgano,
  actorId: string,
): Promise<EsitoCalcolo> {
  try {
    return await prisma.$transaction(async (tx) => {
      const viva = await tx.scheda.findFirst({
        where: { id: scheda.id, aziendaId: scheda.aziendaId, deletedAt: null },
        select: { id: true },
      });
      if (!viva) return 'missing';
      const current = await tx.calcoloArgano.findUnique({
        where: { schedaId: scheda.id },
        select: { updatedAt: true },
      });
      const json = dati as unknown as Prisma.InputJsonObject;
      if (current) {
        if (base !== current.updatedAt.toISOString()) return 'conflict';
        const updated = await tx.calcoloArgano.updateMany({
          where: { schedaId: scheda.id, updatedAt: current.updatedAt },
          data: { dati: json, updatedById: actorId },
        });
        if (updated.count === 0) return 'conflict';
      } else {
        if (base !== '') return 'conflict';
        await tx.calcoloArgano.create({
          data: { schedaId: scheda.id, dati: json, updatedById: actorId },
        });
      }
      await writeAudit(
        {
          actorId,
          action: 'ARGANO_CALCOLO',
          aziendaId: scheda.aziendaId,
          targetType: 'scheda',
          targetId: scheda.id,
        },
        tx,
      );
      return 'ok';
    });
  } catch (error) {
    // Двама записват първото изчисление едновременно (уникалната карта) — вторият е конфликт.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return 'conflict';
    throw error;
  }
}

/** Фирмата на картата за главата на PDF-а (логото и данните ѝ — `testataDi`). */
export function aziendaDellaScheda(aziendaId: string) {
  return prisma.azienda.findUniqueOrThrow({
    where: { id: aziendaId },
    select: { id: true, name: true, logoType: true, datiSocietari: true },
  });
}
