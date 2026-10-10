import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import VerdictPill from '@/components/VerdictPill';
import { DASH_ROWS } from '@/lib/dashboard';
import { dateFormat } from '@/lib/dates';
import type { ProjectKind } from '@/lib/schemas';
import type { listProjects } from '@/server/queries';
import { outdated } from '@/server/records';
import ModuleCards, { MODULES } from './ModuleCards';

export type ListedProject = Awaited<ReturnType<typeof listProjects>>[number];

/** An installation's result: its latest lift design's for a whole project, else its latest calculation's; and whether
 *  the running engines no longer reproduce it («da aggiornare», by the versions stored). */
export function latestOf(p: ListedProject) {
  const design = p.liftDesigns[0] ?? null, calc = p.calculations[0] ?? null;
  return { last: design ?? calc, design, old: design ? outdated.lift(design) : calc ? outdated.calc(calc) : false };
}

interface Props {
  /** the view's latest changed: its first DASH_ROWS, or with `all` its first ALL_ROWS */
  projects: ListedProject[];
  /** how many installations the view has */
  total: number;
  all: boolean;
  archived: boolean;
  kind: ProjectKind | null;
  /** the words searched as typed, '' for none */
  q: string;
  /** the active installations by module, for the filters (the plain active list only) */
  counts: { all: number; REPLACEMENT: number; FULL: number } | null;
  canEdit: boolean;
}

// The company's installations, latest change first (the dashboard's «Progetti recenti»): the view's latest changed
// and «show all (N)» for the rest, with the module filters, the archive, the search's words, and per row its module,
// address, plant number, latest result («da aggiornare» when the engines changed), its date and machine line, and the
// number of calculations.
export default async function ProjectList({ projects, total, all, archived, kind, q, counts, canEdit }: Props) {
  const [t, tf, locale] = await Promise.all([getTranslations('projects'), getTranslations('refresh'), getLocale()]);
  const fd = dateFormat(locale);
  const slugOf = (k: ProjectKind | null): string | null => MODULES.find((m) => m.kind === k)?.slug ?? null;
  const href = (k: ProjectKind | null, arch = archived, words = q, every = all): string => {
    const s = [arch ? 'archived=1' : '', k ? `kind=${slugOf(k)}` : '', words ? `q=${encodeURIComponent(words)}` : '', every ? 'all=1' : '']
      .filter(Boolean).join('&');
    return s ? `/app?${s}` : '/app';
  };
  const more = total > projects.length;
  const empty = projects.length === 0, fresh = empty && !archived && !q && kind === null;
  return (
    <section className="panel dash-list" aria-labelledby="dash-list-title">
      <div className="panel-head">
        <div className="dash-panel-titles">
          <p className="eyebrow plain">{t('list_eyebrow')}</p>
          <h2 id="dash-list-title">{archived ? t('archivedTitle') : t('title')}</h2>
        </div>
        <Link className="btn btn-sm" href={href(kind, !archived)}>
          <Icon name={archived ? 'layout-dashboard' : 'archive'} size={16} />{archived ? t('showActive') : t('showArchived')}
        </Link>
      </div>
      <nav className="dash-filters" aria-label={t('col_kind')}>
        <Link href={href(null)} aria-current={kind === null ? 'page' : undefined}>
          {t('filter_all')}{counts ? <span className="dash-count">{counts.all}</span> : null}
        </Link>
        {MODULES.map((m) => (
          <Link key={m.kind} href={href(m.kind)} aria-current={kind === m.kind ? 'page' : undefined}>
            {t(`filter_${m.kind}`)}{counts ? <span className="dash-count">{counts[m.kind]}</span> : null}
          </Link>
        ))}
      </nav>
      {q ? (
        <p className="dash-q" role="status">
          {empty ? t('searchNone', { q }) : t('searchResults', { n: total, q })}{' '}
          <Link href={href(kind, archived, '')}>{t('searchClear')}</Link>
        </p>
      ) : null}
      {fresh ? (
        <div className="dash-empty">
          <p>{canEdit ? t('emptyStart') : t('emptyNoEdit')}</p>
          {canEdit ? <ModuleCards /> : null}
        </div>
      ) : empty ? (
        q ? null : <p className="dash-empty">{archived && kind === null ? t('emptyArchived') : t('emptyKind')}</p>
      ) : (
        <ul className="dash-rows" role="list">
          {projects.map((p) => {
            const { last, old } = latestOf(p);
            const place = [p.address, p.city, p.province].filter(Boolean).join(', ');
            return (
              <li key={p.id} className="dash-row">
                <span className="icon-tile sm"><Icon name={p.kind === 'REPLACEMENT' ? 'motor' : 'elevator'} size={20} /></span>
                <div className="dash-row-main">
                  <Link href={`/app/projects/${p.id}`} className="dash-row-link">{p.name}</Link>
                  <span className="dash-row-meta">
                    <span className={`kind-tag kind-${p.kind.toLowerCase()}`}>{t(`kind_${p.kind}`)}</span>
                    {place ? <span>{place}</span> : null}
                    {p.plantNumber ? <span>{t('col_plantNumber')} <span className="mono">{p.plantNumber}</span></span> : null}
                  </span>
                </div>
                <div className="dash-row-result">
                  {last ? (
                    <>
                      <span className="dash-pills">
                        <VerdictPill verdict={last.verdict} fails={last.failCount} warns={last.warnCount} />
                        {old ? <span className="chip old">{tf('outdated')}</span> : null}
                      </span>
                      <span className="dash-row-sum" title={last.summary}>{last.summary}</span>
                    </>
                  ) : <span className="note">{t('noCalculations')}</span>}
                </div>
                <div className="dash-row-when">
                  <time dateTime={p.updatedAt.toISOString()}><span className="sr-only">{t('updated')} </span>{fd.dateTime(p.updatedAt)}</time>
                  {p._count.calculations ? <span>{t('calcCount', { n: p._count.calculations })}</span> : null}
                </div>
                <svg className="dash-row-go" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
                  <path d="M5.5 12.5 12.5 5.5M7 5.5h5.5V11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
            );
          })}
        </ul>
      )}
      {more && !all ? (
        <p className="dash-more"><Link className="btn btn-sm" href={href(kind, archived, q, true)}>{t('showAll', { n: total })}</Link></p>
      ) : all && !empty ? (
        <p className="dash-more">
          {more ? <span className="note">{t('listCapped', { n: projects.length, total })}</span> : null}
          {total > DASH_ROWS ? <Link href={href(kind, archived, q, false)}>{t('showRecent')}</Link> : null}
        </p>
      ) : null}
    </section>
  );
}
