import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formValuesSchema } from '@/lib/calc-input';
import { collaudoReadSchema } from '@/lib/lift-input';
import { idSchema } from '@/lib/schemas';
import { blankCalc } from '@/lib/calc-blank';
import { calcDraftSchema } from '@/lib/draft-input';
import { dateFormat } from '@/lib/dates';
import { getProject } from '@/server/queries';
import { readDraft } from '@/server/drafts';
import Calculator from '@/components/calc/Calculator';
import Crumbs from '@/components/Crumbs';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('newTitle') };
}

// The calculator of a machine replacement: it starts from the values of the chosen saved calculation (?from=), else
// from the form's draft, else from the latest calculation of the project, else empty (src/lib/calc-blank.ts): nothing of
// the installation or the machines filled in. A whole project has one form, which saves its calculation with it.
export default async function CalcPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  if (p.kind === 'FULL') redirect(`/${locale}/app/projects/${p.id}/progetto`);
  const from = idSchema.safeParse((await searchParams).from);
  const draft = from.success ? null : await readDraft(user, p.id, 'calc', calcDraftSchema);
  const source = draft ? null : await prisma.calculation.findFirst({
    where: { projectId: p.id, companyId: user.companyId, ...(from.success ? { id: from.data } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true, collaudo: true },
  });
  const parsed = source ? formValuesSchema.safeParse(source.inputs) : null, chosen = source?.collaudo ? collaudoReadSchema.safeParse(source.collaudo) : null;
  const initial = draft ? draft.data.values : parsed?.success ? parsed.data : blankCalc();
  const collaudo = draft ? draft.data.collaudo : chosen?.success ? chosen.data : null;
  const [t, tp] = await Promise.all([getTranslations('calculations'), getTranslations('projects')]);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('newTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('newTitle')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      <Calculator projectId={p.id} initial={initial} preset={null} brand={user.companyName} collaudo={collaudo}
        draft={{ projectId: p.id, scope: 'calc', resumed: draft ? dateFormat(locale).dateTime(new Date(draft.at)) : null }} />
    </main>
  );
}
