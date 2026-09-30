import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import ProjectForm from '@/components/ProjectForm';

export async function generateMetadata() {
  const t = await getTranslations('projects');
  return { title: t('newTitle') };
}

export default async function NewProjectPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireCapability(locale, 'projects:edit');
  const t = await getTranslations('projects');
  return (
    <main className="page page-narrow">
      <p className="note"><Link href="/app">← {t('title')}</Link></p>
      <h1>{t('newTitle')}</h1>
      <p className="lead">{t('newLead')}</p>
      <ProjectForm />
    </main>
  );
}
