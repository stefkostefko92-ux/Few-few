import 'server-only';
// The company's price list on the server: its own prices over the ones the articles start from (Panev's list), and
// what a page may show — the prices go only to whoever may see them (the owner and the Commerciale), never to a page of
// the Progettista or the Tecnico.
import type { SessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { costOf, pricesOf, type BomLine, type Cost } from '@/lib/prices/cost';
import { customLines, customPrices, type CustomItem } from '@/lib/prices/custom';

export async function companyPrices(companyId: string): Promise<Map<string, number>> {
  return pricesOf(await prisma.priceItem.findMany({ where: { companyId }, select: { key: true, cents: true } }));
}

/** The prices for a page of this user [cents by key]; null: the user does not see prices. */
export async function visiblePrices(user: SessionUser): Promise<Record<string, number> | null> {
  return can(user, 'prices:view') ? Object.fromEntries(await companyPrices(user.companyId)) : null;
}

/** The company's free lines, in their order. */
export const companyCustom = (companyId: string): Promise<CustomItem[]> =>
  prisma.customPriceItem.findMany({ where: { companyId }, orderBy: { position: 'asc' }, select: { id: true, text: true, cents: true, basis: true, scope: true } });

/** What a project costs for this user (null: the user does not see prices): its articles with the company's prices,
 *  and the company's free lines that this kind of project takes, counted by their basis; `skipped`: the free lines by
 *  the stop a replacement cannot count. */
export async function projectCost(user: SessionUser, bom: readonly BomLine[], kind: 'full' | 'replacement', basis: { stops: number | null; travel: number }):
  Promise<{ cost: Cost; skipped: string[] } | null> {
  if (!can(user, 'prices:view')) return null;
  const [prices, custom] = await Promise.all([companyPrices(user.companyId), companyCustom(user.companyId)]);
  const c = customLines(custom, kind, basis);
  for (const [k, v] of customPrices(custom)) prices.set(k, v);
  return { cost: costOf([...bom, ...c.lines], prices), skipped: c.skipped };
}
