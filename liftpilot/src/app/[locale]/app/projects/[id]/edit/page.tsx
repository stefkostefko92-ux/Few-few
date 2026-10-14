import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { fmt } from '@/lib/rilievi/fmt';
import { getProject } from '@/server/queries';
import { rilievoDiRiferimento } from '@/server/collega/queries';
import ProjectForm from '@/components/ProjectForm';
import Crumbs from '@/components/Crumbs';

// The installation's data. From the comparison (round 44, ?usa=indirizzo|matricola) the reference survey's address or
// matricola (the installation's «Numero di matricola») is put in the form, marked «dal rilievo», and said on top: saved
// only with «Salva».
export default async function EditProjectPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ usa?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:edit');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const [t, tc, usa] = await Promise.all([getTranslations('projects'), getTranslations('collega'), searchParams.then((s) => s.usa)]);
  const r = usa === 'indirizzo' || usa === 'matricola' ? await rilievoDiRiferimento(user, p.id) : null;
  const value = r ? (usa === 'indirizzo' ? r.indirizzo : r.matricola) : null, field = usa === 'indirizzo' ? 'address' : 'plantNumber';
  const initial = { id: p.id, name: p.name, address: p.address ?? '', city: p.city ?? '', province: p.province ?? '', plantNumber: p.plantNumber ?? '',
    client: p.client ?? '', notes: p.notes ?? '' };
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app/impianti', label: t('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('editTitle') }]} />
      <h1>{t('editTitle')}</h1>
      {r && value ? (
        <p className="alert alert-info" role="status">
          {tc(initial[field] ? 'origine.usaDonePrima' : 'origine.usaDone', { param: t(`field_${field}`), valore: value, prima: initial[field] })}
        </p>
      ) : null}
      <ProjectForm initial={r && value ? { ...initial, [field]: value } : initial}
        rilievo={r && value ? { id: null, origine: { date: fmt.day(r.data), valori: { [field]: value } } } : null} />
    </main>
  );
}
