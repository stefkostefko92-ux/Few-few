import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { idSchema } from '@/lib/schemas';
import { analyse } from '@/lib/present/analysis';
import { calcDrops, surveyMachine } from '@/lib/room/derive';
import { blankSurvey, startSurvey, surveySchema, type SurveyDraft } from '@/lib/room/survey';
import { surveyDraftSchema } from '@/lib/draft-input';
import { dateFormat } from '@/lib/dates';
import { getCalculation } from '@/server/queries';
import { readDraft } from '@/server/drafts';
import { readCalc } from '@/server/records';
import Crumbs from '@/components/Crumbs';
import RoomSurvey from '@/components/room/RoomSurvey';

export async function generateMetadata() {
  const t = await getTranslations('room');
  return { title: t('newTitle') };
}

// The survey of the machine room for a replacement's calculation: it starts from the saved room chosen with ?from=, else
// from the survey's draft, else from the latest saved room of the installation, else empty (every measure to enter).
export default async function RoomSurveyPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const c = await getCalculation(user, id);
  if (!c || c.project.archivedAt || c.project.kind !== 'REPLACEMENT' || c.liftDesign) notFound();
  const calc = readCalc(c);
  if (!calc) notFound();
  const [t, tp, tc] = await Promise.all([getTranslations('room'), getTranslations('projects'), getTranslations('calculations')]);
  const { values, same } = calc;
  const from = idSchema.safeParse((await searchParams).from), scope = `room:${c.id}` as const;
  const draft = from.success ? null : await readDraft(user, c.projectId, scope, surveyDraftSchema);
  const prev = draft ? null : await prisma.roomDesign.findFirst({
    where: { projectId: c.projectId, companyId: user.companyId, ...(from.success ? { id: from.data } : {}) }, orderBy: { createdAt: 'desc' }, select: { inputs: true },
  });
  const stored = prev ? surveySchema.safeParse(prev.inputs) : null;
  const a = analyse(values);
  const start: SurveyDraft = draft ? draft.data : stored?.success ? { survey: stored.data, blank: [] }
    : blankSurvey(Math.round(calcDrops(a, surveyMachine(values, a, startSurvey(0)).M).calata));
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${c.projectId}`, label: c.project.name }, { href: `/app/calculations/${c.id}`, label: tc('viewTitle') }, { label: t('newTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('newTitle')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      <dl className="cartiglio">
        <div className="wide"><dt>{tc('col_machine')}</dt><dd className="num">{c.summary}</dd></div>
      </dl>
      {same ? <RoomSurvey calculationId={c.id} values={values} initial={start}
        draft={{ projectId: c.projectId, scope, resumed: draft ? dateFormat(locale).dateTime(new Date(draft.at)) : null }} /> : <p className="alert alert-warn">{t('calcChanged')}</p>}
    </main>
  );
}
