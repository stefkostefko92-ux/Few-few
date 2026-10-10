import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { projectStats, searchWords } from '@/lib/dashboard';
import type { ProjectKind } from '@/lib/schemas';
import { latestPlan, recordCounts } from '@/server/dashboard';
import { listProjects } from '@/server/queries';
import Kpis from '@/components/dashboard/Kpis';
import ModuleCards, { MODULES } from '@/components/dashboard/ModuleCards';
import NewMenu from '@/components/dashboard/NewMenu';
import ProjectList, { latestOf } from '@/components/dashboard/ProjectList';
import ProjectPreview from '@/components/dashboard/ProjectPreview';
import '../../dashboard.css';

export async function generateMetadata() {
  const t = await getTranslations('nav');
  return { title: t('dashboard') };
}

const kindOf = (slug: string | undefined): ProjectKind | null => MODULES.find((m) => m.slug === slug)?.kind ?? null;

// The dashboard (the template's workspace): the company's figures, its installations — module filters, archive,
// search from the top bar (?q=) —, the installation changed last, and the new installation in one of the two modules.
// Everything shown comes from the company's records; nothing is an example.
export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ archived?: string; kind?: string; q?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const sp = await searchParams, archived = sp.archived === '1', kind = kindOf(sp.kind);
  const words = searchWords(sp.q), q = words.join(' ');
  const plainView = !archived && kind === null && words.length === 0;
  // the list as asked; the active installations unfiltered for the figures (the same list when nothing is filtered)
  const [t, tn, projects, counts] = await Promise.all([
    getTranslations('projects'), getTranslations('nav'), listProjects(user, archived, kind, words), recordCounts(user),
  ]);
  const active = plainView ? projects : await listProjects(user, false, null);
  const stats = projectStats(active.map((p) => {
    const { last, old } = latestOf(p);
    return { kind: p.kind, latest: last ? { verdict: last.verdict, old } : null };
  }));
  // the installation changed last among those with a saved result, with the plan of its saved shaft when it is a whole
  // project; none yet: no preview
  const latest = archived ? null : (active.find((p) => latestOf(p).last) ?? null);
  const design = latest ? latestOf(latest).design : null;
  const plan = design ? await latestPlan(user, design.id) : null;
  const canEdit = can(user, 'projects:edit');
  // with no installation yet the list itself offers the two modules (ProjectList); else the header's button does
  const menu = canEdit && !archived && !(plainView && projects.length === 0);
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
      {archived ? null : <Kpis stats={stats} counts={counts} />}
      <div className={latest ? 'dash-grid' : 'dash-grid dash-grid-one'}>
        <ProjectList projects={projects} archived={archived} kind={kind} q={q}
          counts={archived || q ? null : { all: stats.active, REPLACEMENT: stats.replacement, FULL: stats.full }} canEdit={canEdit} />
        {latest ? <ProjectPreview project={latest} plan={plan} /> : null}
      </div>
    </main>
  );
}
