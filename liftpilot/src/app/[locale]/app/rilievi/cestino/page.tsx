import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { flashOf } from '@/lib/rilievi/form-help';
import { listParamsSchema } from '@/lib/rilievi/inputs';
import type { RilieviT } from '@/lib/rilievi/t';
import { trashPage } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import Flash from '@/components/rilievi/Flash';
import LiveSearch from '@/components/rilievi/LiveSearch';
import Results from '@/components/rilievi/Results';
import RilieviHead from '@/components/rilievi/RilieviHead';

type SP = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('trash.title') };
}

// The trash (rilievi trash.ejs), only for whoever manages it (the owner): the deleted sheets, the latest first, with
// the same search (a plain form, as in rilievi); each row restores the sheet or deletes it for good.
export default async function RilieviTrashPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SP }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:trash-manage');
  const sp = await searchParams;
  const { q, p } = listParamsSchema.parse({ q: sp.q, p: sp.p });
  const [t, tn, page] = await Promise.all([getTranslations('rilievi'), getTranslations('nav'), trashPage(user, q, p)]);
  const rt = t as unknown as RilieviT;
  const flash = flashOf(sp.ok);
  const status = q ? t('schede.search.found', { n: page.total, q }) : t('schede.count', { n: page.total });
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tn('rilievi') }, { href: '/app/rilievi', label: tn('rilieviAll') }, { label: t('trash.title') }]} />
      <RilieviHead title={t('trash.title')} lead={t('trash.subtitle')} />
      {flash ? <Flash text={t(`flash.${flash}`)} /> : null}
      <LiveSearch action={`/${locale}/app/rilievi/cestino`} base="/app/rilievi/cestino" query={q} label={t('schede.search.label')}
        placeholder={t('schede.search.placeholder')} live={false} />
      <p className="rv-status" id="search-status" role="status">{status}</p>
      <div id="results" className="rv-results">
        <Results page={page} query={q} trash canCreate={false} base="/app/rilievi/cestino" status={status} t={rt} />
      </div>
    </main>
  );
}
