import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import SectionTitle from '@/components/project/SectionTitle';
import { requireCapability } from '@/lib/auth';
import { can, remakerOf } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { idSchema } from '@/lib/schemas';
import { liftRecord } from '@/lib/lift-record';
import { savedLiftAdvice, savedLiftAlternative } from '@/lib/lift/advice-cache';
import { designMachine, designOrder } from '@/lib/order/machine';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { getLiftDesign, refreshedFrom } from '@/server/queries';
import { projectCost, visiblePrices } from '@/server/prices';
import { designBasis } from '@/lib/prices/plant-bom';
import { pitchesOf, plantData, plantReadSchema } from '@/lib/plant';
import { withPitches } from '@/shaft/brackets';
import { designBom } from '@/lib/prices/bom';
import { bomKind } from '@/lib/prices/bom-parts';
import { initialsOf } from '@/lib/tavole/compose';
import { issueChecks } from '@/lib/tavole/issue-check';
import { valueMarks } from '@/lib/lift/marks';
import { ambitoOf } from '@/lib/lift/collaudo';
import { macchinaResta } from '@/lib/lift/intervento';
import ProjectCost from '@/components/prices/ProjectCost';
import LiftView from '@/components/lift/LiftView';
import AdviceView from '@/components/lift/AdviceView';
import IssueForm from '@/components/tavole/IssueForm';
import Crumbs from '@/components/Crumbs';
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

// A saved installation: the 3D simulation and every check, derived again from the form as entered; the documents
// made from its calculation and shaft design (report, plan in DXF, drawing sets), which exist only while the running
// engines reproduce their hashes; else «Aggiorna con il software attuale» saves it again. Round 45: the «Calcolo
// argano» it was drawn on (or that it is a design of the one form before it); drawn on an older calculation than the
// installation's latest, «Aggiorna il progetto con l'ultimo calcolo» draws it again on that one (ridisegna-actions.ts).
export default async function LiftDesignPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ da?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const d = await getLiftDesign(user, parsedId.data);
  if (!d) notFound();
  const [t, tp, tt, ta, tg, ti, tc, before, base, latest] = await Promise.all([getTranslations('lift'), getTranslations('projects'), getTranslations('tavole'),
    getTranslations('advice'), getTranslations('progetto'), getTranslations('calculations.intervento'), getTranslations('calculations'), refreshedFrom(user, 'liftDesign', (await searchParams).da, d.project.id),
    d.baseCalculationId ? prisma.calculation.findFirst({ where: { id: d.baseCalculationId, companyId: user.companyId }, select: { id: true, createdAt: true, inputs: true, collaudo: true, intervento: true } }) : null,
    calcoloBase(user, d.project.id)]);
  const fd = dateFormat(locale);
  // the running engines give the same records? (else the documents are refused: a new save is needed)
  // the bracket pitches of the installation's data count the brackets of the list and place them in 3D, as on sheet 1
  const pitches = pitchesOf(d.project.plant), r = liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256), same = r?.same ?? false;
  const dv = r ? { ...r.dv, layout: withPitches(r.dv.layout, pitches) } : null;
  const live = !d.project.archivedAt, editable = can(user, 'progetto:edit') && live, issues = can(user, 'drawings:issue') && live;
  // drawn on an older «Calcolo argano» than the installation's latest (one of the one form: older than it)
  const newer = latest && (base ? latest.id !== base.id : latest.createdAt > d.createdAt) ? latest : null;
  // the advice among SICOR and Montanari for the saved inputs, and the machine of the draft order: the one the design
  // verified, or the advice's first
  const advice = r ? savedLiftAdvice(r.inputs) : null, alt = r && advice ? savedLiftAlternative(r.inputs, advice) : null;
  const own = dv ? designMachine(dv) : null, fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  // drawn on a modernisation keeping the machine: no advice and no order (order-export.ts refuses it too)
  const kept = !!dv && macchinaResta(d.calculation.intervento, dv.collaudo);
  const order = same && r && advice && !kept && can(user, 'report:download') ? designOrder(r.inputs, advice, r.dv) : null;
  // the cost of its articles with the company's prices: only for whoever sees prices
  // (a modification tested to UNI 10411: only the parts it replaces, as a replacement)
  const prices = await visiblePrices(user), kind = dv ? bomKind(dv.collaudo) : 'full';
  const costed = dv ? await projectCost(user, designBom(dv, plantData(d.project.plant)), kind, designBasis(dv)) : null;
  // before an issue: the machine the data of the installation name against the catalogue's the set would carry, the
  // plant number of an existing lift, the client
  const plant = plantReadSchema.safeParse(d.project.plant ?? {}), catalog = r ? valueMarks(r.inputs.auto, r.dv, r.dv.bottom, r.dv.collaudo).catalog : null;
  // (and the data of the installation sheet 1 reads that are not entered: plant.ts)
  const checks = issueChecks(plant.success ? plant.data : {}, catalog ?? null, d.project, (r?.dv.collaudo.norma ?? 'en81') !== 'en81',
    { whole: true, rails: !r || ambitoOf(r.dv.collaudo, 'gr_stress') === 'applies', underPit: r?.dv.bottom === 'under' });
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${d.project.id}`, label: d.project.name }, { label: t('designTitle') }]} />
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
          <p>{tg('ridisegnaLead', { date: fd.date(newer.createdAt) })}</p>
          {editable ? (
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
      {r ? <LiftView inputs={r.inputs} prices={prices} pitches={pitches} /> : <p className="alert alert-bad" role="status">{t('unreadable')}</p>}
      {costed ? <ProjectCost cost={costed.cost} skipped={costed.skipped} locale={locale} scope={kind === 'full' ? 'design' : kept ? 'modificationResta' : 'modification'} editable={can(user, 'prices:edit')} /> : null}
      {advice && !kept ? (
        <AdviceView advice={advice} alt={alt && dv ? { advice: alt, sheave: dv.machine.D } : null} fmt={fmt} where="design"
          inUse={(c) => own !== null && own.brand === c.brand && own.model === c.model && own.I.layout === c.I.layout} />
      ) : null}
      <section className="flex flex-col gap-3">
        <SectionTitle icon="file-export">{t('docs_title')}</SectionTitle>
        <p className="note">{t('docs_lead')}</p>
        {same ? (
          <div className="doc-links">
            {can(user, 'report:download') ? <a className="btn" href={`/api/calculations/${d.calculation.id}/relazione`}><Icon name="file-pdf" size={18} />{t('doc_relazione')}</a> : null}
            {can(user, 'report:download') ? <a className="btn" href={`/api/shaft-designs/${d.shaftDesign.id}/dxf`}><Icon name="file-dxf" size={18} />{t('doc_dxf')}</a> : null}
            <Link className="btn" href={`/app/calculations/${d.calculation.id}`}><Icon name="calculator" size={18} />{t('doc_calc')}</Link>
            <Link className="btn" href={`/app/shaft-designs/${d.shaftDesign.id}`}><Icon name="floor-plan" size={18} />{t('doc_shaft')}</Link>
          </div>
        ) : <p className="note">{t('docs_refused')}</p>}
        {same && can(user, 'report:download') ? (
          <div className="panel">
            <SectionTitle level={3} icon="file-cad">{t('doc_export')}</SectionTitle>
            <p className="note">{t('export_lead')}</p>
            <div className="doc-links">
              <a className="btn" href={`/api/lift-designs/${d.id}/pdf`}><Icon name="file-pdf" size={18} />{t('doc_pdf')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dxf`}><Icon name="file-dxf" size={18} />{t('doc_dxf_all')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dwg`}><Icon name="file-dwg" size={18} />{t('doc_dwg')}</a>
            </div>
          </div>
        ) : null}
        {same && can(user, 'report:download') ? (
          <div className="panel">
            <SectionTitle level={3} icon="file-text">{ta('order_title')}</SectionTitle>
            {/* a machine kept: nothing to order, said in place of what the draft would carry */}
            <p className="note">{kept ? tc('progetto.ordineResta') : ta('order_lead')}</p>
            {order ? (
              <>
                <p className="order-machine">{ta(order.recorded ? 'order_chosen_design' : 'order_advised_design', { machine: `${order.machine.brand} ${order.machine.model}` })}</p>
                <div className="doc-links">
                  <a className="btn" href={`/api/lift-designs/${d.id}/order/docx`}><Icon name="file-text" size={18} />{ta('order_docx')}</a>
                  <a className="btn" href={`/api/lift-designs/${d.id}/order/pdf`}><Icon name="file-pdf" size={18} />{ta('order_pdf')}</a>
                </div>
              </>
            ) : kept ? null : <p className="note">{ta('order_none')}</p>}
          </div>
        ) : null}
        {same && issues ? (
          <div className="panel">
            <SectionTitle level={3} icon="file-stack">{tt('title')}</SectionTitle>
            <p className="note">{tt('lead')}</p>
            <IssueForm calculationId={d.calculation.id} initials={initialsOf(user.name)} checks={checks} projectId={d.project.id} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
