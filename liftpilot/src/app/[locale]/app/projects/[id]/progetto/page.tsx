import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { idSchema } from '@/lib/schemas';
import { dateFormat } from '@/lib/dates';
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

// The one form of an installation with its live 3D simulation: from a saved design (?from=), else from the form's draft,
// else from the latest design, else from the installation's shaft design and calculation with the rest of the project
// to enter, else empty (src/server/lift-start.ts).
export default async function LiftWorkPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const from = idSchema.safeParse((await searchParams).from);
  const start = await liftStart(user, p.id, from.success ? from.data : null);
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
      <LiftWorkspace key={from.success ? from.data : 'start'} projectId={p.id} initial={start.inputs} blank={start.blank} prices={await visiblePrices(user)}
        pitches={pitchesOf(p.plant)} draft={{ projectId: p.id, scope: 'lift', resumed: start.draftAt ? dateFormat(locale).dateTime(new Date(start.draftAt)) : null }} />
    </main>
  );
}
