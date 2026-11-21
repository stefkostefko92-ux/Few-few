import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { prisma } from '../db.js';
import { textParser, type FieldErrorCode } from '../schede/field-parsers.js';
import { queryTokens } from '../schede/search.js';
import { MAX } from './form.js';
import { centesimiDa, isAliquota, type Aliquota } from './importi.js';

/**
 * Ценоразписът на фирмата (C1): редове с код (по избор, единствен във фирмата), описание, мерна единица,
 * цена в центове и ставка на ДДС. Оттам се попълват редовете на офертата (в браузъра — само попълване:
 * цената на офертата е написаната в нея, ценоразписът по-късно не я сменя). До 1000 реда на фирма —
 * броят се проверява със заключен ред на фирмата (два записа едновременно не минават тавана). Пише
 * `preventivi:write` във фирмата; одитът `LISTINO_UPDATE` — само действието, без цените.
 */

export const MAX_VOCI = 1000;
export const VOCI_PER_PAGINA = 50;

export interface VoceData {
  codice: string | null;
  descrizione: string;
  unita: string;
  prezzo: number;
  iva: Aliquota;
}
export type ErroriVoce = Partial<Record<keyof VoceData, FieldErrorCode | 'duplicato'>>;

const testo = (max: number) => textParser({ kind: 'text', maxLength: max });

export function parseVoce(
  body: unknown,
): { ok: true; data: VoceData } | { ok: false; errors: ErroriVoce } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: ErroriVoce = {};
  const codice = testo(MAX.codice).safeParse(raw.codice ?? '');
  const descrizione = testo(MAX.descrizione).safeParse(raw.descrizione ?? '');
  const unita = testo(MAX.unita).safeParse(raw.unita ?? '');
  if (!codice.success) errors.codice = 'tooLong';
  if (!descrizione.success) errors.descrizione = 'tooLong';
  else if (!descrizione.data) errors.descrizione = 'required';
  if (!unita.success) errors.unita = 'tooLong';
  else if (!unita.data) errors.unita = 'required';
  const prezzoRaw = typeof raw.prezzo === 'string' ? raw.prezzo : '';
  const prezzo = prezzoRaw.trim() === '' ? null : centesimiDa(prezzoRaw);
  if (prezzoRaw.trim() === '') errors.prezzo = 'required';
  else if (prezzo === null) errors.prezzo = 'decimal';
  const iva = Number(typeof raw.iva === 'string' ? raw.iva : '22');
  if (!isAliquota(iva)) errors.iva = 'option';
  if (Object.keys(errors).length > 0 || !codice.success || !descrizione.success || !unita.success)
    return { ok: false, errors };
  return {
    ok: true,
    data: {
      codice: codice.data,
      descrizione: descrizione.data!,
      unita: unita.data!,
      prezzo: prezzo!,
      iva: iva as Aliquota,
    },
  };
}

const SELECT = {
  id: true,
  codice: true,
  descrizione: true,
  unita: true,
  prezzo: true,
  iva: true,
} satisfies Prisma.VoceListinoSelect;
export type Voce = Prisma.VoceListinoGetPayload<{ select: typeof SELECT }>;

/** Страница от ценоразписа (по код, после по описание); търсенето — всяка дума в кода или описанието. */
export async function listListino(aziendaId: string, query: string, page: number) {
  const tokens = queryTokens(query);
  const where: Prisma.VoceListinoWhereInput = {
    aziendaId,
    AND: tokens.map((token) => ({
      OR: [
        { codice: { contains: token, mode: 'insensitive' } },
        { descrizione: { contains: token, mode: 'insensitive' } },
      ],
    })),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.voceListino.count({ where }),
    prisma.voceListino.findMany({
      where,
      select: SELECT,
      orderBy: [{ codice: { sort: 'asc', nulls: 'last' } }, { descrizione: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * VOCI_PER_PAGINA,
      take: VOCI_PER_PAGINA,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / VOCI_PER_PAGINA)) };
}

/** Целият ценоразпис — за формата на офертата (подсказките) и за износа. */
export function tuttoIlListino(aziendaId: string): Promise<Voce[]> {
  return prisma.voceListino.findMany({
    where: { aziendaId },
    select: SELECT,
    orderBy: [{ codice: { sort: 'asc', nulls: 'last' } }, { descrizione: 'asc' }, { id: 'asc' }],
    take: MAX_VOCI,
  });
}

export function getVoce(aziendaId: string, id: string): Promise<Voce | null> {
  return prisma.voceListino.findFirst({ where: { id, aziendaId }, select: SELECT });
}

export type EsitoVoce = 'ok' | 'missing' | 'pieno' | 'duplicato';

const isDuplicato = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Нов ред (`id` null) или промяна; `pieno` — 1000 реда вече; `duplicato` — кодът е зает във фирмата. */
export async function salvaVoce(
  actorId: string,
  aziendaId: string,
  id: string | null,
  data: VoceData,
): Promise<EsitoVoce> {
  try {
    return await prisma.$transaction(async (tx) => {
      // Само при включени оферти и активна фирма, под заключения ред: MASTER, изключил офертите междувременно,
      // не оставя ред, записан след изключването (ревюто на Кодаджията, 14 ноември 2026).
      const azienda = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Azienda"
        WHERE "id" = ${aziendaId} AND "preventiviAttivi" AND "deactivatedAt" IS NULL
        FOR UPDATE`;
      if (azienda.length === 0) return 'missing';
      if (id === null) {
        if ((await tx.voceListino.count({ where: { aziendaId } })) >= MAX_VOCI) return 'pieno';
        await tx.voceListino.create({ data: { ...data, aziendaId } });
      } else {
        const updated = await tx.voceListino.updateMany({ where: { id, aziendaId }, data });
        if (updated.count === 0) return 'missing';
      }
      await writeAudit(
        {
          actorId,
          action: 'LISTINO_UPDATE',
          aziendaId,
          targetType: 'azienda',
          targetId: aziendaId,
          meta: { azione: id === null ? 'aggiunta' : 'modifica' },
        },
        tx,
      );
      return 'ok';
    });
  } catch (error) {
    if (isDuplicato(error)) return 'duplicato';
    throw error;
  }
}

export async function eliminaVoce(
  actorId: string,
  aziendaId: string,
  id: string,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Под същото заключване като добавянето и внасянето: ред не изчезва, докато внасянето го обновява.
    await tx.$queryRaw`SELECT "id" FROM "Azienda" WHERE "id" = ${aziendaId} FOR UPDATE`;
    const deleted = await tx.voceListino.deleteMany({ where: { id, aziendaId } });
    if (deleted.count === 0) return false;
    await writeAudit(
      {
        actorId,
        action: 'LISTINO_UPDATE',
        aziendaId,
        targetType: 'azienda',
        targetId: aziendaId,
        meta: { azione: 'eliminazione' },
      },
      tx,
    );
    return true;
  });
}

/** Ред от ценоразписа → полетата на формата (италианският запис на цената). */
export function valoriVoce(v: Omit<VoceData, 'iva'> & { iva: number }): Record<string, string> {
  return {
    codice: v.codice ?? '',
    descrizione: v.descrizione,
    unita: v.unita,
    prezzo: (v.prezzo / 100).toFixed(2).replace('.', ','),
    iva: String(v.iva),
  };
}
