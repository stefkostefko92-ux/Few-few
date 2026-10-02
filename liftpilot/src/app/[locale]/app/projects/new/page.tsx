import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import ProjectForm from '@/components/ProjectForm';
import Crumbs from '@/components/Crumbs';

export async function generateMetadata() {
  const t = await getTranslations('projects');
  return { title: t('newTitle') };
}

// the module comes from the dashboard (?kind=replacement|full); it can still be changed here
export default async function NewProjectPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCapability(locale, 'projects:edit');
  const t = await getTranslations('projects'), kind = (await searchParams).kind === 'replacement' ? 'REPLACEMENT' : 'FULL';
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app', label: t('title') }, { label: t('newTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('newTitle')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      <ProjectForm kind={kind} />
    </main>
  );
}
