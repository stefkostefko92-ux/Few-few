import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { idSchema } from '@/lib/schemas';
import { dateFormat } from '@/lib/dates';
import { getProject } from '@/server/queries';
import { calcStart } from '@/server/calc-start';
import Calculator from '@/components/calc/Calculator';
import Crumbs from '@/components/Crumbs';
import RefreshNotice from '@/components/RefreshNotice';
import RilievoAvviso from '@/components/collega/RilievoAvviso';
import { avvioCalc } from '@/server/collega/forms';
import { openedByRefresh } from '@/lib/refresh-form';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('newTitle') };
}

// «Calcolo argano» (round 45), for every installation and every type of intervention: it starts from the chosen saved
// calculation (?from=), else from the form's draft, else from the project's latest step-2 calculation, else from its
// latest calculation of any provenance (a whole project before round 45), else empty (src/server/calc-start.ts) —
// nothing of the installation or the machines filled in, the type of intervention to choose first. Opened by «Aggiorna
// con il software attuale» on a calculation that no longer saves as it was (&aggiorna=1), it says so on top. Started
// from a lift design's calculation, the values its drawing gave are marked «dal progetto» and said on top. With a survey
// linked to the installation (round 44) a new calculation or its draft takes the measured values where still empty,
// marked «dal rilievo» and said on top; a saved calculation continued says nothing of the survey (its values are the
// calculation's, whatever equals the survey); «usa il valore del rilievo» (&usa=<parametro>) puts one in on purpose,
// said on top — for whoever sees the surveys (src/server/collega/forms.ts).
export default async function CalcPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string; aggiorna?: string; usa?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:create');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const sp = await searchParams, from = idSchema.safeParse(sp.from);
  const start = await calcStart(user, p.id, from.success ? from.data : null);
  const avvio = await avvioCalc(user, p.id, start.values, start.mode, sp.usa, start.draft ?? undefined);
  const fd = dateFormat(locale);
  const progetto = start.progetto ? { date: fd.date(start.progetto.at), valori: start.progetto.valori } : null;
  const origine = progetto ? { ...(avvio.origine ?? { date: '', valori: {} }), progetto } : avvio.origine;
  const [t, tp] = await Promise.all([getTranslations('calculations'), getTranslations('projects')]);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('newTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('newTitle')}</h1>
          <p className="lead">{t('newLead')}</p>
        </div>
      </div>
      {from.success && openedByRefresh(sp) ? <RefreshNotice kind="calc" /> : null}
      {avvio.rilievo ? <RilievoAvviso rilievo={avvio.rilievo} usa={avvio.usa} parte={avvio.seeded.length > 0} /> : null}
      {progetto ? <p className="alert alert-info" role="status">{t('intervento.dalProgetto', { date: progetto.date })}</p> : null}
      <Calculator key={sp.usa ?? 'start'} projectId={p.id} initial={avvio.start} preset={null} brand={user.companyName} intervento={start.intervento} origine={origine}
        draft={{ projectId: p.id, scope: 'calc', resumed: start.draft ? fd.dateTime(new Date(start.draft.at)) : null }} />
    </main>
  );
}
