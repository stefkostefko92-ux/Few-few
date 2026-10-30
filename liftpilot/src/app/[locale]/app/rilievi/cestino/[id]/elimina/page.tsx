import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { sheetToPurge } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import Confirm from '@/components/rilievi/Confirm';
import RilieviHead from '@/components/rilievi/RilieviHead';

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('trash.purgeTitle') };
}

// «Elimina definitivamente» (rilievi GET /cestino/:id/elimina): only a sheet in the trash, only for whoever manages the
// trash (the owner); the sheet and its measurements go for good, the activity log keeps that it happened.
export default async function PurgeRilievoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:trash-manage');
  const scheda = await sheetToPurge(user, id);
  if (!scheda) notFound();
  const [t, tn] = await Promise.all([getTranslations('rilievi'), getTranslations('nav')]);
  const rt = t as unknown as RilieviT;
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app/rilievi', label: tn('rilievi') }, { href: '/app/rilievi/cestino', label: t('trash.title') }, { label: schedaTitle(scheda, rt) }]} />
      <RilieviHead title={t('trash.purgeTitle')} lead={t('trash.purgeText')} />
      <Confirm mode="purge" scheda={scheda} t={rt} />
    </main>
  );
}
