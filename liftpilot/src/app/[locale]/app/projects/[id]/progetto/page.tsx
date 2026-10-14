import { notFound, redirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { requireCapability } from '@/lib/auth';
import { idSchema } from '@/lib/schemas';
import { dateFormat } from '@/lib/dates';
import { getProject } from '@/server/queries';
import { visiblePrices } from '@/server/prices';
import { liftStart } from '@/server/lift-start';
import LiftWorkspace from '@/components/lift/LiftWorkspace';
import Crumbs from '@/components/Crumbs';
import RilievoAvviso from '@/components/collega/RilievoAvviso';
import { avvioLift } from '@/server/collega/forms';
import { pitchesOf } from '@/lib/plant';
import { openedByRefresh } from '@/lib/refresh-form';

export async function generateMetadata() {
  const t = await getTranslations('lift');
  return { title: t('workTitle') };
}

// The one form of an installation with its live 3D simulation: from a saved design (?from=), else from the form's draft,
// else from the latest design, else from the installation's shaft design and calculation with the rest of the project
// to enter, else empty (src/server/lift-start.ts). Opened by «Aggiorna con il software attuale» on a design that no longer
// saves as it was (&aggiorna=1), it says so at its top with what to correct. With a survey linked to the installation
// (round 44) what is still to enter takes the measured values, marked «dal rilievo» (never over a saved design opened
// again); «usa il valore del rilievo» (&usa=<parametro>) puts one in on purpose, said on top.
export default async function LiftWorkPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string; aggiorna?: string; usa?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'progetto:edit');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  // the one form is the full project's; a replacement becomes one from its page (upgradeProjectAction)
  if (p.kind !== 'FULL') redirect(`/${locale}/app/projects/${p.id}`);
  const sp = await searchParams, from = idSchema.safeParse(sp.from);
  const start = await liftStart(user, p.id, from.success ? from.data : null);
  // a saved design opened again (chosen, or the latest one) has nothing to enter: the survey seeds a new form (also over
  // the software's standards), a carried over one or a draft (only what is still empty)
  const mode = from.success || (!start.draftAt && start.blank.length === 0) ? null : start.draftAt || start.carried ? 'draft' : 'new';
  const avvio = await avvioLift(user, p.id, start, mode, sp.usa);
  const [t, tp] = await Promise.all([getTranslations('lift'), getTranslations('projects')]);
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: t('workTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('workTitle')}</h1>
          <p className="lead">{t('workLead')}</p>
        </div>
      </div>
      {avvio.rilievo ? <RilievoAvviso rilievo={avvio.rilievo} usa={avvio.usa} /> : null}
      <LiftWorkspace key={`${from.success ? from.data : 'start'}:${sp.usa ?? ''}`} projectId={p.id} initial={avvio.start.inputs} blank={avvio.start.blank}
        prices={await visiblePrices(user)} origine={avvio.origine}
        pitches={pitchesOf(p.plant)} draft={{ projectId: p.id, scope: 'lift', resumed: start.draftAt ? dateFormat(locale).dateTime(new Date(start.draftAt)) : null }}
        refresh={from.success && openedByRefresh(sp)} />
    </main>
  );
}
