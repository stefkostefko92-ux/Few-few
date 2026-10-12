import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { newFormValues } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import RilieviHead from '@/components/rilievi/RilieviHead';
import SchedaForm from '@/components/rilievi/SchedaForm';

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('schede.create.title') };
}

// A new survey sheet (rilievi /schede/nuova): today's date in Rome, everything else empty; the suppliers' modules come
// prefilled with the company and the person writing, for when they are opened.
export default async function NewRilievoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:edit');
  const [t, tn] = await Promise.all([getTranslations('rilievi'), getTranslations('nav')]);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/rilievi', label: tn('rilievi') }, { label: t('schede.create.title') }]} />
      <RilieviHead title={t('schede.create.title')} lead={t('schede.create.sub')} />
      <SchedaForm initial={newFormValues(user)} edit={null} cancelHref="/app/rilievi" />
    </main>
  );
}
