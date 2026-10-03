import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { idSchema } from '@/lib/schemas';
import { analyse } from '@/lib/present/analysis';
import { calcDrops, surveyMachine } from '@/lib/room/derive';
import { startSurvey, surveySchema } from '@/lib/room/survey';
import { getCalculation } from '@/server/queries';
import { readCalc } from '@/server/records';
import Crumbs from '@/components/Crumbs';
import RoomSurvey from '@/components/room/RoomSurvey';

export async function generateMetadata() {
  const t = await getTranslations('room');
  return { title: t('newTitle') };
}

// The survey of the machine room for a replacement's calculation: it starts from a saved room of the installation (the
// one chosen with ?from=, else the latest), else from the software's example room with the drops at the calculation's
// spacing, to be replaced with the measures.
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
  const from = idSchema.safeParse((await searchParams).from);
  const prev = await prisma.roomDesign.findFirst({
    where: { projectId: c.projectId, companyId: user.companyId, ...(from.success ? { id: from.data } : {}) }, orderBy: { createdAt: 'desc' }, select: { inputs: true },
  });
  const stored = prev ? surveySchema.safeParse(prev.inputs) : null;
  const a = analyse(values), start = stored?.success ? stored.data : startSurvey(Math.round(calcDrops(a, surveyMachine(values, a, startSurvey(0)).M).calata));
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
      {stored?.success ? null : <p className="alert alert-warn" role="status">{t('example')}</p>}
      {same ? <RoomSurvey calculationId={c.id} values={values} initial={start} /> : <p className="alert alert-warn">{t('calcChanged')}</p>}
    </main>
  );
}
