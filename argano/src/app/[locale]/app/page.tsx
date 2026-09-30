import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
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
  const [t, projects] = await Promise.all([getTranslations('projects'), listProjects(user, archived)]);
  const fd = dateFormat(locale);
  const canEdit = can(user.role, 'projects:edit');
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles"><h1>{archived ? t('archivedTitle') : t('title')}</h1></div>
        <div className="actions">
          <Link className="btn" href={archived ? '/app' : '/app?archived=1'}>{archived ? t('showActive') : t('showArchived')}</Link>
          {canEdit ? <Link className="btn btn-primary" href="/app/projects/new">{t('new')}</Link> : null}
        </div>
      </div>
      {projects.length === 0 ? (
        <div className="panel items-start">
          <p>{archived ? t('emptyArchived') : t('empty')}</p>
          {canEdit && !archived ? <Link className="btn btn-primary" href="/app/projects/new">{t('new')}</Link> : null}
        </div>
      ) : (
        <div className="table-panel">
          <table className="data-table stack">
            <thead>
              <tr><th>{t('col_name')}</th><th>{t('col_place')}</th><th>{t('col_plantNumber')}</th><th>{t('col_last')}</th><th className="text-right">{t('col_count')}</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const last = p.calculations[0];
                return (
                  <tr key={p.id}>
                    <td className="row-title"><Link href={`/app/projects/${p.id}`} className="font-semibold">{p.name}</Link></td>
                    <td data-label={t('col_place')}>{[p.address, p.city, p.province].filter(Boolean).join(', ') || '—'}</td>
                    <td data-label={t('col_plantNumber')} className="num">{p.plantNumber ?? '—'}</td>
                    <td data-label={t('col_last')}>
                      {last ? (
                        <div className="cell-stack">
                          <VerdictPill verdict={last.verdict} fails={last.failCount} warns={last.warnCount} />
                          <span className="note">{fd.dateTime(last.createdAt)} · <span className="spec">{last.summary}</span></span>
                        </div>
                      ) : <span className="note">{t('noCalculations')}</span>}
                    </td>
                    <td data-label={t('col_count')} className="num text-right">{p._count.calculations}</td>
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
