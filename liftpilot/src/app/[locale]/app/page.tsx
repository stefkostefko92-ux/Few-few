import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import type { ProjectKind } from '@/lib/schemas';
import { listProjects } from '@/server/queries';
import VerdictPill from '@/components/VerdictPill';

export async function generateMetadata() {
  const t = await getTranslations('projects');
  return { title: t('title') };
}

/** The two modules: the machine replacement alone, or a whole project; their slug in the address. */
const MODULES: readonly { kind: ProjectKind; slug: string }[] = [{ kind: 'REPLACEMENT', slug: 'replacement' }, { kind: 'FULL', slug: 'full' }];
const kindOf = (slug: string | undefined): ProjectKind | null => MODULES.find((m) => m.slug === slug)?.kind ?? null;

export default async function ProjectsPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ archived?: string; kind?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const sp = await searchParams, archived = sp.archived === '1', kind = kindOf(sp.kind);
  const [t, projects] = await Promise.all([getTranslations('projects'), listProjects(user, archived, kind)]);
  const fd = dateFormat(locale);
  const canEdit = can(user, 'projects:edit');
  const listHref = (slug: string | null, arch = archived): string => {
    const q = [arch ? 'archived=1' : '', slug ? `kind=${slug}` : ''].filter(Boolean).join('&');
    return q ? `/app?${q}` : '/app';
  };
  return (
    <main className="page">
      <div className="page-head">
        <div className="titles"><h1>{archived ? t('archivedTitle') : t('title')}</h1></div>
        <div className="actions">
          <Link className="btn" href={listHref(sp.kind && kind ? sp.kind : null, !archived)}>{archived ? t('showActive') : t('showArchived')}</Link>
        </div>
      </div>
      {canEdit && !archived ? (
        <div className="app-modules">
          {MODULES.map((m) => (
            <Link key={m.kind} href={`/app/projects/new?kind=${m.slug}`} className={`app-module app-module-${m.slug}`}>
              <span className="eyebrow">{t(`kind_${m.kind}`)}</span>
              <strong>{t(`module_${m.kind}_title`)}</strong>
              <span className="note">{t(`module_${m.kind}_lead`)}</span>
              <span className="btn btn-primary">{t(`module_${m.kind}_new`)}</span>
            </Link>
          ))}
        </div>
      ) : null}
      <nav className="seg-row" aria-label={t('col_kind')}>
        <Link href={listHref(null)} aria-current={kind === null ? 'page' : undefined}>{t('filter_all')}</Link>
        {MODULES.map((m) => <Link key={m.kind} href={listHref(m.slug)} aria-current={kind === m.kind ? 'page' : undefined}>{t(`filter_${m.kind}`)}</Link>)}
      </nav>
      {projects.length === 0 ? (
        <div className="panel items-start">
          <p>{archived ? t('emptyArchived') : t('empty')}</p>
        </div>
      ) : (
        <div className="table-panel">
          <table className="data-table stack">
            <thead>
              <tr><th>{t('col_name')}</th><th>{t('col_kind')}</th><th>{t('col_place')}</th><th>{t('col_plantNumber')}</th><th>{t('col_last')}</th><th className="text-right">{t('col_count')}</th></tr>
            </thead>
            <tbody>
              {projects.map((p) => {
                const last = p.calculations[0];
                return (
                  <tr key={p.id}>
                    <td className="row-title"><Link href={`/app/projects/${p.id}`} className="font-semibold">{p.name}</Link></td>
                    <td data-label={t('col_kind')}><span className={`kind-tag kind-${p.kind.toLowerCase()}`}>{t(`kind_${p.kind}`)}</span></td>
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
