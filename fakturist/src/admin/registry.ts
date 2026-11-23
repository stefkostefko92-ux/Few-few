import { prisma } from '../db.js';
import { ADMIN_RESOURCES, type AdminResource } from './resources.js';

export { ADMIN_RESOURCES, type AdminResource };

/** Минималният интерфейс на делегат на Prisma, който панелът ползва — само четене. */
interface ReadDelegate {
  findMany(args: {
    where?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<Array<Record<string, unknown>>>;
  count(args: { where?: unknown }): Promise<number>;
  findUnique(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
}

function delegateOf(model: string): ReadDelegate {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate: unknown = (prisma as unknown as Record<string, unknown>)[name];
  if (
    typeof delegate !== 'object' ||
    delegate === null ||
    !('findMany' in delegate) ||
    !('count' in delegate) ||
    !('findUnique' in delegate)
  ) {
    throw new Error(`Няма делегат за ${model}`);
  }
  return delegate as ReadDelegate;
}

export function resourceBySlug(slug: string): AdminResource | undefined {
  return ADMIN_RESOURCES.find((resource) => resource.slug === slug);
}

function searchWhere(resource: AdminResource, q: string): unknown {
  if (!q) return undefined;
  return {
    OR: resource.search.map((field) => ({ [field]: { contains: q, mode: 'insensitive' } })),
  };
}

/** Махa скритите полета — каквото не е позволено, не стига до изгледа дори по грешка в шаблона. */
export function redact(
  resource: AdminResource,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!resource.hidden.includes(key)) out[key] = value;
  }
  return out;
}

export const PAGE_SIZE = 50;

export async function listResource(
  resource: AdminResource,
  q: string,
  page: number,
): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
  const delegate = delegateOf(resource.model);
  const where = searchWhere(resource, q);
  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: resource.orderBy,
      skip: (Math.max(1, page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    delegate.count({ where }),
  ]);
  return { rows: rows.map((row) => redact(resource, row)), total };
}

export async function getResource(
  resource: AdminResource,
  id: string,
): Promise<Record<string, unknown> | null> {
  const field = resource.idField ?? 'id';
  // Одитът е с числов ключ — нечислов адрес е просто липсващ запис (404), не грешка на базата.
  if (resource.model === 'AuditLog' && !/^\d{1,19}$/.test(id)) return null;
  const value = resource.model === 'AuditLog' ? BigInt(id) : id;
  const row = await delegateOf(resource.model).findUnique({ where: { [field]: value } });
  return row ? redact(resource, row) : null;
}

export async function countResource(resource: AdminResource): Promise<number> {
  return delegateOf(resource.model).count({});
}
