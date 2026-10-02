import { getTranslations, setRequestLocale } from 'next-intl/server';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { can } from '@/lib/rbac';
import { PRICE_ARTICLES } from '@/lib/prices/articles';
import { makeFmt } from '@/lib/present/tr';
import PriceList, { type PriceRow } from '@/components/prices/PriceList';

export async function generateMetadata() {
  const t = await getTranslations('prices');
  return { title: t('title') };
}

// The company's price list: the owner keeps it, the Commerciale reads it; the projects and the draft orders take their
// prices from here, only for those two.
export default async function PricesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const me = await requireCapability(locale, 'prices:view');
  const [t, own] = await Promise.all([getTranslations('prices'), prisma.priceItem.findMany({ where: { companyId: me.companyId }, select: { key: true, cents: true } })]);
  const fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']), mine = new Map(own.map((p) => [p.key, p.cents]));
  const rows: PriceRow[] = PRICE_ARTICLES.map((a) => ({
    key: a.key, group: a.group, item: a.label.item, ...(a.label.name ? { name: a.label.name } : {}), unit: a.unit, src: a.start?.src ?? null, own: mine.has(a.key),
  }));
  const values = Object.fromEntries(PRICE_ARTICLES.map((a) => {
    const c = mine.get(a.key) ?? a.start?.cents;
    return [a.key, c === undefined ? '' : fmt(c / 100, 2)];
  }));
  const editable = can(me, 'prices:edit');
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles">
          <h1>{t('title')}</h1>
          <p className="lead">{editable ? t('lead') : t('leadView')}</p>
        </div>
      </div>
      <p className="note">{t('scope')}</p>
      <PriceList rows={rows} values={values} editable={editable} />
    </main>
  );
}
