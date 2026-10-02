'use server';
// The owner saves the company's price list: every price typed (empty: back to the article's start, or none), checked
// all together before anything is written; one transaction, one line in the audit with how many changed.
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { PRICE_ARTICLES } from '@/lib/prices/articles';
import { parseCents } from '@/lib/prices/cost';
import { str, type FormState } from './form';

export async function savePricesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const me = await getSessionUser();
  if (!me || me.mustChangePassword || !can(me, 'prices:edit')) return { error: 'forbidden' };
  if (!rateLimit(`prices:${me.id}`, 30, 60 * 60 * 1000)) return { error: 'rateLimited' };
  const l = str(fd, 'locale'), locale = isLocale(l) ? l : DEFAULT_LOCALE;
  const typed = new Map<string, number | null>(), bad: string[] = [];
  for (const a of PRICE_ARTICLES) {
    const raw = fd.get(`p:${a.key}`);
    if (typeof raw !== 'string') continue;
    const cents = parseCents(raw.slice(0, 32), locale);
    if (cents === undefined) bad.push(a.key);
    // the start typed again, or nothing: no price of the company's own
    else typed.set(a.key, cents === null || cents === a.start?.cents ? null : cents);
  }
  if (bad.length) return { error: 'invalidPrices', fields: bad };
  const own = new Map((await prisma.priceItem.findMany({ where: { companyId: me.companyId }, select: { key: true, cents: true } })).map((p) => [p.key, p.cents]));
  const drop = [...typed].filter(([k, v]) => v === null && own.has(k)).map(([k]) => k);
  const put = [...typed].filter((e): e is [string, number] => e[1] !== null && own.get(e[0]) !== e[1]);
  if (drop.length || put.length) {
    await prisma.$transaction([
      prisma.priceItem.deleteMany({ where: { companyId: me.companyId, key: { in: drop } } }),
      ...put.map(([key, cents]) => prisma.priceItem.upsert({
        where: { companyId_key: { companyId: me.companyId, key } }, create: { companyId: me.companyId, key, cents, updatedById: me.id }, update: { cents, updatedById: me.id },
      })),
    ]);
    await audit({ companyId: me.companyId, userId: me.id, action: 'PRICES_UPDATED', entity: 'Company', entityId: me.companyId, meta: { changed: drop.length + put.length } });
  }
  revalidatePath(`/${locale}/app/prices`);
  return { ok: true, message: String(drop.length + put.length) };
}
