import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ALL_ROWS, DASH_ROWS, searchWords } from '@/lib/dashboard';
import type { ProjectKind } from '@/lib/schemas';
import { activeResults, latestPlan, recordCounts } from '@/server/dashboard';
import { countProjects, getProjectRow, listProjects } from '@/server/queries';
import Kpis from '@/components/dashboard/Kpis';
import ModuleCards, { MODULES } from '@/components/dashboard/ModuleCards';
import NewMenu from '@/components/dashboard/NewMenu';
import ProjectList, { latestOf } from '@/components/dashboard/ProjectList';
import ProjectPreview from '@/components/dashboard/ProjectPreview';
import '../../dashboard.css';

// the archive's own title, as its heading says
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  if ((await searchParams).archived === '1') return { title: (await getTranslations('projects'))('archivedTitle') };
  return { title: (await getTranslations('nav'))('dashboard') };
}

const kindOf = (slug: string | undefined): ProjectKind | null => MODULES.find((m) => m.slug === slug)?.kind ?? null;

// The dashboard (the template's workspace): the company's figures, its installations changed last — all of them with
// ?all=1, module filters, archive, search from the top bar (?q=) —, the installation changed last with a result, and
// the new installation in one of the two modules.
// Everything shown comes from the company's records; nothing is an example.
export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ archived?: string; kind?: string; q?: string; all?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const sp = await searchParams, archived = sp.archived === '1', kind = kindOf(sp.kind), all = sp.all === '1';
  const words = searchWords(sp.q), q = words.join(' ');
  const plainView = !archived && kind === null && words.length === 0;
  // the view's latest changed (all of them behind «show all») and how many it has; the figures of every active
  // installation, counted apart from the list
  const [t, tn, projects, total, counts, active] = await Promise.all([
    getTranslations('projects'), getTranslations('nav'), listProjects(user, archived, kind, words, all ? ALL_ROWS : DASH_ROWS),
    countProjects(user, archived, kind, words), archived ? null : recordCounts(user), archived ? null : activeResults(user),
  ]);
  const stats = active?.stats ?? null;
  // the installation changed last among those with a saved result, with the plan of its saved shaft when it is a whole
  // project; none yet: no preview. A search or a module's filter shows the first of what it found with a result (never
  // one the list does not show); none there: no preview
  const latestId = active?.latestId ?? null;
  const filtered = words.length > 0 || kind !== null;
  const latest = filtered ? (projects.find((p) => latestOf(p).last) ?? null)
    : latestId ? (projects.find((p) => p.id === latestId) ?? await getProjectRow(user, latestId)) : null;
  const design = latest ? latestOf(latest).design : null;
  const plan = design ? await latestPlan(user, design.id) : null;
  const canEdit = can(user, 'projects:edit');
  // with no installation yet the list itself offers the two modules (ProjectList); else the header's button does
  const menu = canEdit && !archived && !(plainView && total === 0);
  return (
    <main className="page dash">
      <header className="dash-head">
        <div className="dash-titles">
          <p className="eyebrow">{t('dashEyebrow')}</p>
          <h1>{archived ? t('archivedTitle') : tn('dashboard')}</h1>
          <p className="lead">{archived ? t('dashLeadArchived') : t('dashLead')}</p>
        </div>
        {menu ? (
          <NewMenu label={t('new')}><ModuleCards /></NewMenu>
        ) : null}
      </header>
      {stats && counts ? <Kpis stats={stats} counts={counts} /> : null}
      <div className={latest ? 'dash-grid' : 'dash-grid dash-grid-one'}>
        <ProjectList projects={projects} total={total} all={all} archived={archived} kind={kind} q={q}
          counts={!stats || q ? null : { all: stats.active, REPLACEMENT: stats.replacement, FULL: stats.full }} canEdit={canEdit} />
        {latest ? <ProjectPreview project={latest} plan={plan} /> : null}
      </div>
    </main>
  );
}
