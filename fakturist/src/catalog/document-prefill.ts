import { prisma } from '../db.js';
import { audit } from '../audit.js';
import { errorMessage, logger } from '../logger.js';
import { PartyForm } from './schemas.js';

/**
 * Каталогът във формата за нов документ (SPEC 42–43): избраният контрагент попълва получателя, а
 * отметката „Запази получателя като контрагент“ го пази след успешното издаване.
 */

/** Стойностите на получателя във формата (имената на полетата от views/app/document-new.ejs). */
export async function buyerFromParty(
  organizationId: string,
  partyId: unknown,
): Promise<Record<string, string> | null> {
  if (typeof partyId !== 'string' || !/^[a-z0-9]{20,40}$/.test(partyId)) return null;
  const party = await prisma.party.findFirst({
    where: { id: partyId, organizationId, archivedAt: null },
  });
  if (!party) return null;
  return {
    name: party.name,
    legalId: party.eik ?? '',
    vatId: party.vatNumber ?? '',
    street: party.addressStreet,
    city: party.addressCity,
    postalCode: party.postalCode,
    countryCode: party.countryCode,
    email: party.email ?? '',
  };
}

/** Активните контрагенти и артикули за списъците във формата (до 500 от всеки). */
export async function catalogForForm(organizationId: string) {
  const [parties, items] = await Promise.all([
    prisma.party.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: 'asc' },
      take: 500,
    }),
    prisma.item.findMany({
      where: { organizationId, archivedAt: null },
      orderBy: { name: 'asc' },
      take: 500,
    }),
  ]);
  return { parties, items };
}

function field(record: unknown, name: string): string {
  if (typeof record !== 'object' || record === null) return '';
  const value = (record as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

/**
 * След издаване: получателят става контрагент, ако такъв още няма (същият ЕИК, или същото име без ЕИК).
 * Невалидни данни (напр. чуждестранен адрес без град) просто не се пазят — документът вече е издаден.
 */
export async function saveBuyerAsParty(input: {
  organizationId: string;
  actorId: string;
  buyer: unknown;
}): Promise<void> {
  try {
    const parsed = PartyForm.safeParse({
      kind: 'CUSTOMER',
      name: field(input.buyer, 'name'),
      eik: field(input.buyer, 'legalId'),
      vatNumber: field(input.buyer, 'vatId'),
      countryCode: field(input.buyer, 'countryCode') || 'BG',
      addressStreet: field(input.buyer, 'street'),
      addressCity: field(input.buyer, 'city'),
      postalCode: field(input.buyer, 'postalCode'),
      email: field(input.buyer, 'email'),
    });
    if (!parsed.success) return;
    const data = parsed.data;
    const existing = await prisma.party.findFirst({
      where: {
        organizationId: input.organizationId,
        ...(data.eik ? { eik: data.eik } : { eik: null, name: data.name }),
      },
      select: { id: true },
    });
    if (existing) return;
    await prisma.$transaction(async (tx) => {
      const party = await tx.party.create({
        data: {
          organizationId: input.organizationId,
          kind: 'CUSTOMER',
          name: data.name,
          eik: data.eik,
          vatNumber: data.vatNumber,
          countryCode: data.countryCode,
          addressStreet: data.addressStreet,
          addressCity: data.addressCity,
          postalCode: data.postalCode ?? '',
          email: data.email,
          eAddressScheme: data.vatNumber?.startsWith('BG') ? '9926' : null,
          eAddressValue: data.vatNumber?.startsWith('BG') ? data.vatNumber : null,
        },
      });
      await audit(tx, {
        actorId: input.actorId,
        organizationId: input.organizationId,
        action: 'party.created',
        targetType: 'Party',
        targetId: party.id,
        details: { fromDocument: true },
      });
    });
  } catch (error) {
    logger.warn({ err: errorMessage(error) }, 'получателят не се запази като контрагент');
  }
}
