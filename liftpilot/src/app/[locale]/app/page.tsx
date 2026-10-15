import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { Link } from '@/i18n/routing';
import { requireUser } from '@/lib/auth';
import { can, homeOf } from '@/lib/rbac';
import { recentRilievi, impiantiFigures, rilieviCounts } from '@/server/collega/home';
import Icon from '@/components/Icon';
import HomeKpis from '@/components/collega/HomeKpis';
import RecentRilievi from '@/components/collega/RecentRilievi';
import '../../dashboard.css';

export async function generateMetadata() {
  return { title: (await getTranslations('nav'))('rilievi') };
}

/** The installations' list moved to /app/impianti (round 44): an old address with its filters goes there (round 45: an
 *  old ?kind= goes along and is ignored there). */
const OLD_LIST = ['archived', 'kind', 'q', 'all'] as const;

// The start page (round 44, the owner's plan of 2026-10-14: every job starts from the survey): the figures of the
// surveys and of the installations they belong to, the recent surveys with their link and the way to the full list
// (/app/rilievi, the 1:1 list of rilievi). Each block only for whoever may see it: a role without the surveys starts on
// the installations (rbac.ts homeOf).
export default async function HomePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const old = new URLSearchParams(OLD_LIST.flatMap((k) => (typeof sp[k] === 'string' ? [[k, sp[k] as string]] : [])));
  if (old.size) redirect(`/${locale}/app/impianti?${old.toString()}`);
  const user = await requireUser(locale);
  if (!can(user, 'rilievi:view')) redirect(`/${locale}${homeOf(user)}`);
  const projects = can(user, 'projects:view');
  const [t, counts, recent, figures] = await Promise.all([getTranslations('collega.home'), rilieviCounts(user), recentRilievi(user),
    projects ? impiantiFigures(user) : Promise.resolve(null)]);
  return (
    <main className="page dash lk-home">
      <header className="dash-head">
        <div className="dash-titles">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p className="lead">{t('lead')}</p>
        </div>
        <div className="lk-home-actions">
          {can(user, 'rilievi:edit') ? <Link className="btn btn-primary" href="/app/rilievi/nuovo"><Icon name="clipboard-list" size={18} />{t('new')}</Link> : null}
          {projects ? <Link className="btn btn-ghost" href="/app/impianti">{t('impianti')}</Link> : null}
        </div>
      </header>
      <HomeKpis counts={counts} figures={figures} />
      <RecentRilievi rows={recent} total={counts.totali} projects={projects} canCreate={can(user, 'rilievi:edit')} />
    </main>
  );
}
