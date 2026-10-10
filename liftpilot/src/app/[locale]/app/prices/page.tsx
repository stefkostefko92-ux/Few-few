import { getTranslations, setRequestLocale } from 'next-intl/server';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { PRICE_ARTICLES } from '@/lib/prices/articles';
import { makeFmt } from '@/lib/present/tr';
import { companyCustom } from '@/server/prices';
import PriceList, { type PriceRow } from '@/components/prices/PriceList';
import AccountHead from '@/components/AccountHead';

export async function generateMetadata() {
  const t = await getTranslations('prices');
  return { title: t('title') };
}

// The company's price list and its free lines: the owner keeps it, the Commerciale reads it; the projects and the draft
// orders take their prices from here, only for those two.
export default async function PricesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'prices:view');
  const [t, own, free] = await Promise.all([getTranslations('prices'), prisma.priceItem.findMany({ where: { companyId: me.companyId }, select: { key: true, cents: true } }),
    companyCustom(me.companyId)]);
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']), mine = new Map(own.map((p) => [p.key, p.cents]));
  const rows: PriceRow[] = PRICE_ARTICLES.map((a) => ({
    key: a.key, group: a.group, item: a.label.item, ...(a.label.name ? { name: a.label.name } : {}), unit: a.unit, src: a.start?.src ?? null, own: mine.has(a.key),
  }));
  const values = Object.fromEntries(PRICE_ARTICLES.map((a) => {
    const c = mine.get(a.key) ?? a.start?.cents;
    return [a.key, c === undefined ? '' : fmt(c / 100, 2)];
  }));
  const custom = free.map((c) => ({ text: c.text, price: fmt(c.cents / 100, 2), basis: c.basis, scope: c.scope }));
  const editable = can(me, 'prices:edit');
  return (
    <main className="page">
      <AccountHead area="company" title={t('title')} lead={editable ? t('lead') : t('leadView')} />
      <p className="note">{t('scope')}</p>
      <PriceList rows={rows} values={values} custom={custom} editable={editable} />
    </main>
  );
}
