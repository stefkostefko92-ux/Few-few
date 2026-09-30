import { notFound } from 'next/navigation';
import { z } from 'zod';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formValuesSchema } from '@/lib/calc-input';
import { idSchema } from '@/lib/schemas';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { getProject } from '@/server/queries';
import Calculator from '@/components/calc/Calculator';
import Crumbs from '@/components/Crumbs';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('newTitle') };
}

// A new calculation starts from the values of the chosen saved calculation (?from=), else from the latest one of
// the project, else from example B of the research (replacement) with a note to replace the values.
export default async function CalcPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string; design?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const query = await searchParams;
  const from = idSchema.safeParse(query.from), designId = idSchema.safeParse(query.design);
  const source = await prisma.calculation.findFirst({
    where: { projectId: p.id, companyId: user.companyId, ...(from.success ? { id: from.data } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true },
  });
  const parsed = source ? formValuesSchema.safeParse(source.inputs) : null;
  // a calculation started from a shaft design takes its rated load (the design's layout decided it)
  const designRow = designId.success
    ? await prisma.shaftDesign.findFirst({ where: { id: designId.data, projectId: p.id, companyId: user.companyId }, select: { id: true, results: true } })
    : null;
  const designQ = designRow ? z.object({ Q: z.number() }).safeParse(designRow.results) : null;
  const design = designRow && designQ?.success ? { id: designRow.id, Q: designQ.data.Q } : null;
  const base: FormValues = parsed?.success ? parsed.data : PRESETS.B;
  const initial: FormValues = design ? { ...base, Q: design.Q } : base;
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
      <Calculator projectId={p.id} initial={initial} preset={parsed?.success || design ? null : 'B'} brand={user.companyName} design={design} />
    </main>
  );
}
