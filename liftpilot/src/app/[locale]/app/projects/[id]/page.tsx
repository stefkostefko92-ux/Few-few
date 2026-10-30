import { notFound } from 'next/navigation';
import { getLocale, getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { RIGHT_OF_STEP, can, holds } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { getProject, latestLiftDesign, listCalculations, listLiftDesigns, listRoomDesigns, listShaftDesigns } from '@/server/queries';
import { outdated } from '@/server/records';
import { tipoDi } from '@/server/calcolo-base';
import { collegamentoImpianto } from '@/server/collega/impianto';
import { setProjectArchivedAction } from '@/server/project-actions';
import Crumbs from '@/components/Crumbs';
import { roomSummaryLine } from '@/server/room-summary';
import ImpiantoCollegato from '@/components/collega/ImpiantoCollegato';
import TipoTag from '@/components/project/TipoTag';
import { ArchivioSection, CalcoloSection, ProgettoSection } from '@/components/project/ProjectSections';
import ImpiantoNav from '@/components/impianto/ImpiantoNav';
import ProssimoPasso from '@/components/impianto/ProssimoPasso';
import { schedeImpianto } from '@/server/impianto/schede';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations('projects');
  return { title: `${t('project')} ${(await params).id.slice(-6)}` };
}

// An installation's overview (round 45: one layout whatever it was called before — its type of intervention is its
// «Calcolo argano»'s, never stored on it). Round 53: the bar of the installation on top (its steps and their states, the
// same on every page of it), then «Prossimo passo» — one sentence and the page of the step the installation waits for, or
// whose that step is —, its data, its surveys and the comparison (components/collega/ImpiantoCollegato.tsx), then, in the
// order of the work, «Calcolo argano» (its step-2 calculations), the Progetto (its saved versions and the machine rooms
// surveyed: the 3D is the Simulazione's, the documents and the sets are «Tavole e documenti»), and the archive of the
// records made before the one form. A record the running engines no longer reproduce is marked, and the latest lift
// design is updated from here in one click.
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ lk?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const p = await getProject(user, id);
  if (!p) notFound();
  const [t, ti, calcs, designs, lifts, latest, rooms, lang, c] = await Promise.all([getTranslations('projects'),
    getTranslations('calculations.intervento'), listCalculations(user, p.id), listShaftDesigns(user, p.id), listLiftDesigns(user, p.id),
    latestLiftDesign(user, p.id), listRoomDesigns(user, p.id), getLocale(), collegamentoImpianto(user, p)]);
  const s = await schedeImpianto(user, p.id, c);
  const live = !p.archivedAt, place = [p.address, p.city, p.province].filter(Boolean).join(', ');
  const editable = can(user, 'projects:edit') && live, calcola = can(user, RIGHT_OF_STEP.calcolo) && live, disegna = can(user, RIGHT_OF_STEP.progetto) && live;
  const calcHref = `/app/projects/${p.id}/calc`;
  // the step's handoff: a role without its right (held, read-only mode or not) reads whose it is — once: not again in its
  // section when «Prossimo passo» already says it (ProssimoPasso.tsx)
  const detto = (step: 'calcolo' | 'progetto'): boolean => !!s && s.prossimo.scheda === step && !s.schede.find((q) => q.key === step)?.href;
  const handoff = (step: 'calcolo' | 'progetto') => (live && !holds(user, RIGHT_OF_STEP[step]) && !detto(step) ? <p className="note">{t(`handoff_${step}`)}</p> : null);
  // the Progetto on the latest «Calcolo argano»: the machine room or the shaft, by the intervention
  const base = c.base;
  const progettoHref = base ? (c.disegno === 'locale' ? `/app/calculations/${base.id}/locale` : `/app/projects/${p.id}/progetto?calc=${base.id}`) : null;
  // the records by what they are: «Calcolo argano» (step 2), a lift design's (reached from it), the archive
  const step2 = calcs.filter((x) => !x.liftDesign && !x.shaftDesignId)
    .map((x) => ({ ...x, old: outdated.calc(x), tipo: tipoDi(x), reviews: x._count.reviews }));
  const archiveCalcs = calcs.filter((x) => x.shaftDesignId && !x.liftDesign).map((x) => ({ ...x, old: outdated.calc(x) }));
  const shaftRows = designs.filter((d) => !d.liftDesign).map((d) => ({ ...d, old: outdated.shaft(d) }));
  const roomLine = await roomSummaryLine(), roomRows = rooms.map((r) => ({ ...r, summary: roomLine(r), old: outdated.room(r) }));
  const liftRows = lifts.map((d) => ({ ...d, old: outdated.lift(d) }));
  const vuotoProgetto = (
    <>
      <p>{t(c.disegno ? `progettoVuoto_${c.disegno}` : 'progettoVuoto_none')}</p>
      {progettoHref && disegna ? <Link className="btn btn-primary" href={progettoHref}>{t(c.disegno === 'locale' ? 'rileva' : 'disegna')}</Link> : base ? handoff('progetto') : null}
    </>
  );
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/impianti', label: t('title') }, { label: p.name }]} />
      <ImpiantoNav user={user} projectId={p.id} corrente="panoramica" dati={s} />
      <div className="page-head">
        <div className="titles">
          <TipoTag tipo={c.tipo} label={ti(c.tipo ?? 'daDefinire')} />
          {p.archivedAt ? <span className="chip">{t('archived')}</span> : null}
          <h1>{p.name}</h1>
          {place ? <p className="lead">{place}</p> : null}
        </div>
        <div className="actions">
          {editable ? <Link className="btn" href={`/app/projects/${p.id}/edit`}>{t('edit')}</Link> : null}
          {can(user, 'projects:archive') ? (
            <form action={setProjectArchivedAction}>
              <input type="hidden" name="locale" value={lang} />
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="archive" value={p.archivedAt ? '0' : '1'} />
              <button type="submit" className="btn">{p.archivedAt ? t('restore') : t('archive')}</button>
            </form>
          ) : null}
        </div>
      </div>
      {s ? <ProssimoPasso s={s} archiviato={!live} /> : null}

      <dl className="cartiglio">
        <div><dt>{t('field_plantNumber')}</dt><dd className="num">{p.plantNumber ?? '—'}</dd></div>
        <div><dt>{t('field_client')}</dt><dd>{p.client ?? '—'}</dd></div>
        <div><dt>{t('createdBy')}</dt><dd>{p.createdBy?.name ?? '—'} · {fd.date(p.createdAt)}</dd></div>
        <div><dt>{t('updated')}</dt><dd>{fd.dateTime(p.updatedAt)}</dd></div>
        {p.notes ? <div className="wide"><dt>{t('field_notes')}</dt><dd className="whitespace-pre-line">{p.notes}</dd></div> : null}
      </dl>

      <ImpiantoCollegato user={user} p={p} c={c} archived={!live} flash={(await searchParams).lk} />

      <CalcoloSection rows={step2} locale={locale} nuovo={calcola ? calcHref : null} vuoto={(
        <>
          <p>{t('calcoloVuoto')}</p>
          {calcola ? <Link className="btn btn-primary" href={calcHref}>{t('calcola')}</Link> : handoff('calcolo')}
        </>
      )} />
      <ProgettoSection user={user} latest={latest} lifts={liftRows} rooms={roomRows} locale={locale} live={live} vuoto={vuotoProgetto} />
      <ArchivioSection shafts={shaftRows} calcs={archiveCalcs} sources={new Set(designs.filter((d) => d.source).map((d) => d.id))} locale={locale} />
    </main>
  );
}
