import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon from '@/components/Icon';
import SectionTitle from '@/components/project/SectionTitle';
import { requireCapability } from '@/lib/auth';
import { can, remakerOf, remakes } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { NORMA_BREVE, ambitoOf, normeOf } from '@/lib/lift/collaudo';
import { calcMachine, calcOrder, designMachine, designOrder } from '@/lib/order/machine';
import { savedLiftAdvice, savedLiftAlternative, savedValuesAdvice } from '@/lib/lift/advice-cache';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { makeFmt } from '@/lib/present/tr';
import { getCalculation, latestRoomOf, listDrawingSets, listRoomDesigns, refreshedFrom } from '@/server/queries';
import { roomSummaryLine } from '@/server/room-summary';
import { projectCost } from '@/server/prices';
import { calcRecord, recordMarks, storedCollaudo } from '@/server/records';
import { designBasis } from '@/lib/prices/plant-bom';
import { analyse } from '@/lib/present/analysis';
import { calcBom, calcUncounted, designBom } from '@/lib/prices/bom';
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
import StaleNotice from '@/components/StaleNotice';
import Refreshed from '@/components/Refreshed';
import AdviceView from '@/components/lift/AdviceView';
import { pitchesOf, plantData, plantReadSchema } from '@/lib/plant';
import { withPitches } from '@/shaft/brackets';
import { disegnoDi, macchinaResta } from '@/lib/lift/intervento';
import { progettiSu, rilevaLocale, tipoDi } from '@/server/calcolo-base';
import CalcRuolo from '@/components/calc/CalcRuolo';
import ProgettoPanel from '@/components/calc/ProgettoPanel';

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
  // what the record is (round 45, by its shape, not by the installation's former kind): a «Calcolo argano» (step 2), a
  // lift design's own calculation, or one of the archive made from a shaft design; its type, declared or read; the
  // machine room is surveyed on a «Calcolo argano» of an existing lift; a machine kept is not ordered
  const step2 = !c.liftDesign && !c.shaftDesign, perLocale = rilevaLocale(c), tipo = tipoDi(c), kept = macchinaResta(c.intervento, C);
  const disegno = step2 ? disegnoDi(tipo, C, V) : null;
  const roomLine = await roomSummaryLine();
  const rooms = perLocale ? (await listRoomDesigns(user, c.projectId)).filter((x) => x.calculationId === c.id).map((x) => ({ ...x, summary: roomLine(x) })) : [];
  const progetti = step2 ? await progettiSu(user, c.id) : [];
  const below = V.layout === 'bottom', live = !c.project.archivedAt;
  // a variant in the calculator (calc:create); the one form, the machine room's survey (progetto:edit); a drawing set
  const open = can(user, 'calc:create') && live, draws = can(user, 'progetto:edit') && live, issues = can(user, 'drawings:issue') && live;
  // made again in one click: a lift design's calculation with the design (whoever draws the project), a «Calcolo argano»
  // with its machine room; one in the archive of a whole project is made again from the Progetto (refresh-actions.ts)
  const remaker = remakerOf(user, c.liftDesign ? 'lift' : 'calc', live && (!!c.liftDesign || step2));
  // the machine room of the calculation it was made again from, which the new one did not take: to be redone from it
  const lost = before && da.success && perLocale && rooms.length === 0 ? await latestRoomOf(user, da.data) : null;
  // the advice among SICOR and Montanari and the machine of the draft order: those of the lift design the calculation
  // was made from (its machine room, the sheave direct pull needs), as the design's page and the report give them; else
  // for the saved values: the catalogue's machine these values are, or the advice's first
  const advice = lift ? savedLiftAdvice(lift.inputs) : savedValuesAdvice(V), alt = lift ? savedLiftAlternative(lift.inputs, advice) : null;
  const own = lift ? designMachine(lift.dv) : calcMachine(V), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']);
  // a calculation of a design the running engines no longer reproduce has no order: the design is saved again
  const download = rec.ok && can(user, 'report:download');
  const order = !download || kept ? null : lift ? designOrder(lift.inputs, advice, lift.dv) : calcOrder(V, advice);
  // the cost with the company's prices (only for whoever sees prices): the design's articles, or the replacement's machine
  // (a lift design tested to UNI 10411: only the parts it replaces, as a replacement) with the ropes cut as sheet 1 of its
  // shaft design measures them
  const costKind = bomKind(lift ? lift.dv.collaudo : C);
  const costed = await projectCost(user, lift ? designBom({ ...lift.dv, layout: withPitches(lift.dv.layout, pitchesOf(c.project.plant)) }, plantData(c.project.plant)) : calcBom(V, C, null, rec.design?.layout ?? null), costKind,
    lift ? designBasis(lift.dv) : { stops: null, travel: analyse(V).ctx.I.H });
  const where = lift ? 'design' : 'calc';
  // before an issue: the machine the data of the installation name against the catalogue's the set would carry (the
  // marks of the record, as the issue reads them), the plant number of an existing lift, the client
  const plant = plantReadSchema.safeParse(c.project.plant ?? {});
  const marks = recordMarks(rec, c.collaudo);
  const checks = issueChecks(plant.success ? plant.data : {}, marks.catalog ?? null, c.project, C.norma !== 'en81',
    { whole: true, rails: ambitoOf(C, 'gr_stress') === 'applies', underPit: below && (marks.bottom ?? 'head') === 'under' });
  const mine = sets.filter((x) => x.calculationId === c.id);
  const fd = dateFormat(locale);
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${c.projectId}`, label: c.project.name }, { label: t('viewTitle') }]} />
      <div className="page-head">
        <div className="titles">
          <h1>{t('viewTitle')}{c.label ? ` · ${c.label}` : ''}</h1>
          <CalcRuolo tipo={tipo} ruolo={step2 ? 'calcolo' : c.liftDesign ? 'progetto' : 'archivio'} base={c.liftDesign?.baseCalculation ?? null} locale={locale} />
        </div>
        <div className="actions">
          {rec.ok && can(user, 'report:download') ? (
            <a className="btn btn-primary" href={`/api/calculations/${c.id}/relazione`}>{t('downloadReport')}</a>
          ) : null}
          {c.liftDesign ? <Link className="btn" href={`/app/lift-designs/${c.liftDesign.id}`}>{ts('openLift')}</Link> : null}
          {/* every calculation starts a new «Calcolo argano» (round 45): a lift design's with its drawing's values marked */}
          {open ? <Link className="btn" href={`/app/projects/${c.projectId}/calc?from=${c.id}`}>{t('newFrom')}</Link> : null}
        </div>
      </div>
      {before ? <Refreshed before={before} now={c} kind="calc" locale={locale} /> : null}
      {lost ? (
        <p className="alert alert-warn" role="status">
          {/* whoever only makes the calculations did not carry the machine room over (refresh-actions.ts remakeCalc) */}
          {remakes(user, 'room') ? <>{tf('roomRedo')}{draws ? <> <Link href={`/app/calculations/${c.id}/locale?from=${lost.id}`}>{tf('roomOpen')}</Link></> : null}</> : tf('roomLeft')}
        </p>
      ) : null}
      {/* without the button, who makes it again: a lift design's, whoever draws the project; a replacement's, whoever
          makes the calculations (rbac.ts remakerOf) */}
      {rec.ok ? null : (
        <StaleNotice text={c.liftDesign ? 'design' : step2 ? 'calc' : 'archive'} by={remaker} refresh={{ kind: 'calc', id: c.id }}>
          {draws ? <Link className="btn" href={`/app/projects/${c.projectId}/progetto`}>{ts('openForm')}</Link> : null}
        </StaleNotice>
      )}
      <dl className="cartiglio">
        <div><dt>{t('col_result')}</dt><dd><VerdictPill verdict={c.verdict} fails={c.failCount} warns={c.warnCount} record={{ kind: 'calc', id: c.id }} /></dd></div>
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
      {costed ? <ProjectCost cost={costed.cost} skipped={costed.skipped} uncounted={lift ? null : calcUncounted(C)} locale={locale} scope={!lift ? 'calc' : costKind === 'full' ? 'design' : 'modification'}
        editable={can(user, 'prices:edit')} /> : null}
      {download ? (
        <section className="panel">
          <SectionTitle icon="file-text">{ta('order_title')}</SectionTitle>
          <p className="note">{ta('order_lead')}</p>
          {order ? (
            <>
              <p className="order-machine">{ta(`${order.recorded ? 'order_chosen' : 'order_advised'}_${where}`, { machine: `${order.machine.brand} ${order.machine.model}` })}</p>
              <div className="doc-links">
                <a className="btn" href={`/api/calculations/${c.id}/order/docx`}><Icon name="file-text" size={18} />{ta('order_docx')}</a>
                <a className="btn" href={`/api/calculations/${c.id}/order/pdf`}><Icon name="file-pdf" size={18} />{ta('order_pdf')}</a>
              </div>
            </>
          ) : <p className="note">{kept ? t('progetto.ordineResta') : ta('order_none')}</p>}
        </section>
      ) : null}
      <section className="panel">
        <SectionTitle icon="user-check">{t('reviewsTitle')}</SectionTitle>
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
      {disegno ? <ProgettoPanel calcId={c.id} projectId={c.projectId} disegno={disegno} repl={V.context === 'repl'} below={below} rooms={rooms} progetti={progetti}
        draws={draws && same} locale={locale} /> : null}
      <section className="panel">
        <SectionTitle icon="file-stack">{tt('title')}</SectionTitle>
        <p className="note">{disegno ? (disegno === 'locale' ? tm('setsFromRoom') : t('progetto.tavole')) : tt('lead')}</p>
        {mine.length ? (
          <ul className="rec-list">
            {mine.map((x) => (
              <li key={x.id}><Link href={`/app/drawing-sets/${x.id}`} className="num">{x.number}{x.revision ? ` R${x.revision}` : ''}</Link><span className="note">{fd.dateTime(x.createdAt)} · {x.user?.name ?? x.authorInitials}</span></li>
            ))}
          </ul>
        ) : null}
        {step2 ? null : !c.shaftDesign ? <p className="note">{tt('needDesign')}</p>
          : rec.ok && issues ? <IssueForm calculationId={c.id} initials={initialsOf(user.name)} checks={checks} projectId={c.projectId} /> : null}
      </section>
      <CalculationView id="checks" values={V} brand={user.companyName} collaudo={C} design={!!c.shaftDesign} tipo={c.intervento} resta={kept} />
    </main>
  );
}
