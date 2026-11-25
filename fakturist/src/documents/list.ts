import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { PAYABLE_TYPES } from './payments.js';
import { sofiaToday } from '../time.js';
import { afterDate, PAGE_SIZE, pageOf, type Cursor } from '../http/pagination.js';

/**
 * Списъкът „Документи“ на фирмата: търсене, филтри и страници по ключ (createdAt, id). Всеки параметър
 * от адреса минава през затворен списък — непознатата стойност е „без филтър“, не грешка.
 */
export const DOCUMENT_FILTER_PARAMS = ['q', 'vid', 'sastoyanie', 'plashtane', 'ot', 'do'] as const;
export const LIST_TYPES = ['380', '381', '383', '384', '386', '389'] as const;
export const LIST_STATUSES = ['ISSUED', 'CANCELLED'] as const;
export const LIST_PAYMENTS = ['neplateni', 'prosrocheni', 'plateni'] as const;

export type DocumentFilter = {
  q: string;
  type: (typeof LIST_TYPES)[number] | '';
  status: (typeof LIST_STATUSES)[number] | '';
  payment: (typeof LIST_PAYMENTS)[number] | '';
  from: string;
  to: string;
};

function oneOf<T extends string>(list: readonly T[], value: unknown): T | '' {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
    ? (value as T)
    : '';
}

function isoDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

export function readDocumentFilter(query: Record<string, unknown>): DocumentFilter {
  const q = typeof query['q'] === 'string' ? query['q'].trim().slice(0, 100) : '';
  return {
    q,
    type: oneOf(LIST_TYPES, query['vid']),
    status: oneOf(LIST_STATUSES, query['sastoyanie']),
    payment: oneOf(LIST_PAYMENTS, query['plashtane']),
    from: isoDate(query['ot']),
    to: isoDate(query['do']),
  };
}

export function isFiltered(filter: DocumentFilter): boolean {
  return Object.values(filter).some((value) => value !== '');
}

function paymentWhere(payment: DocumentFilter['payment']): Prisma.DocumentWhereInput {
  if (!payment) return {};
  if (payment === 'plateni') return { paymentState: 'PAID' };
  const open: Prisma.DocumentWhereInput = {
    status: 'ISSUED',
    typeCode: { in: [...PAYABLE_TYPES] },
    payableCents: { gt: 0 },
    paymentState: { in: ['UNPAID', 'PARTIAL'] },
  };
  return payment === 'prosrocheni'
    ? { ...open, dueDate: { lt: new Date(`${sofiaToday()}T00:00:00Z`) } }
    : open;
}

export function documentWhere(
  organizationId: string,
  filter: DocumentFilter,
): Prisma.DocumentWhereInput {
  const issueDate: Prisma.DateTimeFilter = {};
  if (filter.from) issueDate.gte = new Date(`${filter.from}T00:00:00Z`);
  if (filter.to) issueDate.lte = new Date(`${filter.to}T00:00:00Z`);
  const q = filter.q;
  return {
    organizationId,
    ...(filter.type ? { typeCode: filter.type } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.from || filter.to ? { issueDate } : {}),
    AND: [
      q
        ? {
            OR: [
              { number: { contains: q } },
              { buyerName: { contains: q, mode: 'insensitive' } },
              { buyerEik: { startsWith: q } },
            ],
          }
        : {},
      paymentWhere(filter.payment),
    ],
  };
}

export const LIST_SELECT = {
  id: true,
  number: true,
  typeCode: true,
  status: true,
  issueDate: true,
  dueDate: true,
  buyerName: true,
  payableCents: true,
  currency: true,
  paymentState: true,
  createdAt: true,
} as const;

export async function listDocuments(
  organizationId: string,
  filter: DocumentFilter,
  cursor: Cursor | null,
) {
  const where = documentWhere(organizationId, filter);
  const [rows, total] = await Promise.all([
    prisma.document.findMany({
      where: { AND: [where, afterDate('createdAt', cursor, 'desc')] },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      select: LIST_SELECT,
    }),
    prisma.document.count({ where }),
  ]);
  const page = pageOf(rows, PAGE_SIZE, (row) => row.createdAt);
  const today = sofiaToday();
  return {
    items: page.items.map((row) => ({ ...row, badge: paymentBadge(row, today) })),
    next: page.next,
    total,
  };
}

/** Етикетът „Плащане“ в списъка: само за документ, по който се плаща; просрочен — по софийската дата. */
export function paymentBadge(
  row: {
    status: string;
    typeCode: string;
    payableCents: bigint;
    paymentState: string;
    dueDate: Date | null;
  },
  today: string,
): 'overdue' | 'UNPAID' | 'PARTIAL' | 'PAID' | null {
  const payable =
    row.status === 'ISSUED' &&
    (PAYABLE_TYPES as readonly string[]).includes(row.typeCode) &&
    row.payableCents > 0n;
  if (!payable) return null;
  if (row.paymentState === 'PAID') return 'PAID';
  if (row.dueDate && row.dueDate.toISOString().slice(0, 10) < today) return 'overdue';
  return row.paymentState === 'PARTIAL' ? 'PARTIAL' : 'UNPAID';
}
