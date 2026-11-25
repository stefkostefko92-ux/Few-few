import { prisma } from '../db.js';
import { LEGAL_DOCUMENTS } from './documents.js';

/** Какво още трябва да приеме човекът (SPEC 92). */
export interface PendingLegal {
  /** Общите условия с текущата версия — за себе си. */
  terms: boolean;
  /** Действащите фирми, на които е пряк собственик, без договора за обработване с текущата версия. */
  companies: Array<{ id: string; legalName: string }>;
}

const NOTHING: PendingLegal = { terms: false, companies: [] };

/**
 * Актуалните условия (собственикът, 17.11.2026 — новата версия „в сила веднага“): човек без приети общи условия с
 * текущата версия и пряк собственик без договора за обработване с текущата версия за своя фирма приемат при
 * следващия вход. Така приема и собственик, създаден от мастъра (нов профил без регистрация). Мастърът е
 * екипът на услугата — не се спира. Прекратена или изтрита фирма не иска договор.
 */
export async function pendingLegal(
  userId: string,
  /** Ролята от сесията — спестява заявката на всяка страница в приложението (Кодаджията, 25.11.2026). */
  knownRole?: string,
): Promise<PendingLegal> {
  const role =
    knownRole ??
    (await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } }))
      ?.platformRole;
  if (role !== 'NONE') return NOTHING;
  const [terms, owned] = await Promise.all([
    prisma.legalAcceptance.count({
      where: { userId, document: 'terms', version: LEGAL_DOCUMENTS.terms.version },
    }),
    prisma.membership.findMany({
      where: {
        userId,
        role: 'OWNER',
        organization: { deletedAt: null, terminatedAt: null },
      },
      orderBy: { organization: { legalName: 'asc' } },
      select: {
        organization: {
          select: {
            id: true,
            legalName: true,
            legalAcceptances: {
              where: { userId, document: 'dpa', version: LEGAL_DOCUMENTS.dpa.version },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    }),
  ]);
  return {
    terms: terms === 0,
    companies: owned
      .filter((m) => m.organization.legalAcceptances.length === 0)
      .map((m) => ({ id: m.organization.id, legalName: m.organization.legalName })),
  };
}

export const hasPending = (pending: PendingLegal): boolean =>
  pending.terms || pending.companies.length > 0;
