import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { plantSchema } from '@/lib/plant';
import { getProject } from '@/server/queries';
import Crumbs from '@/components/Crumbs';
import PlantForm from '@/components/tavole/PlantForm';
import ClientLogoForm from '@/components/tavole/ClientLogoForm';

export async function generateMetadata() {
  const t = await getTranslations('tavole');
  return { title: t('plantTitle') };
}

// The data of the installation that sheet 1 of the drawing sets needs, stored on the project, and the logo of the client
// who commissioned it (next to its name in the title block).
export default async function PlantPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const [t, tp] = await Promise.all([getTranslations('tavole'), getTranslations('projects')]);
  const plant = plantSchema.safeParse(p.plant ?? {});
  const readOnly = !can(user, 'projects:edit') || p.archivedAt !== null;
  const cl = p.clientLogo, clientLogo = cl ? `data:${cl.mime};base64,${Buffer.from(cl.data).toString('base64')}` : null;
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('plantTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('plantTitle')}</h1>
          <p className="lead">{t('plantLead')}</p>
        </div>
      </div>
      <ClientLogoForm projectId={p.id} current={clientLogo} readOnly={readOnly} />
      <PlantForm projectId={p.id} initial={plant.success ? plant.data : {}} readOnly={readOnly} />
    </main>
  );
}
