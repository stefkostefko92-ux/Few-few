import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { formValuesSchema } from '@/lib/calc-input';
import { collaudoSchema } from '@/lib/lift-input';
import { NORMA_BREVE, collaudoOf, normeOf } from '@/lib/lift/collaudo';
import { verifyStored } from '@/lib/snapshot-hash';
import { reproduceDesign } from '@/lib/shaft-hash';
import { ENGINE_VERSION } from '@/calc/snapshot';
import { SHAFT_ENGINE_VERSION } from '@/shaft';
import { calcMachine, calcOrder, designMachine, designOrder } from '@/lib/order/machine';
import { liftAdvice, liftAlternative, valuesAdvice } from '@/lib/lift/advice';
import { liftRecord } from '@/lib/lift-record';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { getCalculation, listDrawingSets } from '@/server/queries';
import { visiblePrices } from '@/server/prices';
import { calcBom, designBom } from '@/lib/prices/bom';
import { costOf } from '@/lib/prices/cost';
import ProjectCost from '@/components/prices/ProjectCost';
import IssueForm from '@/components/tavole/IssueForm';
import VerdictPill from '@/components/VerdictPill';
import ReviewForm from '@/components/ReviewForm';
import Crumbs from '@/components/Crumbs';
import CalculationView from '@/components/calc/CalculationView';
import AdviceView from '@/components/lift/AdviceView';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('viewTitle') };
}

export default async function CalculationPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const c = await getCalculation(user, id);
  if (!c) notFound();
  const values = formValuesSchema.safeParse(c.inputs);
  if (!values.success) notFound();
  const { same } = verifyStored(values.data, c.sha256);
  // the lift design it was made from, derived again (its advice and order follow it)
  const lift = c.liftDesign ? liftRecord(c.liftDesign, c.shaftDesign?.sha256, c.sha256) : null;
  // the standards of the acceptance test: the lift design's, else those chosen with it (else by the context), as the
  // report sets them out
  const chosen = c.collaudo ? collaudoSchema.safeParse(c.collaudo) : null;
  const C = lift?.dv.collaudo ?? collaudoOf(values.data, chosen?.success ? chosen.data : undefined), norme = normeOf(C);
  // the report draws the plan of the shaft design too: it needs that design reproduced as well
  const designSame = !c.shaftDesign || reproduceDesign(c.shaftDesign) !== null;
  const [t, tp, tr, ts, tt, ta, sets] = await Promise.all([getTranslations('calculations'), getTranslations('projects'), getTranslations('roles'), getTranslations('shaft'),
    getTranslations('tavole'), getTranslations('advice'), listDrawingSets(user, c.projectId)]);
  // the advice among SICOR and Montanari and the machine of the draft order: those of the lift design the calculation
  // was made from (its machine room, the sheave direct pull needs), as the design's page and the report give them; else
  // for the saved values: the catalogue's machine these values are, or the advice's first
  const advice = lift ? liftAdvice(lift.inputs) : valuesAdvice(values.data), alt = lift ? liftAlternative(lift.inputs, advice) : null;
  const own = lift ? designMachine(lift.dv) : calcMachine(values.data), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  // a calculation of a design the running engines no longer reproduce has no order: the design is saved again
  const download = same && can(user, 'report:download') && (!c.liftDesign || !!lift?.same);
  const order = !download ? null : lift ? designOrder(lift.inputs, advice, lift.dv) : calcOrder(values.data, advice);
  // the cost with the company's prices (only for whoever sees prices): the design's articles, or the replacement's machine
  const prices = await visiblePrices(user);
  const cost = prices ? costOf(lift ? designBom(lift.dv) : calcBom(values.data), new Map(Object.entries(prices))) : null;
  const where = lift ? 'design' : 'calc';
  const mine = sets.filter((x) => x.calculationId === c.id);
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${c.projectId}`, label: c.project.name }, { label: t('viewTitle') }]} />
      <div className="page-head">
        <div className="titles"><h1>{t('viewTitle')}{c.label ? ` · ${c.label}` : ''}</h1></div>
        <div className="actions">
          {same && designSame && can(user, 'report:download') ? (
            <a className="btn btn-primary" href={`/api/calculations/${c.id}/relazione?locale=${locale}`}>{t('downloadReport')}</a>
          ) : null}
          {can(user, 'calc:create') && !c.project.archivedAt ? (
            <Link className="btn" href={`/app/projects/${c.projectId}/calc?from=${c.id}`}>{t('newFrom')}</Link>
          ) : null}
        </div>
      </div>
      {same ? null : <p className="alert alert-warn">{t('engineChanged', { stored: c.engineVersion, current: ENGINE_VERSION })}</p>}
      {c.shaftDesign && !designSame ? <p className="alert alert-warn">{ts('designChanged', { stored: c.shaftDesign.engineVersion, current: SHAFT_ENGINE_VERSION })}</p> : null}
      <dl className="cartiglio">
        <div><dt>{t('col_result')}</dt><dd><VerdictPill verdict={c.verdict} fails={c.failCount} warns={c.warnCount} /></dd></div>
        <div><dt>{t('col_date')}</dt><dd>{fd.dateTime(c.createdAt)}</dd></div>
        <div><dt>{t('col_author')}</dt><dd>{c.user?.name ?? '—'}</dd></div>
        <div><dt>{t('col_machine')}</dt><dd className="num">{c.summary}</dd></div>
        <div><dt>{t('engine')}</dt><dd className="num">{c.engineVersion} · {c.profileId}</dd></div>
        <div><dt>{t('norme')}</dt><dd>{norme.map((n) => NORMA_BREVE[n]).join(' · ')}</dd></div>
        {c.shaftDesign ? (
          <div><dt>{ts('linked')}</dt><dd><Link href={`/app/shaft-designs/${c.shaftDesign.id}`} className="num">{c.shaftDesign.summary}</Link></dd></div>
        ) : null}
        <div className="wide"><dt>{t('col_hash')}</dt><dd className="hash">{c.sha256}{same ? ` · ${t('hashOk')}` : ''}</dd></div>
      </dl>
      <AdviceView advice={advice} alt={alt && lift ? { advice: alt, sheave: lift.dv.machine.D } : null} fmt={fmt} where={where}
        inUse={(x) => own !== null && own.brand === x.brand && own.model === x.model && (!lift || own.I.layout === x.I.layout)} />
      {cost ? <ProjectCost cost={cost} locale={locale} scope={lift ? 'design' : 'calc'} editable={can(user, 'prices:edit')} /> : null}
      {download ? (
        <section className="panel">
          <h2>{ta('order_title')}</h2>
          <p className="note">{ta('order_lead')}</p>
          {order ? (
            <>
              <p className="order-machine">{ta(`${order.recorded ? 'order_chosen' : 'order_advised'}_${where}`, { machine: `${order.machine.brand} ${order.machine.model}` })}</p>
              <div className="doc-links">
                <a className="btn" href={`/api/calculations/${c.id}/order/docx`}>{ta('order_docx')}</a>
                <a className="btn" href={`/api/calculations/${c.id}/order/pdf`}>{ta('order_pdf')}</a>
              </div>
            </>
          ) : <p className="note">{ta('order_none')}</p>}
        </section>
      ) : null}
      <section className="panel">
        <h2>{t('reviewsTitle')}</h2>
        {c.reviews.length ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {c.reviews.map((r) => (
              <li key={r.id} className="border-b border-rule pb-2 last:border-b-0">
                <b>{r.user?.name ?? '—'}</b>{r.user ? ` · ${tr(r.user.role)}` : ''} · <span className="note">{fd.dateTime(r.createdAt)}</span>
                {r.note ? <p className="whitespace-pre-line">{r.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : <p className="note">{t('noReviews')}</p>}
        {can(user, 'calc:review') ? <ReviewForm calculationId={c.id} /> : null}
      </section>
      <section className="panel">
        <h2>{tt('title')}</h2>
        <p className="note">{tt('lead')}</p>
        {mine.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {mine.map((x) => (
              <li key={x.id}><Link href={`/app/drawing-sets/${x.id}`} className="num">{x.number}{x.revision ? ` R${x.revision}` : ''}</Link> · <span className="note">{fd.dateTime(x.createdAt)} · {x.user?.name ?? x.authorInitials}</span></li>
            ))}
          </ul>
        ) : null}
        {!c.shaftDesign ? <p className="note">{tt('needDesign')}</p>
          : same && designSame && can(user, 'calc:create') && !c.project.archivedAt ? <IssueForm calculationId={c.id} /> : null}
      </section>
      <CalculationView values={values.data} brand={user.companyName} collaudo={C} />
    </main>
  );
}
