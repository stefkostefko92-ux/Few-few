import { Prisma } from '@prisma/client';
import { writeAudit } from '../audit.js';
import { aziendaWhere, type Scope } from '../auth/scope.js';
import { prisma } from '../db.js';
import { PAGE_SIZE, pageOf } from '../schede/list.js';
import { queryTokens } from '../schede/search.js';
import { searchTextCliente, type ClienteData } from './form.js';

/**
 * Клиентите на фирмата (собственикът, 13 ноември 2026): регистър с профили, от който офертата взема клиента,
 * без да се пише наново. Живее с офертите — само във фирма, в която MASTER ги е включил, или с архив
 * (изключени оферти с данни: четене и изтриване — auth/scope.ts); чете `preventivi:read`, пише `preventivi:write`,
 * обхватът идва от маршрута. До 2000 на фирма — броят под заключен ред на фирмата. Промяна — само върху
 * отворената версия (`base` = updatedAt). Изтриването е окончателно; офертите на клиента остават с
 * написаното в тях (връзката им пада — `ON DELETE SET NULL`). Одитът — в същата транзакция, без лични данни.
 * Клиентът на оферта към регистъра — dal-preventivo.ts.
 */

export const MAX_CLIENTI = 2000;

/** Фирмите с включени оферти и тези с архив (изключени, с данни) — кой какво вижда решава обхватът. */
const ATTIVI = {
  azienda: { OR: [{ preventiviAttivi: true }, { preventiviArchivio: true }] },
} satisfies Prisma.ClienteWhereInput;

const SELECT = {
  id: true,
  aziendaId: true,
  nome: true,
  indirizzo: true,
  piva: true,
  email: true,
  telefono: true,
  referente: true,
  note: true,
  createdAt: true,
  updatedAt: true,
  azienda: { select: { id: true, name: true, preventiviAttivi: true } },
} satisfies Prisma.ClienteSelect;

export type ClienteFull = Prisma.ClienteGetPayload<{ select: typeof SELECT }>;

/** Клиентът в обхвата, или null — няма го, на друга фирма е или офертите на фирмата са изключени. */
export function getCliente(scope: Scope, id: string): Promise<ClienteFull | null> {
  return prisma.cliente.findFirst({
    where: { id, ...aziendaWhere(scope), ...ATTIVI },
    select: SELECT,
  });
}

const LIST_SELECT = {
  id: true,
  nome: true,
  indirizzo: true,
  piva: true,
  email: true,
  telefono: true,
  referente: true,
  azienda: { select: { name: true } },
  _count: { select: { preventivi: true } },
} satisfies Prisma.ClienteSelect;

/** Списъкът по име; търсенето — всяка дума в името, адреса, P. IVA, имейла, телефона или лицето за контакт. */
export async function listClienti(options: {
  scope: Scope;
  azienda?: string | null;
  page?: unknown;
  query?: string;
}) {
  const page = pageOf(options.page);
  const tokens = queryTokens(options.query ?? '');
  const where: Prisma.ClienteWhereInput = {
    ...aziendaWhere(options.scope, options.azienda),
    ...ATTIVI,
    AND: tokens.map((token) => ({ searchText: { contains: token } })),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.cliente.count({ where }),
    prisma.cliente.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ nome: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Клиентите на фирмата за формата на офертата: само каквото офертата пише за клиента. */
export function clientiPerPreventivo(aziendaId: string) {
  return prisma.cliente.findMany({
    where: { aziendaId },
    select: { id: true, nome: true, indirizzo: true, piva: true, email: true },
    orderBy: [{ nome: 'asc' }, { id: 'asc' }],
    take: MAX_CLIENTI,
  });
}

/** Колко оферти от профила се показват — останалите са число. */
export const PREVENTIVI_NEL_PROFILO = 50;

/** Офертите на клиента (най-новите отгоре) и броят им. */
export async function preventiviDelCliente(aziendaId: string, clienteId: string) {
  const where = { aziendaId, clienteId } satisfies Prisma.PreventivoWhereInput;
  const [total, rows] = await prisma.$transaction([
    prisma.preventivo.count({ where }),
    prisma.preventivo.findMany({
      where,
      orderBy: [{ data: 'desc' }, { numero: 'desc' }],
      select: { id: true, numero: true, data: true, oggetto: true, stato: true, totale: true },
      take: PREVENTIVI_NEL_PROFILO,
    }),
  ]);
  return { total, rows };
}

/** Името за сравнение: без главни и малки, с един интервал между думите. */
const nomeUguale = (a: string, b: string): boolean => {
  const piano = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();
  return piano(a) === piano(b);
};

/**
 * Профилът, с който офертата може да се свърже — иначе null. Връзката не се приема от формата на доверие:
 * само клиент на същата фирма (чужд или изтрит не се свързва) и само ако офертата го назовава — името в нея
 * е името на профила (без главни и малки). Така оферта не стои в профила на клиент, когото не назовава, и
 * без JavaScript (ревюто на Кодаджията, 13 ноември 2026). В транзакцията на офертата.
 */
export async function clienteDellAzienda(
  tx: Prisma.TransactionClient,
  aziendaId: string,
  id: string | null | undefined,
  nomeNelPreventivo: string,
): Promise<string | null> {
  if (!id) return null;
  const row = await tx.cliente.findFirst({
    where: { id, aziendaId },
    select: { id: true, nome: true },
  });
  return row && nomeUguale(row.nome, nomeNelPreventivo) ? row.id : null;
}

export type EsitoCliente =
  { esito: 'ok'; id: string } | { esito: 'missing' | 'pieno' | 'conflict' };

/** Редът на фирмата, заключен до края — броят не се разминава; само при включени оферти и активна фирма. */
export async function bloccaAzienda(
  tx: Prisma.TransactionClient,
  aziendaId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Azienda"
    WHERE "id" = ${aziendaId} AND "preventiviAttivi" AND "deactivatedAt" IS NULL
    FOR UPDATE`;
  return rows.length > 0;
}

export const registroPieno = async (
  tx: Prisma.TransactionClient,
  aziendaId: string,
): Promise<boolean> => (await tx.cliente.count({ where: { aziendaId } })) >= MAX_CLIENTI;

export function auditCliente(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: 'CLIENTE_CREATE' | 'CLIENTE_UPDATE' | 'CLIENTE_DELETE',
  aziendaId: string,
  id: string,
  meta: Prisma.InputJsonObject = {},
) {
  return writeAudit({ actorId, action, aziendaId, targetType: 'cliente', targetId: id, meta }, tx);
}

export function createCliente(
  actorId: string,
  aziendaId: string,
  data: ClienteData,
): Promise<EsitoCliente> {
  return prisma.$transaction(async (tx) => {
    if (!(await bloccaAzienda(tx, aziendaId))) return { esito: 'missing' } as const;
    if (await registroPieno(tx, aziendaId)) return { esito: 'pieno' } as const;
    const row = await tx.cliente.create({
      data: { ...data, aziendaId, searchText: searchTextCliente(data) },
      select: { id: true },
    });
    await auditCliente(tx, actorId, 'CLIENTE_CREATE', aziendaId, row.id);
    return { esito: 'ok', id: row.id } as const;
  });
}

/** Промяна върху отворената версия; `conflict` — друг е записал междувременно. */
export function updateCliente(options: {
  id: string;
  aziendaId: string;
  base: string;
  data: ClienteData;
  actorId: string;
}): Promise<EsitoCliente> {
  const { id, aziendaId, data, actorId } = options;
  const base = new Date(options.base);
  return prisma.$transaction(async (tx) => {
    const current = await tx.cliente.findFirst({
      where: { id, aziendaId },
      select: { updatedAt: true },
    });
    if (!current) return { esito: 'missing' } as const;
    if (Number.isNaN(base.getTime()) || current.updatedAt.getTime() !== base.getTime())
      return { esito: 'conflict' } as const;
    const updated = await tx.cliente.updateMany({
      where: { id, aziendaId, updatedAt: base },
      data: { ...data, searchText: searchTextCliente(data) },
    });
    if (updated.count === 0) return { esito: 'conflict' } as const;
    await auditCliente(tx, actorId, 'CLIENTE_UPDATE', aziendaId, id);
    return { esito: 'ok', id } as const;
  });
}

/** Изтрива профила; офертите му остават с написаното в тях (одитът казва колко са били). */
export function eliminaCliente(actorId: string, aziendaId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const preventivi = await tx.preventivo.count({ where: { aziendaId, clienteId: id } });
    const deleted = await tx.cliente.deleteMany({ where: { id, aziendaId } });
    if (deleted.count === 0) return false;
    await auditCliente(tx, actorId, 'CLIENTE_DELETE', aziendaId, id, { preventivi });
    return true;
  });
}
