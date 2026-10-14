import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { fmt } from '@/lib/rilievi/fmt';
import { schedaTitle } from '@/lib/rilievi/format';
import { moduloSpecs } from '@/lib/rilievi/ordini/form';
import type { RilieviT } from '@/lib/rilievi/t';
import { collegatiData, editForm, formSections, sheetToEdit } from '@/server/rilievi/pages';
import Crumbs from '@/components/Crumbs';
import { EditLead, EditLeadProvider } from '@/components/rilievi/EditLead';
import RilieviHead from '@/components/rilievi/RilieviHead';
import SchedaForm from '@/components/rilievi/SchedaForm';

export async function generateMetadata() {
  const t = await getTranslations('rilievi');
  return { title: t('schede.edit.title') };
}

// A sheet edited in place (rilievi /schede/:id/modifica): its values, its rows per stop, its modules (or their prefill
// when never filled), the fields still following a module and the data that disagree, in the company's order, over the
// version it was opened on — `base` = its updatedAt; a save over a newer one is a conflict, and then the head's «Ultima
// modifica» names the newer version (EditLead). A sheet of another company, unknown or in the trash: not found.
export default async function EditRilievoPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'rilievi:edit');
  const scheda = await sheetToEdit(user, id);
  if (!scheda) notFound();
  const [t, tn, order] = await Promise.all([getTranslations('rilievi'), getTranslations('nav'), formSections(user, scheda)]);
  const rt = t as unknown as RilieviT;
  const title = schedaTitle(scheda, rt);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tn('rilievi') }, { href: '/app/rilievi', label: tn('rilieviAll') }, { href: `/app/rilievi/${scheda.id}`, label: title }, { label: t('schede.edit.title') }]} />
      <EditLeadProvider initial={t('scheda.meta.updated', { name: scheda.updatedBy?.name ?? '—', at: fmt.dateTime(scheda.updatedAt) })}>
        <RilieviHead title={t('schede.edit.title')} lead={<EditLead />} />
        <SchedaForm initial={editForm(user, scheda)} edit={{ id: scheda.id, base: scheda.updatedAt.toISOString() }} cancelHref={`/app/rilievi/${scheda.id}`}
          specs={moduloSpecs()} order={order} collegati={collegatiData(user)} />
      </EditLeadProvider>
    </main>
  );
}
