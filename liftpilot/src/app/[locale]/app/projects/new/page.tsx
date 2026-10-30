import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { denied, requireCapability } from '@/lib/auth';
import { RIGHT_OF_STEP, can } from '@/lib/rbac';
import { fmt } from '@/lib/rilievi/fmt';
import { dividiIndirizzo } from '@/lib/collega/testo';
import { getScheda } from '@/server/rilievi/queries';
import ProjectForm from '@/components/ProjectForm';
import Crumbs from '@/components/Crumbs';

export async function generateMetadata() {
  const t = await getTranslations('projects');
  return { title: t('newTitle') };
}

// A new installation: its data only — the type of intervention is chosen in its «Calcolo argano», where it opens for
// whoever makes the calculations (round 45; an old ?kind= is ignored). From a survey («Crea impianto», round 44:
// ?rilievo=<id>, which also needs the right to link surveys) the name, the address and the plant number start from the
// survey (the two measured ones marked «dal rilievo»; the name is only proposed), and the installation is created
// linked to it.
export default async function NewProjectPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ rilievo?: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'impianti:create');
  const sp = await searchParams;
  if (sp.rilievo && !can(user, 'rilievi:link')) denied(locale, user, 'rilievi:link');
  const [t, tc] = await Promise.all([getTranslations('projects'), getTranslations('collega')]);
  const s = sp.rilievo ? await getScheda(user.companyId, sp.rilievo) : null;
  const title = s ? s.numeroImpianto ? tc('titoloNumero', { n: s.numeroImpianto }) : s.matricola ? tc('titoloMatricola', { n: s.matricola }) : s.indirizzo ?? tc('titolo') : '';
  // the measured values the form marks (the name is the survey's address as written or the title copied, not a
  // measure: no mark); the municipality the survey writes last goes to the city, the province in brackets to the
  // province (round 46: the city was left in the address and typed again)
  const parti = dividiIndirizzo(s?.indirizzo);
  const valori = s ? Object.fromEntries(Object.entries({ address: parti.via, city: parti.citta, province: parti.provincia, plantNumber: s.matricola })
    .filter((e): e is [string, string] => !!e[1])) : {};
  const name = s ? (s.indirizzo ?? title).slice(0, 160) : '';
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
      <ProjectForm calcola={can(user, RIGHT_OF_STEP.calcolo)} initial={s && !s.projectId ? { name, address: valori.address ?? '', city: valori.city ?? '', province: valori.province ?? '',
        plantNumber: valori.plantNumber ?? '', client: '', notes: '' } : undefined}
        rilievo={s && !s.projectId ? { id: s.id, origine: { date: fmt.day(s.data), valori } } : null} />
    </main>
  );
}
