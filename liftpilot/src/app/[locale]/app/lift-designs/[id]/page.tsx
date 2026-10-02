import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { idSchema } from '@/lib/schemas';
import { liftRecord } from '@/lib/lift-record';
import { liftAdvice, liftAlternative } from '@/lib/lift/advice';
import { designMachine, designOrder } from '@/lib/order/machine';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { getLiftDesign } from '@/server/queries';
import { projectCost, visiblePrices } from '@/server/prices';
import { designBasis } from '@/lib/prices/plant-bom';
import { designBom } from '@/lib/prices/bom';
import ProjectCost from '@/components/prices/ProjectCost';
import LiftView from '@/components/lift/LiftView';
import AdviceView from '@/components/lift/AdviceView';
import IssueForm from '@/components/tavole/IssueForm';
import Crumbs from '@/components/Crumbs';
import VerdictPill from '@/components/VerdictPill';

export async function generateMetadata() {
  const t = await getTranslations('lift');
  return { title: t('designTitle') };
}

// A saved installation: the 3D simulation and every check, derived again from the form as entered; the documents
// made from its calculation and shaft design (report, plan in DXF, drawing sets), which exist only while the running
// engines reproduce their hashes.
export default async function LiftDesignPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'projects:view');
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) notFound();
  const d = await getLiftDesign(user, parsedId.data);
  if (!d) notFound();
  const [t, tp, tt, ta] = await Promise.all([getTranslations('lift'), getTranslations('projects'), getTranslations('tavole'), getTranslations('advice')]);
  const fd = dateFormat(locale);
  // the running engines give the same records? (else the documents are refused: a new save is needed)
  const r = liftRecord(d, d.shaftDesign.sha256, d.calculation.sha256), same = r?.same ?? false, dv = r?.dv ?? null;
  const editable = can(user, 'calc:create') && !d.project.archivedAt;
  // the advice among SICOR and Montanari for the saved inputs, and the machine of the draft order: the one the design
  // verified, or the advice's first
  const advice = r ? liftAdvice(r.inputs) : null, alt = r && advice ? liftAlternative(r.inputs, advice) : null;
  const own = dv ? designMachine(dv) : null, fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  const order = same && r && advice && can(user, 'report:download') ? designOrder(r.inputs, advice, r.dv) : null;
  // the cost of its articles with the company's prices: only for whoever sees prices
  const prices = await visiblePrices(user), costed = dv ? await projectCost(user, designBom(dv), 'full', designBasis(dv)) : null;
  return (
    <main className="page page-wide">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${d.project.id}`, label: d.project.name }, { label: t('designTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{d.label || t('designTitle')}</h1>
          <p className="lead">{fd.dateTime(d.createdAt)} · {d.user?.name ?? '—'} · <VerdictPill verdict={d.verdict} fails={d.failCount} warns={d.warnCount} /></p>
        </div>
        <div className="actions">
          {editable ? <Link className="btn btn-primary" href={`/app/projects/${d.project.id}/progetto?from=${d.id}`}>{t('edit')}</Link> : null}
        </div>
      </div>
      {!same ? <p className="alert alert-warn" role="status">{t('engineChanged')}</p> : null}
      {r ? <LiftView inputs={r.inputs} prices={prices} /> : <p className="alert alert-bad" role="status">{t('unreadable')}</p>}
      {costed ? <ProjectCost cost={costed.cost} skipped={costed.skipped} locale={locale} scope="design" editable={can(user, 'prices:edit')} /> : null}
      {advice ? (
        <AdviceView advice={advice} alt={alt && dv ? { advice: alt, sheave: dv.machine.D } : null} fmt={fmt} where="design"
          inUse={(c) => own !== null && own.brand === c.brand && own.model === c.model && own.I.layout === c.I.layout} />
      ) : null}
      <section className="flex flex-col gap-3">
        <h2>{t('docs_title')}</h2>
        <p className="note">{t('docs_lead')}</p>
        {same ? (
          <div className="doc-links">
            {can(user, 'report:download') ? <a className="btn" href={`/api/calculations/${d.calculation.id}/relazione`}>{t('doc_relazione')}</a> : null}
            {can(user, 'report:download') ? <a className="btn" href={`/api/shaft-designs/${d.shaftDesign.id}/dxf`}>{t('doc_dxf')}</a> : null}
            <Link className="btn" href={`/app/calculations/${d.calculation.id}`}>{t('doc_calc')}</Link>
            <Link className="btn" href={`/app/shaft-designs/${d.shaftDesign.id}`}>{t('doc_shaft')}</Link>
          </div>
        ) : <p className="note">{t('docs_refused')}</p>}
        {same && can(user, 'report:download') ? (
          <div className="panel">
            <h3>{t('doc_export')}</h3>
            <p className="note">{t('export_lead')}</p>
            <div className="doc-links">
              <a className="btn" href={`/api/lift-designs/${d.id}/pdf`}>{t('doc_pdf')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dxf`}>{t('doc_dxf_all')}</a>
              <a className="btn" href={`/api/lift-designs/${d.id}/dwg`}>{t('doc_dwg')}</a>
            </div>
          </div>
        ) : null}
        {same && can(user, 'report:download') ? (
          <div className="panel">
            <h3>{ta('order_title')}</h3>
            <p className="note">{ta('order_lead')}</p>
            {order ? (
              <>
                <p className="order-machine">{ta(order.recorded ? 'order_chosen_design' : 'order_advised_design', { machine: `${order.machine.brand} ${order.machine.model}` })}</p>
                <div className="doc-links">
                  <a className="btn" href={`/api/lift-designs/${d.id}/order/docx`}>{ta('order_docx')}</a>
                  <a className="btn" href={`/api/lift-designs/${d.id}/order/pdf`}>{ta('order_pdf')}</a>
                </div>
              </>
            ) : <p className="note">{ta('order_none')}</p>}
          </div>
        ) : null}
        {same && editable ? (
          <div className="panel">
            <h3>{tt('title')}</h3>
            <p className="note">{tt('lead')}</p>
            <IssueForm calculationId={d.calculation.id} />
          </div>
        ) : null}
      </section>
    </main>
  );
}
