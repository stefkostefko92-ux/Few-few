import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listProjects } from '@/server/queries';
import VerdictPill from '@/components/VerdictPill';

export async function generateMetadata() {
  const t = await getTranslations('projects');
  return { title: t('title') };
}

export default async function ProjectsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ archived?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const archived = (await searchParams).archived === '1';
  const [t, format, projects] = await Promise.all([getTranslations('projects'), getFormatter(), listProjects(user, archived)]);
  return (
    <main className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="eyebrow">{user.companyName}</p>
          <h1>{archived ? t('archivedTitle') : t('title')}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href={archived ? '/app' : '/app?archived=1'}>{archived ? t('showActive') : t('showArchived')}</Link>
          {can(user.role, 'projects:edit') ? <Link className="btn btn-primary" href="/app/projects/new">{t('new')}</Link> : null}
        </div>
      </div>
      {projects.length === 0 ? (
        <div className="panel">
          <p>{archived ? t('emptyArchived') : t('empty')}</p>
        </div>
      ) : (
        <div className="panel overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr><th>{t('col_name')}</th><th>{t('col_place')}</th><th>{t('col_plantNumber')}</th><th>{t('col_last')}</th><th className="text-right">{t('col_count')}</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const last = p.calculations[0];
                return (
                  <tr key={p.id}>
                    <td><Link href={`/app/projects/${p.id}`} className="font-semibold">{p.name}</Link></td>
                    <td>{[p.address, p.city, p.province].filter(Boolean).join(', ') || '—'}</td>
                    <td className="mono">{p.plantNumber ?? '—'}</td>
                    <td>
                      {last ? (
                        <div className="flex flex-col gap-1">
                          <VerdictPill verdict={last.verdict} fails={last.failCount} warns={last.warnCount} />
                          <span className="note">{format.dateTime(last.createdAt, { dateStyle: 'medium', timeStyle: 'short' })} · {last.summary}</span>
                        </div>
                      ) : <span className="note">{t('noCalculations')}</span>}
                    </td>
                    <td className="num text-right">{p._count.calculations}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
