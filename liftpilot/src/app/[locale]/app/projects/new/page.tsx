import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { denied, requireCapability } from '@/lib/auth';
import { can, formRightOf } from '@/lib/rbac';
import type { ProjectKind } from '@/lib/schemas';
import { fmt } from '@/lib/rilievi/fmt';
import { getScheda } from '@/server/rilievi/queries';
import ProjectForm from '@/components/ProjectForm';
import Crumbs from '@/components/Crumbs';

export async function generateMetadata() {
  const t = await getTranslations('projects');
  return { title: t('newTitle') };
}

// the module comes from the dashboard (?kind=replacement|full); it can still be changed here. From a survey («Crea
// impianto», round 44: ?rilievo=<id>, which also needs the right to link surveys) the name, the address and the plant
// number start from the survey, marked «dal rilievo», and the installation is created linked to it.
export default async function NewProjectPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string; rilievo?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'impianti:create');
  const sp = await searchParams;
  if (sp.rilievo && !can(user, 'rilievi:link')) denied(locale, user, 'rilievi:link');
  // the modules whose form this user fills; another one is created with its data and opens on its page
  const fills = (['REPLACEMENT', 'FULL'] as const).filter((k: ProjectKind) => can(user, formRightOf(k)));
  const [t, tc] = await Promise.all([getTranslations('projects'), getTranslations('collega')]);
  const kind = sp.kind === 'replacement' ? 'REPLACEMENT' : 'FULL';
  const s = sp.rilievo ? await getScheda(user.companyId, sp.rilievo) : null;
  const title = s ? s.numeroImpianto ? tc('titoloNumero', { n: s.numeroImpianto }) : s.matricola ? tc('titoloMatricola', { n: s.matricola }) : s.indirizzo ?? tc('titolo') : '';
  const valori = s ? Object.fromEntries(Object.entries({ name: (s.indirizzo ?? title).slice(0, 160), address: s.indirizzo, plantNumber: s.matricola })
    .filter((e): e is [string, string] => !!e[1])) : {};
  return (
    <main className="page page-narrow">
      <Crumbs items={[{ href: '/app/impianti', label: t('title') }, { label: t('newTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('newTitle')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      {sp.rilievo && !s ? <p className="alert alert-warn" role="status">{tc('nuovo.missing')}</p> : null}
      {s?.projectId ? (
        <p className="alert alert-warn" role="status">{tc('nuovo.linked')} <Link href={`/app/rilievi/${s.id}`}>{tc('origine.openSheet')}</Link></p>
      ) : s ? <p className="lk-avviso">{tc('nuovo.from', { title, date: fmt.day(s.data) })}</p> : null}
      <ProjectForm kind={kind} fills={fills} initial={s && !s.projectId ? { name: valori.name ?? '', address: valori.address ?? '', city: '', province: '',
        plantNumber: valori.plantNumber ?? '', client: '', notes: '' } : undefined}
        rilievo={s && !s.projectId ? { id: s.id, origine: { date: fmt.day(s.data), valori } } : null} />
    </main>
  );
}
