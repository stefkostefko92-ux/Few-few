import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { idSchema } from '@/lib/schemas';
import { dateFormat } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { disegnoDi } from '@/lib/lift/intervento';
import { getProject } from '@/server/queries';
import { visiblePrices } from '@/server/prices';
import { calcoloBase } from '@/server/calcolo-base';
import { progettoStart } from '@/server/progetto-start';
import ProgettoWorkspace from '@/components/lift/ProgettoWorkspace';
import Crumbs from '@/components/Crumbs';
import RilievoAvviso from '@/components/collega/RilievoAvviso';
import { avvioProgetto } from '@/server/collega/forms';
import { pitchesOf } from '@/lib/plant';
import { openedByRefresh } from '@/lib/refresh-form';
import { schizziOf } from '@/server/schizzi/queries';
import { testoAiuto } from '@/lib/aiuto';
import { ConAiuto } from '@/components/shaft/Campo';
import AIUTO from '../../../../../../../messages/aiuto/progetto.json';
import '@/components/schizzi/schizzi.css';

export async function generateMetadata() {
  const t = await getTranslations('lift');
  return { title: t('workTitle') };
}

// The Progetto of an installation (round 45): the drawing made on a «Calcolo argano» — the one chosen (?calc=, a step-2
// calculation of this installation, else 404), else the latest. Without one there is nothing to draw on: the way to the
// calculation (a lift design of the one form before round 45 says so, with the way to bring its data into the
// calculation). A design of the one form newer than the latest calculation (an installation made whole after its
// replacement) is not drawn on that older calculation by default — its data go to the calculation first, as the
// lift design's page has it (calcolo-base.ts legacyPiuNuovo); chosen with ?calc= it is. A base no longer reproduced
// is updated first. A base whose Progetto is the machine room's survey says
// so on top — the whole drawing stays possible. The drawing starts from a saved design (?from=), its draft, the latest
// design, the installation's records, else empty (src/server/progetto-start.ts); with a linked survey its stops come
// from it, marked «dal rilievo» (round 44). Opened by «Aggiorna con il software attuale» (&aggiorna=1), it says why on top.
// The installation's survey sketches go beside the form (round 50, SchizzoPanel). Round 52: the lead says the essential,
// the «?» beside the title the rest.
export default async function ProgettoPage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ from?: string; calc?: string; aggiorna?: string; usa?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'progetto:edit');
  const p = await getProject(user, id);
  if (!p || p.archivedAt) notFound();
  const sp = await searchParams, from = idSchema.safeParse(sp.from), chosen = sp.calc === undefined ? null : idSchema.safeParse(sp.calc);
  if (chosen && !chosen.success) notFound();
  const found = await calcoloBase(user, p.id, chosen?.data);
  if (chosen && !found) notFound();
  const [t, tl, tp] = await Promise.all([getTranslations('progetto'), getTranslations('lift'), getTranslations('projects')]);
  const fd = dateFormat(locale), canCalc = can(user, 'calc:create');
  // the latest lift design: one of the one form (no base) newer than the base asks for its data to be brought over
  const legacy = await prisma.liftDesign.findFirst({
    where: { projectId: p.id, companyId: user.companyId }, orderBy: { createdAt: 'desc' }, select: { id: true, calculationId: true, baseCalculationId: true, createdAt: true },
  });
  const unico = legacy && legacy.baseCalculationId === null && (!found || legacy.createdAt > found.createdAt) ? legacy : null;
  // that older calculation is drawn on only when chosen
  const base = unico && !chosen ? null : found;
  const head = (
    <>
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${p.id}`, label: p.name }, { label: tl('workTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <ConAiuto aiuto={testoAiuto(AIUTO, 'pagina')} nome={tl('workTitle')} block><h1>{tl('workTitle')}</h1></ConAiuto>
          <p className="lead">{tl('workLead')}</p>
        </div>
      </div>
      {unico ? (
        <div className="alert alert-info progetto-avviso" role="status">
          <p>{t('legacy')}</p>
          <div className="btnrow">
            {canCalc ? <Link className="btn btn-sm" href={`/app/projects/${p.id}/calc?from=${unico.calculationId}`}>{t('portaLegacy')}</Link> : <span className="note">{t('byOther')}</span>}
          </div>
        </div>
      ) : null}
    </>
  );
  // (a)/(b) nothing to draw on: the calculation first
  if (!base) {
    return (
      <main className="page page-wide">
        {head}
        {unico ? null : (
          <section className="panel progetto-vuoto">
            <h2>{t('vuoto')}</h2>
            <p className="note">{t('vuotoLead')}</p>
            {canCalc ? <div><Link className="btn btn-primary" href={`/app/projects/${p.id}/calc`}>{t('calcola')}</Link></div> : <p className="note">{t('byOther')}</p>}
          </section>
        )}
      </main>
    );
  }
  // (d) the base no longer reproduced: made again first (its save would be refused)
  if (!base.same) {
    return (
      <main className="page page-wide">
        {head}
        <p className="alert alert-warn" role="status">{t('stale')} <Link href={`/app/calculations/${base.id}`}>{t('apri')}</Link></p>
      </main>
    );
  }
  const start = await progettoStart(user, p.id, base, from.success ? from.data : null);
  // a saved design opened again (chosen, or the latest one) has nothing to enter: the survey seeds a new drawing, a
  // carried over one or a draft (only what is still empty)
  const mode = from.success || (!start.draftAt && start.blank.length === 0) ? null : start.draftAt || start.carried ? 'draft' : 'new';
  const avvio = await avvioProgetto(user, p.id, start, mode, sp.usa, start.draftAt ? start : undefined);
  const soloLocale = disegnoDi(base.tipo, base.collaudo, base.values) === 'locale';
  const sk = await schizziOf(user, p.id);
  const schizzi = sk ? { projectId: p.id, initial: sk.schizzi, aiEnabled: sk.aiEnabled, canUpload: can(user, 'projects:edit'), canRead: can(user, 'progetto:edit') } : null;
  return (
    <main className="page page-wide">
      {head}
      {/* (e) an intervention whose Progetto is the machine room's survey: said on top by its type (round 46: a modernisation
          of the machine room's parts read as a «Solo argano»), the whole drawing possible */}
      {soloLocale ? (
        <p className="alert alert-info" role="status">{t(base.tipo === 'SOLO_ARGANO' ? 'soloNota' : 'localeNota')} <Link href={`/app/calculations/${base.id}/locale`}>{t('rileva')}</Link></p>
      ) : null}
      {avvio.rilievo ? <RilievoAvviso rilievo={avvio.rilievo} usa={avvio.usa} parte={avvio.seeded.length > 0} /> : null}
      <ProgettoWorkspace key={`${base.id}:${from.success ? from.data : 'start'}:${sp.usa ?? ''}`} projectId={p.id} initial={avvio.start}
        base={{ id: base.id, createdAt: base.createdAt.toISOString(), values: base.values, collaudo: base.collaudo, tipo: base.tipo }} when={fd.dateTime(base.createdAt)}
        canCalc={canCalc} prices={await visiblePrices(user)} origine={avvio.origine} pitches={pitchesOf(p.plant)}
        draft={{ projectId: p.id, scope: 'lift', resumed: start.draftAt ? fd.dateTime(new Date(start.draftAt)) : null }}
        refresh={from.success && openedByRefresh(sp)} schizzi={schizzi} />
    </main>
  );
}
