import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { schedaTitle } from '@/lib/rilievi/format';
import type { RilieviT } from '@/lib/rilievi/t';
import { sheetToEdit } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import Confirm from '@/components/rilievi/Confirm';
import RilieviHead from '@/components/rilievi/RilieviHead';

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('schede.delete.title') };
}

// «Elimina» (rilievi GET /schede/:id/elimina): the sheet moves to the trash, from where the owner can restore it. Only
// for whoever may (the Progettista, the owner); a sheet of another company, unknown or already in the trash: not found.
export default async function TrashRilievoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:trash');
  const scheda = await sheetToEdit(user, id);
  if (!scheda) notFound();
  const [t, tn] = await Promise.all([getTranslations('rilievi'), getTranslations('nav')]);
  const rt = t as unknown as RilieviT;
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app/rilievi', label: tn('rilievi') }, { href: `/app/rilievi/${scheda.id}`, label: schedaTitle(scheda, rt) }, { label: t('scheda.actions.delete') }]} />
      <RilieviHead title={t('schede.delete.title')} lead={t('schede.delete.text')} />
      <Confirm mode="trash" scheda={scheda} t={rt} />
    </main>
  );
}
