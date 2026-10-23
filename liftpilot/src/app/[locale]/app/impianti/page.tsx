import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { can, homeOf } from '@/lib/rbac';
import { ALL_ROWS, DASH_ROWS, idsDelTipo, searchWords, tipoFiltroOf } from '@/lib/dashboard';
import { activeResults, latestPlan, recordCounts } from '@/server/dashboard';
import { impiantiFigures } from '@/server/collega/home';
import { countProjects, getProjectRow, listProjects, tipiImpianti } from '@/server/project-list';
import Kpis from '@/components/dashboard/Kpis';
import NuovoImpianto from '@/components/dashboard/NuovoImpianto';
import ProjectList, { latestOf } from '@/components/dashboard/ProjectList';
import ProjectPreview from '@/components/dashboard/ProjectPreview';
import '../../../dashboard.css';

// the archive's own title, as its heading says
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  if ((await searchParams).archived === '1') return { title: (await getTranslations('projects'))('archivedTitle') };
  return { title: (await getTranslations('nav'))('impianti') };
}

/** The installations of a figure of the Rilievi home (src/server/collega/home.ts): with differences, calculations to update. */
type StatoFiltro = 'differenze' | 'aggiornare';
const statoOf = (x: string | undefined): StatoFiltro | null => (x === 'differenze' || x === 'aggiornare' ? x : null);

// The installations (the template's workspace; the dashboard «Panoramica» until round 44, when the Rilievi home took /app):
// the company's figures, its installations changed last — all of them with ?all=1, filters by type of intervention
// (round 45, ?tipo=: read from each installation's latest «Calcolo argano», never stored; an old ?kind= is ignored),
// archive, search from the top bar (?q=), the installations of a figure of the Rilievi home (?stato=differenze|aggiornare,
// for whoever sees the surveys: both read them) —, the installation changed last with a result, and «Nuovo impianto»
// with the four steps of its work. Everything shown comes from the company's records; nothing is an example.
export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ locale: string }>; searchParams: Promise<{ archived?: string; tipo?: string; q?: string; all?: string; stato?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireUser(locale);
  // a colleague whose role does not see the installations starts where it works
  if (!can(user, 'projects:view')) redirect(`/${locale}${homeOf(user)}`);
  const sp = await searchParams, archived = sp.archived === '1', tipo = tipoFiltroOf(sp.tipo), all = sp.all === '1';
  const words = searchWords(sp.q), q = words.join(' ');
  const stato = archived || !can(user, 'rilievi:view') ? null : statoOf(sp.stato);
  const [figures, tipi] = await Promise.all([stato ? impiantiFigures(user) : null, tipiImpianti(user, archived)]);
  // the installations of a figure and of a type: both filters at once
  const delStato = stato && figures ? figures.ids[stato] : undefined, delTipo = tipo ? new Set(idsDelTipo(tipi, tipo)) : null;
  const ids = delTipo ? (delStato ?? [...delTipo]).filter((id) => delTipo.has(id)) : delStato;
  const plainView = !archived && tipo === null && words.length === 0 && !stato;
  // the view's latest changed (all of them behind «show all») and how many it has; the figures of every active
  // installation, counted apart from the list
  const [t, tn, projects, total, counts, active] = await Promise.all([
    getTranslations('projects'), getTranslations('nav'), listProjects(user, archived, words, all ? ALL_ROWS : DASH_ROWS, ids),
    countProjects(user, archived, words, ids), archived ? null : recordCounts(user), archived ? null : activeResults(user),
  ]);
  const stats = active?.stats ?? null;
  // the installation changed last among those with a saved result, with the plan of its saved shaft when it is a whole
  // project; none yet: no preview. A search or a type's filter shows the first of what it found with a result (never
  // one the list does not show); none there: no preview
  const latestId = active?.latestId ?? null;
  const filtered = words.length > 0 || tipo !== null || stato !== null;
  const latest = filtered ? (projects.find((p) => latestOf(p).last) ?? null)
    : latestId ? (projects.find((p) => p.id === latestId) ?? await getProjectRow(user, latestId)) : null;
  const design = latest ? latestOf(latest).design : null;
  const plan = design ? await latestPlan(user, design.id) : null;
  const canEdit = can(user, 'impianti:create');
  // with no installation yet the list itself offers the new one (ProjectList); else the header's button does
  const menu = canEdit && !archived && !(plainView && total === 0);
  return (
    <main className="page dash">
      <header className="dash-head">
        <div className="dash-titles">
          <p className="eyebrow">{t('dashEyebrow')}</p>
          <h1>{archived ? t('archivedTitle') : tn('impianti')}</h1>
          <p className="lead">{archived ? t('dashLeadArchived') : t('dashLead')}</p>
        </div>
        {menu ? <NuovoImpianto /> : null}
      </header>
      {stats && counts ? <Kpis stats={stats} counts={counts} /> : null}
      <div className={latest ? 'dash-grid' : 'dash-grid dash-grid-one'}>
        <ProjectList projects={projects} total={total} all={all} archived={archived} tipo={tipo} tipi={tipi} q={q}
          stato={stato ? { key: stato, capped: stato === 'differenze' && !!figures?.capped } : null}
          counts={!stats || q || stato ? null : { all: stats.active, 'solo-argano': stats.soloArgano, ammodernamento: stats.ammodernamento,
            'trasformazione-completa': stats.trasformazione, 'da-definire': stats.daDefinire }} canEdit={canEdit} />
        {latest ? <ProjectPreview project={latest} plan={plan} tipo={tipi.get(latest.id) ?? null} /> : null}
      </div>
    </main>
  );
}
