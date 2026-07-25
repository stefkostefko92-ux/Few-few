// Активните сесии на потребителя.
//
// Досега refresh token-ът беше ЕДИН хеш върху `User`: вход от втори компютър
// мълчаливо изхвърляше първия, нямаше как да се види откъде е влизано, и
// „прекрати всички сесии" при уволнен служител не съществуваше. Всяка от трите
// липси е въпрос, който ИТ отделът на клиента задава преди подпис.

import { prisma } from "@/lib/prisma";
import { hashRefresh, refreshScadenza } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient | typeof prisma;

/** Таван на едновременните сесии — по-старите падат сами. */
export const MAX_SESSIONI = 10;

export async function apriSessione(
  utenteId: string,
  token: string,
  contesto: { userAgent?: string | null; ip?: string | null },
  db: Db = prisma,
): Promise<void> {
  await db.sessioneAttiva.create({
    data: {
      utenteId,
      tokenHash: hashRefresh(token),
      // Дългият User-Agent не носи повече смисъл в списък от устройства.
      userAgent: contesto.userAgent?.slice(0, 300) ?? null,
      ip: contesto.ip ?? null,
      scadenza: refreshScadenza(),
    },
  });

  // Без таван всеки вход добавя ред завинаги: списъкът става безполезен, а
  // прозорецът за откраднат токен — колкото историята на потребителя.
  const attive = await db.sessioneAttiva.findMany({
    where: { utenteId, revocataAt: null },
    orderBy: { ultimoUso: "desc" },
    select: { id: true },
    skip: MAX_SESSIONI,
  });
  if (attive.length)
    await db.sessioneAttiva.updateMany({
      where: { id: { in: attive.map((a) => a.id) } },
      data: { revocataAt: new Date() },
    });
}

/** Намира ЖИВА сесия по токен. Изтеклата и отменената не се броят. */
export async function trovaSessione(token: string) {
  return prisma.sessioneAttiva.findFirst({
    where: {
      tokenHash: hashRefresh(token),
      revocataAt: null,
      scadenza: { gt: new Date() },
    },
    include: { utente: { select: { id: true, attivo: true, ruolo: true, nome: true, cognome: true, tenantId: true } } },
  });
}

/** Ротация: старият токен се отменя, новият заема мястото му в СЪЩИЯ ред. */
export async function ruotaSessione(
  sessioneId: string,
  nuovoToken: string,
  db: Db = prisma,
): Promise<void> {
  await db.sessioneAttiva.update({
    where: { id: sessioneId },
    data: {
      tokenHash: hashRefresh(nuovoToken),
      ultimoUso: new Date(),
      scadenza: refreshScadenza(),
    },
  });
}

export async function revocaSessione(id: string, utenteId: string): Promise<boolean> {
  const { count } = await prisma.sessioneAttiva.updateMany({
    where: { id, utenteId, revocataAt: null },
    data: { revocataAt: new Date() },
  });
  return count > 0;
}

/** Прекратява всички сесии на потребителя. Ползва се и при смяна на парола. */
export async function revocaTutte(
  utenteId: string,
  eccetto?: string,
  db: Db = prisma,
): Promise<number> {
  const { count } = await db.sessioneAttiva.updateMany({
    where: { utenteId, revocataAt: null, ...(eccetto ? { id: { not: eccetto } } : {}) },
    data: { revocataAt: new Date() },
  });
  return count;
}

export async function elencoSessioni(utenteId: string) {
  return prisma.sessioneAttiva.findMany({
    where: { utenteId, revocataAt: null, scadenza: { gt: new Date() } },
    orderBy: { ultimoUso: "desc" },
    // Хешът на токена НЕ излиза навън — с него се подменя сесия.
    select: { id: true, userAgent: true, ip: true, ultimoUso: true, createdAt: true },
  });
}
