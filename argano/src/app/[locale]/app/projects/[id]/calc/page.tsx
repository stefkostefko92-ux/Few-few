import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formValuesSchema } from '@/lib/calc-input';
import { idSchema } from '@/lib/schemas';
import { PRESETS } from '@/calc/presets';
import type { FormValues } from '@/calc/types';
import { getProject } from '@/server/queries';
import Calculator from '@/components/calc/Calculator';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('newTitle') };
}

// A new calculation starts from the values of the chosen saved calculation (?from=), else from the latest one of
// the project, else from example B of the research (replacement) with a note to replace the values.
export default async function CalcPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const from = idSchema.safeParse((await searchParams).from);
  const source = await prisma.calculation.findFirst({
    where: { projectId: p.id, companyId: user.companyId, ...(from.success ? { id: from.data } : {}) },
    orderBy: { createdAt: 'desc' },
    select: { inputs: true },
  });
  const parsed = source ? formValuesSchema.safeParse(source.inputs) : null;
  const initial: FormValues = parsed?.success ? parsed.data : PRESETS.B;
  const t = await getTranslations('calculations');
  return (
    <main className="page">
      <p className="note"><Link href={`/app/projects/${p.id}`}>← {p.name}</Link></p>
      <div className="flex flex-col gap-1">
        <p className="eyebrow">{p.name}</p>
        <h1>{t('newTitle')}</h1>
        <p className="lead">{t('newLead')}</p>
      </div>
      <Calculator projectId={p.id} initial={initial} preset={parsed?.success ? null : 'B'} brand={user.companyName} />
    </main>
  );
}
