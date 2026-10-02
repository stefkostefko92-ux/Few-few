import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { idSchema } from '@/lib/schemas';
import { shaftInputsSchema } from '@/lib/shaft-input';
import { defaultInputs } from '@/shaft';
import { getProject } from '@/server/queries';
import { visiblePrices } from '@/server/prices';
import ShaftDesigner from '@/components/shaft/ShaftDesigner';
import Crumbs from '@/components/Crumbs';

export async function generateMetadata() {
  const t = await getTranslations('shaft');
  return { title: t('new') };
}

// A new shaft design starts from the inputs of a saved one (?from=), else from a 1600 × 1750 mm shaft to be replaced
// by the survey.
export default async function ShaftNewPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const from = idSchema.safeParse((await searchParams).from);
  const src = from.success ? await prisma.shaftDesign.findFirst({ where: { id: from.data, projectId: p.id, companyId: user.companyId }, select: { inputs: true } }) : null;
  const parsed = src ? shaftInputsSchema.safeParse(src.inputs) : null;
  const [t, tp] = await Promise.all([getTranslations('shaft'), getTranslations('projects')]);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('new') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('new')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      <ShaftDesigner projectId={p.id} initial={parsed?.success ? parsed.data : defaultInputs(1600, 1750)} prices={await visiblePrices(user)} />
    </main>
  );
}
