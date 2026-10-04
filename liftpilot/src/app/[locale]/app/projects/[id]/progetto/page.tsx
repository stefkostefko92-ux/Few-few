import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { idSchema } from '@/lib/schemas';
import { getProject } from '@/server/queries';
import { visiblePrices } from '@/server/prices';
import { liftStart } from '@/server/lift-start';
import LiftWorkspace from '@/components/lift/LiftWorkspace';
import Crumbs from '@/components/Crumbs';
import { pitchesOf } from '@/lib/plant';

export async function generateMetadata() {
  const t = await getTranslations('lift');
  return { title: t('workTitle') };
}

// The one form of an installation with its live 3D simulation: from a saved design (?from=), else from the latest one,
// else from the installation's shaft design and calculation, else from the example.
export default async function LiftWorkPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const from = idSchema.safeParse((await searchParams).from);
  const initial = await liftStart(user, p.id, from.success ? from.data : null);
  const [t, tp] = await Promise.all([getTranslations('lift'), getTranslations('projects')]);
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('workTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('workTitle')}</h1>
          <p className="lead">{t('workLead')}</p>
        </div>
      </div>
      <LiftWorkspace projectId={p.id} initial={initial} prices={await visiblePrices(user)} pitches={pitchesOf(p.plant)} />
    </main>
  );
}
