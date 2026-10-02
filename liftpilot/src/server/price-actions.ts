'use server';
// The owner saves the company's price list: every price typed (empty: back to the article's start, or none) and the
// free lines (words, price, basis, projects), checked all together before anything is written; one transaction, one
// line in the audit with how many changed.
import { revalidatePath } from 'next/cache';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { prisma } from '@/lib/db';
import { audit } from '@/lib/audit';
import { getSessionUser } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { rateLimit } from '@/lib/ratelimit';
import { PRICE_ARTICLES } from '@/lib/prices/articles';
import { parseCents } from '@/lib/prices/cost';
import { CUSTOM_MAX, customRowSchema } from '@/lib/prices/custom';
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
  // the free lines in their order: a row left empty is dropped; a form without them (a page from before they existed)
  // leaves them as they are
  const rows: { text: string; cents: number; basis: 'LOT' | 'STOP' | 'TRAVEL'; scope: 'ALL' | 'FULL' | 'REPLACEMENT' }[] = [];
  const sent = fd.has('c:count'), count = Math.min(CUSTOM_MAX, Math.max(0, Math.trunc(Number(str(fd, 'c:count')) || 0)));
  for (let i = 0; i < count; i++) {
    const text = str(fd, `c:${i}:text`).slice(0, 200), price = str(fd, `c:${i}:price`).slice(0, 32);
    if (!text.trim() && !price.trim()) continue;
    const cents = parseCents(price, locale), row = customRowSchema.safeParse({ text, cents, basis: str(fd, `c:${i}:basis`), scope: str(fd, `c:${i}:scope`) });
    if (!row.success || cents == null) bad.push(`c:${i}`); else rows.push(row.data);
  }
  if (bad.length) return { error: 'invalidPrices', fields: bad };
  const before = sent ? await prisma.customPriceItem.findMany({ where: { companyId: me.companyId }, orderBy: { position: 'asc' }, select: { text: true, cents: true, basis: true, scope: true } }) : [];
  const sameCustom = !sent || (before.length === rows.length && before.every((b, i) => b.text === rows[i]?.text && b.cents === rows[i]?.cents && b.basis === rows[i]?.basis && b.scope === rows[i]?.scope));
  const own = new Map((await prisma.priceItem.findMany({ where: { companyId: me.companyId }, select: { key: true, cents: true } })).map((p) => [p.key, p.cents]));
  const drop = [...typed].filter(([k, v]) => v === null && own.has(k)).map(([k]) => k);
  const put = [...typed].filter((e): e is [string, number] => e[1] !== null && own.get(e[0]) !== e[1]);
  const changed = drop.length + put.length + (sameCustom ? 0 : Math.max(rows.length, before.length));
  if (changed) {
    // the company locked first, as the seats are: two saves at once (two tabs) replace the free lines one after the
    // other instead of both inserting theirs
    await prisma.$transaction([
      prisma.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${me.companyId} FOR UPDATE`,
      ...(sameCustom ? [] : [
        prisma.customPriceItem.deleteMany({ where: { companyId: me.companyId } }),
        prisma.customPriceItem.createMany({ data: rows.map((r, position) => ({ companyId: me.companyId, ...r, position, updatedById: me.id })) }),
      ]),
      prisma.priceItem.deleteMany({ where: { companyId: me.companyId, key: { in: drop } } }),
      ...put.map(([key, cents]) => prisma.priceItem.upsert({
        where: { companyId_key: { companyId: me.companyId, key } }, create: { companyId: me.companyId, key, cents, updatedById: me.id }, update: { cents, updatedById: me.id },
      })),
    ]);
    await audit({ companyId: me.companyId, userId: me.id, action: 'PRICES_UPDATED', entity: 'Company', entityId: me.companyId, meta: { changed, custom: sent ? rows.length : null } });
  }
  revalidatePath(`/${locale}/app/prices`);
  return { ok: true, message: String(changed) };
}
