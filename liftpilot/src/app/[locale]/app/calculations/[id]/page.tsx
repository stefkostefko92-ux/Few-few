import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { NORMA_BREVE, normeOf } from '@/lib/lift/collaudo';
import { calcMachine, calcOrder, designMachine, designOrder } from '@/lib/order/machine';
import { savedLiftAdvice, savedLiftAlternative, savedValuesAdvice } from '@/lib/lift/advice-cache';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { getCalculation, latestRoomOf, listDrawingSets, listRoomDesigns, refreshedFrom } from '@/server/queries';
import { projectCost } from '@/server/prices';
import { calcRecord, recordMarks, storedCollaudo } from '@/server/records';
import { designBasis } from '@/lib/prices/plant-bom';
import { analyse } from '@/lib/present/analysis';
import { calcBom, designBom } from '@/lib/prices/bom';
import { bomKind } from '@/lib/prices/bom-parts';
import { initialsOf } from '@/lib/tavole/compose';
import { issueChecks } from '@/lib/tavole/issue-check';
import { idSchema } from '@/lib/schemas';
import ProjectCost from '@/components/prices/ProjectCost';
import IssueForm from '@/components/tavole/IssueForm';
import VerdictPill from '@/components/VerdictPill';
import ReviewForm from '@/components/ReviewForm';
import { REVIEW_MAX } from '@/lib/review';
import Crumbs from '@/components/Crumbs';
import CalculationView from '@/components/calc/CalculationView';
import RefreshForm from '@/components/RefreshForm';
import Refreshed from '@/components/Refreshed';
import AdviceView from '@/components/lift/AdviceView';
import { pitchesOf, plantData, plantReadSchema } from '@/lib/plant';
import { withPitches } from '@/shaft/brackets';

export async function generateMetadata() {
  const t = await getTranslations('calculations');
  return { title: t('viewTitle') };
}

export default async function CalculationPage({ params, searchParams }: {
  params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ da?: string }>;
}) {
  const { locale, id } = await params, da = idSchema.safeParse((await searchParams).da);
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const c = await getCalculation(user, id);
  if (!c) notFound();
  // the calculation with the records it was made from (its advice and order follow its lift design): its documents need
  // all of them reproduced (src/server/records.ts)
  const rec = calcRecord(c);
  if (!rec) notFound();
  const { lift, calcSame: same, values: V } = rec;
  // the standards of the acceptance test: the lift design's, else those chosen with it (else by the context), as the
  // report sets them out
  const C = lift?.dv.collaudo ?? storedCollaudo(rec.values, c.collaudo), norme = normeOf(C);
  const [t, tp, tr, ts, tt, ta, tm, tf, sets, before] = await Promise.all([getTranslations('calculations'), getTranslations('projects'), getTranslations('roles'),
    getTranslations('shaft'), getTranslations('tavole'), getTranslations('advice'), getTranslations('room'), getTranslations('refresh'), listDrawingSets(user, c.projectId),
    refreshedFrom(user, 'calculation', da.data, c.projectId)]);
  // a replacement's project: the machine room surveyed on this calculation, its relazione tecnica and drawing sets
  const replacement = c.project.kind === 'REPLACEMENT' && !c.liftDesign;
  const rooms = replacement ? (await listRoomDesigns(user, c.projectId)).filter((x) => x.calculationId === c.id) : [];
  const below = V.layout === 'bottom', open = can(user, 'calc:create') && !c.project.archivedAt;
  // made again in one click: a lift design's calculation with the design, a replacement's with its machine room; one in
  // the archive of a whole project is made again from the project's form (refresh-actions.ts)
  const refreshable = can(user, 'records:refresh') && !c.project.archivedAt && (!!c.liftDesign || replacement);
  // the machine room of the calculation it was made again from, which the new one did not take: to be redone from it
  const lost = before && da.success && replacement && rooms.length === 0 ? await latestRoomOf(user, da.data) : null;
  // the advice among SICOR and Montanari and the machine of the draft order: those of the lift design the calculation
  // was made from (its machine room, the sheave direct pull needs), as the design's page and the report give them; else
  // for the saved values: the catalogue's machine these values are, or the advice's first
  const advice = lift ? savedLiftAdvice(lift.inputs) : savedValuesAdvice(V), alt = lift ? savedLiftAlternative(lift.inputs, advice) : null;
  const own = lift ? designMachine(lift.dv) : calcMachine(V), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  // a calculation of a design the running engines no longer reproduce has no order: the design is saved again
  const download = rec.ok && can(user, 'report:download');
  const order = !download ? null : lift ? designOrder(lift.inputs, advice, lift.dv) : calcOrder(V, advice);
  // the cost with the company's prices (only for whoever sees prices): the design's articles, or the replacement's machine
  // (a lift design tested to UNI 10411: only the parts it replaces, as a replacement) with the ropes cut as sheet 1 of its
  // shaft design measures them
  const costKind = lift ? bomKind(lift.dv.collaudo) : 'replacement';
  const costed = await projectCost(user, lift ? designBom({ ...lift.dv, layout: withPitches(lift.dv.layout, pitchesOf(c.project.plant)) }, plantData(c.project.plant)) : calcBom(V, C, null, rec.design?.layout ?? null), costKind,
    lift ? designBasis(lift.dv) : { stops: null, travel: analyse(V).ctx.I.H });
  const where = lift ? 'design' : 'calc';
  // before an issue: the machine the data of the installation name against the catalogue's the set would carry (the
  // marks of the record, as the issue reads them), the plant number of an existing lift, the client
  const plant = plantReadSchema.safeParse(c.project.plant ?? {});
  const checks = issueChecks(plant.success ? plant.data : {}, recordMarks(rec, c.collaudo).catalog ?? null, c.project, C.norma !== 'en81');
  const mine = sets.filter((x) => x.calculationId === c.id);
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${c.projectId}`, label: c.project.name }, { label: t('viewTitle') }]} />
      <div className="page-head">
        <div className="titles"><h1>{t('viewTitle')}{c.label ? ` · ${c.label}` : ''}</h1></div>
        <div className="actions">
          {rec.ok && can(user, 'report:download') ? (
            <a className="btn btn-primary" href={`/api/calculations/${c.id}/relazione?locale=${locale}`}>{t('downloadReport')}</a>
          ) : null}
          {c.liftDesign ? <Link className="btn" href={`/app/lift-designs/${c.liftDesign.id}`}>{ts('openLift')}</Link>
            : replacement && open ? <Link className="btn" href={`/app/projects/${c.projectId}/calc?from=${c.id}`}>{t('newFrom')}</Link> : null}
        </div>
      </div>
      {before ? <Refreshed before={before} now={c} locale={locale} /> : null}
      {lost ? (
        <p className="alert alert-warn" role="status">{tf('roomRedo')} <Link href={`/app/calculations/${c.id}/locale?from=${lost.id}`}>{tf('roomOpen')}</Link></p>
      ) : null}
      {rec.ok ? null : (
        <div className="alert alert-warn flex flex-col items-start gap-2" role="status">
          <p className="m-0">{tf(c.liftDesign ? 'design' : replacement ? 'calc' : 'archive')}</p>
          {refreshable ? <RefreshForm kind="calc" id={c.id} />
            : open ? <Link className="btn" href={`/app/projects/${c.projectId}/progetto`}>{ts('openForm')}</Link> : null}
        </div>
      )}
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
      {costed ? <ProjectCost cost={costed.cost} skipped={costed.skipped} locale={locale} scope={!lift ? 'calc' : costKind === 'full' ? 'design' : 'modification'} editable={can(user, 'prices:edit')} /> : null}
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
        {can(user, 'calc:review') && !c.project.archivedAt && c.reviews.length < REVIEW_MAX ? <ReviewForm calculationId={c.id} /> : null}
      </section>
      {replacement ? (
        <section className="panel" aria-labelledby="calc-room">
          <h2 id="calc-room">{tm('calcTitle')}</h2>
          <p className="note">{below ? tm('calcBelow') : tm('calcLead')}</p>
          {rooms.length ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {rooms.map((x) => (
                <li key={x.id}><Link href={`/app/room-designs/${x.id}`}>{fd.dateTime(x.createdAt)}{x.label ? ` · ${x.label}` : ''}</Link> · <span className="note">{x.summary}</span></li>
              ))}
            </ul>
          ) : null}
          {!below && same && open ? (
            <div><Link className="btn btn-primary" href={`/app/calculations/${c.id}/locale`}>{rooms.length ? tm('again') : tm('start')}</Link></div>
          ) : null}
        </section>
      ) : null}
      <section className="panel">
        <h2>{tt('title')}</h2>
        <p className="note">{replacement ? tm('setsFromRoom') : tt('lead')}</p>
        {mine.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {mine.map((x) => (
              <li key={x.id}><Link href={`/app/drawing-sets/${x.id}`} className="num">{x.number}{x.revision ? ` R${x.revision}` : ''}</Link> · <span className="note">{fd.dateTime(x.createdAt)} · {x.user?.name ?? x.authorInitials}</span></li>
            ))}
          </ul>
        ) : null}
        {replacement ? null : !c.shaftDesign ? <p className="note">{tt('needDesign')}</p>
          : rec.ok && open ? <IssueForm calculationId={c.id} initials={initialsOf(user.name)} checks={checks} projectId={c.projectId} /> : null}
      </section>
      <CalculationView values={V} brand={user.companyName} collaudo={C} />
    </main>
  );
}
