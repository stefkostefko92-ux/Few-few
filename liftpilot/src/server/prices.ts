import 'server-only';
// The company's price list on the server: its own prices over the ones the articles start from (Panev's list), and
// what a page may show — the prices go only to whoever may see them (the owner and the Commerciale), never to a page of
// the Progettista or the Tecnico.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { pricesOf } from '@/lib/prices/cost';

export async function companyPrices(companyId: string): Promise<Map<string, number>> {
  return pricesOf(await prisma.priceItem.findMany({ where: { companyId }, select: { key: true, cents: true } }));
}

/** The prices for a page of this user [cents by key]; null: the user does not see prices. */
export async function visiblePrices(user: SessionUser): Promise<Record<string, number> | null> {
  return can(user, 'prices:view') ? Object.fromEntries(await companyPrices(user.companyId)) : null;
}
