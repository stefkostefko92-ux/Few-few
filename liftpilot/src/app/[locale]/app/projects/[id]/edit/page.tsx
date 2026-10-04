import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { getProject } from '@/server/queries';
import ProjectForm from '@/components/ProjectForm';
import Crumbs from '@/components/Crumbs';

export default async function EditProjectPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:edit');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const t = await getTranslations('projects');
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app', label: t('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('editTitle') }]} />
      <h1>{t('editTitle')}</h1>
      <ProjectForm initial={{ id: p.id, name: p.name, address: p.address ?? '', city: p.city ?? '', province: p.province ?? '',
        plantNumber: p.plantNumber ?? '', client: p.client ?? '', notes: p.notes ?? '' }} />
    </main>
  );
}
