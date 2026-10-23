import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { flashOf } from '@/lib/rilievi/form-help';
import { listParamsSchema } from '@/lib/rilievi/inputs';
import type { RilieviT } from '@/lib/rilievi/t';
import { listPage } from '@/server/rilievi/pages';
import Icon from '@/components/Icon';
import Flash from '@/components/rilievi/Flash';
import LiveSearch from '@/components/rilievi/LiveSearch';
import Results from '@/components/rilievi/Results';
import RilieviHead from '@/components/rilievi/RilieviHead';
import Crumbs from '@/components/Crumbs';

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('schede.title') };
}

// The company's survey sheets (rilievi list.ejs): the search by number, matricola, address, make, work order or notes
// — every word must be found, accents and capitals do not count —, the count, the results (25 a page). A new sheet and
// the trash from the head, for whoever may. Its path says it is the full list under the Rilievi home (round 44).
export default async function RilieviPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:view');
  const sp = await searchParams;
  const { q, p } = listParamsSchema.parse({ q: sp.q, p: sp.p });
  const [t, page] = await Promise.all([getTranslations('rilievi'), listPage(user, q, p)]);
  const rt = t as unknown as RilieviT;
  const flash = flashOf(sp.ok);
  const status = q ? t('schede.search.found', { n: page.total, q }) : t('schede.count', { n: page.total });
  const canCreate = can(user, 'rilievi:edit');
  const tn = await getTranslations('nav');
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tn('rilievi') }, { label: tn('rilieviAll') }]} />
      <RilieviHead title={t('schede.title')} lead={t('schede.subtitle')} actions={(
        <>
          {canCreate ? <Link className="btn btn-primary" href="/app/rilievi/nuovo">{t('schede.new')}</Link> : null}
          {can(user, 'rilievi:trash-manage') ? <Link className="btn" href="/app/rilievi/cestino"><Icon name="trash-2" size={18} />{t('nav.cestino')}</Link> : null}
        </>
      )} />
      {flash ? <Flash text={t(`flash.${flash}`)} /> : null}
      <LiveSearch action={`/${locale}/app/rilievi`} base="/app/rilievi" query={q} label={t('schede.search.label')} placeholder={t('schede.search.placeholder')} />
      <p className="rv-status" id="search-status" role="status">{status}</p>
      <div id="results" className="rv-results">
        <Results page={page} query={q} trash={false} canCreate={canCreate} base="/app/rilievi" status={status} t={rt} />
      </div>
    </main>
  );
}
