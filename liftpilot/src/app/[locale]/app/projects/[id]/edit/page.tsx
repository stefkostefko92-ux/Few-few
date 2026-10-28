import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { getProject } from '@/server/queries';
import { usaDatiImpianto } from '@/server/collega/forms';
import ProjectForm from '@/components/ProjectForm';
import Crumbs from '@/components/Crumbs';
import ImpiantoNav from '@/components/impianto/ImpiantoNav';

// The installation's data. From the comparison (round 44, ?usa=indirizzo|matricola) the reference survey's address or
// matricola (the installation's «Numero di matricola») is put in the form, marked «dal rilievo», and said on top: saved
// only with «Salva». Only for whoever sees the surveys (src/server/collega/forms.ts): for another role the link is the
// plain form.
export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ usa?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:edit');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const [t, tc, usa] = await Promise.all([getTranslations('projects'), getTranslations('collega'), searchParams.then((s) => s.usa)]);
  const u = await usaDatiImpianto(user, p.id, usa);
  const initial = { id: p.id, name: p.name, address: p.address ?? '', city: p.city ?? '', province: p.province ?? '', plantNumber: p.plantNumber ?? '',
    client: p.client ?? '', notes: p.notes ?? '' };
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app/impianti', label: t('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('editTitle') }]} />
      <ImpiantoNav user={user} projectId={p.id} corrente="panoramica" />
      <h1>{t('editTitle')}</h1>
      {u ? (
        <p className="alert alert-info" role="status">
          {tc(initial[u.field] && initial[u.field] !== u.value ? 'origine.usaDonePrima' : 'origine.usaDone', { param: t(`field_${u.field}`), valore: u.value, prima: initial[u.field] })}
        </p>
      ) : null}
      <ProjectForm initial={u ? { ...initial, ...u.extra, [u.field]: u.value } : initial}
        rilievo={u ? { id: null, origine: { date: u.date, valori: { ...u.extra, [u.field]: u.value } } } : null} />
    </main>
  );
}
