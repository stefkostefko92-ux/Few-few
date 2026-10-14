import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { moduloSpecs } from '@/lib/rilievi/ordini/form';
import { collegatiData, formSections, newForm } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import RilieviHead from '@/components/rilievi/RilieviHead';
import SchedaForm from '@/components/rilievi/SchedaForm';

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('schede.create.title') };
}

// A new survey sheet (rilievi /schede/nuova): today's date in Rome, everything else empty, the sections in the company's
// order; the suppliers' modules come prefilled with the company and the person writing, for when they are opened.
export default async function NewRilievoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:edit');
  const [t, tn, order] = await Promise.all([getTranslations('rilievi'), getTranslations('nav'), formSections(user)]);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/rilievi', label: tn('rilievi') }, { label: t('schede.create.title') }]} />
      <RilieviHead title={t('schede.create.title')} lead={t('schede.create.sub')} />
      <SchedaForm initial={newForm(user)} edit={null} cancelHref="/app/rilievi" specs={moduloSpecs()} order={order} collegati={collegatiData(user)} />
    </main>
  );
}
