import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import { requireCapability } from '@/lib/auth';
import { can, remakerOf } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { idSchema } from '@/lib/schemas';
import { liftRecord } from '@/lib/lift-record';
import { getLiftDesign, refreshedFrom } from '@/server/queries';
import { pitchesOf } from '@/lib/plant';
import { interventoDi, stessoIntervento, type Dichiarato } from '@/lib/lift/intervento';
import LiftRiepilogo from '@/components/lift/LiftRiepilogo';
import Crumbs from '@/components/Crumbs';
import ImpiantoNav from '@/components/impianto/ImpiantoNav';
import VerdictPill from '@/components/VerdictPill';
import StaleNotice from '@/components/StaleNotice';
import Refreshed from '@/components/Refreshed';
import { prisma } from '@/lib/db';
import { calcoloBase, tipoDi } from '@/server/calcolo-base';
import { ridisegnaDalCalcoloAction } from '@/server/ridisegna-actions';

export async function generateMetadata() {
  const t = await getTranslations('lift');
  return { title: t('designTitle') };
}

// A saved installation: what the software worked out and every check — the problems first —, derived again from the
// form as entered; the way to its simulation and to its documents (round 53: their own pages, «Simulazione» and «Tavole e
// documenti», for this design), which exist only while the running engines reproduce its hashes; else «Aggiorna con il
// software attuale» saves it again. Round 45: the «Calcolo argano» it was drawn on (or that it is a design of the one form
// before it); drawn on an older calculation than the installation's latest, «Aggiorna il progetto con l'ultimo calcolo»
// draws it again on that one (ridisegna-actions.ts).
export default async function LiftDesignPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ da?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const d = await getLiftDesign(user, parsedId.data);
  if (!d) notFound();
  const [t, tp, tg, ti, ts, td, before, base, latest] = await Promise.all([getTranslations('lift'), getTranslations('projects'),
    getTranslations('progetto'), getTranslations('calculations.intervento'), getTranslations('simulazione'), getTranslations('documenti'),
    refreshedFrom(user, 'liftDesign', (await searchParams).da, d.project.id),
    d.baseCalculationId ? prisma.calculation.findFirst({ where: { id: d.baseCalculationId, companyId: user.companyId }, select: { id: true, createdAt: true, inputs: true, collaudo: true, intervento: true } }) : null,
    calcoloBase(user, d.project.id)]);
  const fd = dateFormat(locale);
  // the running engines give the same records? (else the documents are refused: a new save is needed)
  // the bracket pitches of the installation's data count the brackets as sheet 1 does
  const pitches = pitchesOf(d.project.plant), r = liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256), same = r?.same ?? false;
  const dv = r?.dv ?? null;
  const live = !d.project.archivedAt, editable = can(user, 'progetto:edit') && live;
  // drawn on an older «Calcolo argano» than the installation's latest (one of the one form: older than it)
  const newer = latest && (base ? latest.id !== base.id : latest.createdAt > d.createdAt) ? latest : null;
  // the latest calculation of another intervention than the design's (type, renovation, parts): named, and drawn again
  // only through the Progetto (round 46: one click had saved it with another scope)
  const own$: Dichiarato | null = dv ? { tipo: d.calculation.intervento ?? interventoDi(dv.values.context, dv.collaudo), collaudo: dv.collaudo } : null;
  const nome = (x: Dichiarato): string => (x.collaudo.rifacimento ? ti('rif_preset') : ti(x.tipo))
    + (x.tipo === 'AMMODERNAMENTO' && !x.collaudo.rifacimento ? ` (${x.collaudo.parti.map((p) => t(`parte_${p}`)).join(', ')})` : '');
  const cambio = newer && own$ && !stessoIntervento(own$, newer) ? { da: nome(own$), a: nome(newer) } : null;
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${d.project.id}`, label: d.project.name }, { label: t('designTitle') }]} />
      <ImpiantoNav user={user} projectId={d.project.id} corrente="progetto" />
      <div className="page-head">
        <div className="titles">
          <h1>{d.label || t('designTitle')}</h1>
          <div className="lead">{fd.dateTime(d.createdAt)} · {d.user?.name ?? '—'} · <VerdictPill verdict={d.verdict} fails={d.failCount} warns={d.warnCount} record={{ kind: 'lift', id: d.id }} /></div>
        </div>
        <div className="actions">
          {editable ? <Link className="btn btn-primary" href={`/app/projects/${d.project.id}/progetto?from=${d.id}${base ? `&calc=${base.id}` : ''}`}>{tg('modifica')}</Link> : null}
        </div>
      </div>
      <p className="calc-ruolo progetto-base">
        {base ? <>{tg('base')}: <Link href={`/app/calculations/${base.id}`}>{fd.dateTime(base.createdAt)} — {ti(tipoDi(base))}</Link></> : tg('moduloUnico')}
      </p>
      {newer ? (
        <div className="alert alert-warn ridisegna" role="status">
          <p>{cambio ? tg('ridisegnaCambio', { date: fd.date(newer.createdAt), ...cambio }) : tg('ridisegnaLead', { date: fd.date(newer.createdAt) })}</p>
          {editable && cambio ? (
            <Link className="btn btn-sm" href={`/app/projects/${d.project.id}/progetto?from=${d.id}&calc=${newer.id}`}>{tg('ridisegnaApri')}</Link>
          ) : editable ? (
            <form action={ridisegnaDalCalcoloAction}>
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="btn btn-sm">{tg('ridisegna')}</button>
            </form>
          ) : <p className="note">{tg('ridisegnaByOther')}</p>}
        </div>
      ) : null}
      {before ? <Refreshed before={before} now={d} kind="lift" locale={locale} /> : null}
      {/* a new lift design: whoever draws the project (rbac.ts remakerOf); the others read who does */}
      {same ? null : <StaleNotice text="design" by={remakerOf(user, 'lift', live)} refresh={r ? { kind: 'lift', id: d.id } : null} />}
      {/* its simulation and its documents, each on its own page */}
      <div className="doc-links">
        <Link className="btn" href={`/app/projects/${d.project.id}/simulazione?design=${d.id}`}><Icon name="cube" size={18} />{ts('titolo')}</Link>
        <Link className="btn" href={`/app/projects/${d.project.id}/documenti?design=${d.id}`}><Icon name="file-stack" size={18} />{td('titolo')}</Link>
        {dv && dv.collaudo.norma !== 'en81' ? <Link className="btn" href={`/app/projects/${d.project.id}/relazione-tecnica`}><Icon name="file-text" size={18} />{t('doc_rt')}</Link> : null}
      </div>
      {r ? <LiftRiepilogo inputs={r.inputs} pitches={pitches} projectId={d.project.id} designId={d.id} /> : <p className="alert alert-bad" role="status">{t('unreadable')}</p>}
    </main>
  );
}
