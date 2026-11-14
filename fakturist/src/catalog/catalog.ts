import { prisma } from '../db.js';
import { audit } from '../audit.js';
import type { ItemInput, PartyInput } from './schemas.js';
import { afterText, PAGE_SIZE, pageOf, type Cursor } from '../http/pagination.js';

/**
 * Контрагентите и артикулите на фирмата (SPEC 42–43). Документът пази свое копие на данните в момента
 * на издаването (входът му) — промяна или архив тук не пипа издаденото. Одитът е без имена и адреси.
 */
export class CatalogError extends Error {
  constructor(readonly code: 'notFound') {
    super(code);
  }
}

function partyData(data: PartyInput) {
  return {
    kind: data.kind,
    name: data.name,
    eik: data.eik,
    vatNumber: data.vatNumber,
    countryCode: data.countryCode,
    addressStreet: data.addressStreet,
    addressCity: data.addressCity,
    postalCode: data.postalCode ?? '',
    email: data.email,
    // Електронният адрес по EN 16931 (BT-49): ДДС номерът под схема 9926, когато го има.
    eAddressScheme: data.vatNumber?.startsWith('BG') ? '9926' : null,
    eAddressValue: data.vatNumber?.startsWith('BG') ? data.vatNumber : null,
  };
}

export async function createParty(input: {
  organizationId: string;
  actorId: string;
  data: PartyInput;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const party = await tx.party.create({
      data: { organizationId: input.organizationId, ...partyData(input.data) },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'party.created',
      targetType: 'Party',
      targetId: party.id,
    });
    return { id: party.id };
  });
}

export async function updateParty(input: {
  organizationId: string;
  partyId: string;
  actorId: string;
  data: PartyInput;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.party.updateMany({
      where: { id: input.partyId, organizationId: input.organizationId },
      data: partyData(input.data),
    });
    if (updated.count !== 1) throw new CatalogError('notFound');
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'party.updated',
      targetType: 'Party',
      targetId: input.partyId,
    });
  });
}

/** Архив и връщане от архив — контрагентът не се трие (историята на фирмата го сочи). */
export async function setPartyArchived(input: {
  organizationId: string;
  partyId: string;
  actorId: string;
  archived: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.party.updateMany({
      where: { id: input.partyId, organizationId: input.organizationId },
      data: { archivedAt: input.archived ? new Date() : null },
    });
    if (updated.count !== 1) throw new CatalogError('notFound');
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: input.archived ? 'party.archived' : 'party.restored',
      targetType: 'Party',
      targetId: input.partyId,
    });
  });
}

function itemData(data: ItemInput) {
  return {
    name: data.name,
    unitCode: data.unitCode,
    netPrice: data.netPrice,
    vatCategory: data.vatCategory,
    vatRate: data.vatRate,
    sellerItemId: data.sellerItemId,
  };
}

export async function createItem(input: {
  organizationId: string;
  actorId: string;
  data: ItemInput;
}): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.create({
      data: { organizationId: input.organizationId, ...itemData(input.data) },
    });
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'item.created',
      targetType: 'Item',
      targetId: item.id,
    });
    return { id: item.id };
  });
}

export async function updateItem(input: {
  organizationId: string;
  itemId: string;
  actorId: string;
  data: ItemInput;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.item.updateMany({
      where: { id: input.itemId, organizationId: input.organizationId },
      data: itemData(input.data),
    });
    if (updated.count !== 1) throw new CatalogError('notFound');
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: 'item.updated',
      targetType: 'Item',
      targetId: input.itemId,
    });
  });
}

export async function setItemArchived(input: {
  organizationId: string;
  itemId: string;
  actorId: string;
  archived: boolean;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.item.updateMany({
      where: { id: input.itemId, organizationId: input.organizationId },
      data: { archivedAt: input.archived ? new Date() : null },
    });
    if (updated.count !== 1) throw new CatalogError('notFound');
    await audit(tx, {
      actorId: input.actorId,
      organizationId: input.organizationId,
      action: input.archived ? 'item.archived' : 'item.restored',
      targetType: 'Item',
      targetId: input.itemId,
    });
  });
}

/** Търсене по име, ЕИК или ДДС номер (без значение главни/малки); страници по (име, id). */
export async function searchParties(
  organizationId: string,
  query: string,
  archived: boolean,
  cursor: Cursor | null = null,
) {
  const q = query.trim().slice(0, 100);
  const rows = await prisma.party.findMany({
    where: {
      organizationId,
      archivedAt: archived ? { not: null } : null,
      AND: [afterText('name', cursor, 'asc')],
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { eik: { startsWith: q } },
              { vatNumber: { contains: q.toUpperCase() } },
            ],
          }
        : {}),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: PAGE_SIZE + 1,
  });
  return pageOf(rows, PAGE_SIZE, (row) => row.name);
}

export async function searchItems(
  organizationId: string,
  query: string,
  archived: boolean,
  cursor: Cursor | null = null,
) {
  const q = query.trim().slice(0, 100);
  const rows = await prisma.item.findMany({
    where: {
      organizationId,
      archivedAt: archived ? { not: null } : null,
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...afterText('name', cursor, 'asc'),
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: PAGE_SIZE + 1,
  });
  return pageOf(rows, PAGE_SIZE, (row) => row.name);
}
