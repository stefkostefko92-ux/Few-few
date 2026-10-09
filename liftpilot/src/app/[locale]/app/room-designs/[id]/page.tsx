import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { requireCapability } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { ambitoOf } from '@/lib/lift/collaudo';
import { makeFmt } from '@/lib/present/tr';
import { roomCheckKey } from '@/lib/room/derive';
import { cropped, surveyView } from '@/lib/tavole/views';
import { isUpperLimit, shownValue } from '@/shaft/checks';
import { prisma } from '@/lib/db';
import { reproduceRoomRecord } from '@/server/room-compose';
import { roomSummaryLine } from '@/server/room-summary';
import { getRoomDesign, refreshedFrom } from '@/server/queries';
import { projectCost } from '@/server/prices';
import { calcBom, calcUncounted } from '@/lib/prices/bom';
import { initialsOf } from '@/lib/tavole/compose';
import { issueChecks } from '@/lib/tavole/issue-check';
import { plantReadSchema } from '@/lib/plant';
import ProjectCost from '@/components/prices/ProjectCost';
import Crumbs from '@/components/Crumbs';
import IssueForm from '@/components/tavole/IssueForm';
import DrawingFigure from '@/components/drawing/DrawingFigure';
import ShapesSvg from '@/components/drawing/ShapesSvg';
import VerdictPill from '@/components/VerdictPill';
import RefreshForm from '@/components/RefreshForm';
import Refreshed from '@/components/Refreshed';

export async function generateMetadata() {
  const t = await getTranslations('room');
  return { title: t('viewTitle') };
}

const AREA = { x0: 0, y0: 0, x1: 190, y1: 190 };

// A saved machine room of a replacement: its result, its plan and section, the checks (those of the parts that stay
// marked "esistente"), the documents — the relazione tecnica, the drawing set as a draft, DXF and DWG — and the drawing
// sets issued from it, with the issue of a new one. Drawn again from the stored survey and calculation only when the
// running engines reproduce them; else «Aggiorna con il software attuale» saves it again.
export default async function RoomDesignPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ da?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const r = await getRoomDesign(user, id);
  if (!r) notFound();
  const [t, tp, tc, tt, ts, tf, before] = await Promise.all([getTranslations('room'), getTranslations('projects'), getTranslations('calculations'), getTranslations('tavole'),
    getTranslations('shaft'), getTranslations('refresh'), refreshedFrom(user, 'roomDesign', (await searchParams).da, r.projectId)]);
  const rep = reproduceRoomRecord(r, r.calculation), d = rep.ok ? rep.derived : null;
  const fd = dateFormat(locale), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']), lead = (await roomSummaryLine())(r);
  // a machine room is a replacement's: one in the archive of a whole project is read only (its project is made again
  // from the form)
  const download = !!d && can(user, 'report:download'), editable = can(user, 'calc:create') && !r.project.archivedAt;
  const replacement = r.project.kind === 'REPLACEMENT';
  const views = d ? (['plan', 'section'] as const).map((k) => {
    try {
      const v = surveyView(d, k, AREA);
      return v ? { k, c: cropped(v) } : null;
    } catch {
      return null;
    }
  }).filter((x) => x !== null) : [];
  // what the replacement costs with the company's prices: the machine, its support, the parts the test names replaced
  const costed = d && rep.ok ? await projectCost(user, calcBom(rep.values, rep.collaudo, d), 'replacement', { stops: null, travel: d.analysis.ctx.I.H }) : null;
  // before an issue: the machine the data of the installation name against the calculation's, the plant number, the client
  const plant = plantReadSchema.safeParse(r.project.plant ?? {}), checks = issueChecks(plant.success ? plant.data : {}, d?.made ?? null, r.project, true, { whole: false });
  const sets = await prisma.drawingSet.findMany({ where: { companyId: user.companyId, roomDesignId: r.id }, orderBy: [{ seq: 'desc' }, { revision: 'desc' }],
    select: { id: true, number: true, revision: true, createdAt: true, authorInitials: true, user: { select: { name: true } } } });
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app', label: tp('title') }, { href: `/app/projects/${r.projectId}`, label: r.project.name }, { label: t('viewTitle') }]} />
      <div className="page-head">
        <div className="titles"><h1>{t('viewTitle')}{r.label ? `\u00a0· ${r.label}` : ''}</h1><p className="lead">{lead}</p></div>
        <div className="actions">
          {download ? <a className="btn btn-primary" href={`/api/room-designs/${r.id}/relazione`}>{t('docTecnica')}</a> : null}
          {editable && replacement ? <Link className="btn" href={`/app/calculations/${r.calculationId}/locale?from=${r.id}`}>{t('newFrom')}</Link> : null}
        </div>
      </div>
      {before ? <Refreshed before={before} now={r} locale={locale} /> : null}
      {d ? null : (
        <div className="alert alert-warn flex flex-col items-start gap-2" role="status">
          <p className="m-0">{tf(replacement ? 'room' : 'archive')}</p>
          {can(user, 'records:refresh') && !r.project.archivedAt && replacement ? <RefreshForm kind="room" id={r.id} /> : null}
        </div>
      )}
      <dl className="cartiglio">
        <div><dt>{tc('col_result')}</dt><dd><VerdictPill verdict={r.verdict} fails={r.failCount} warns={r.warnCount} /></dd></div>
        <div><dt>{tc('col_date')}</dt><dd>{fd.dateTime(r.createdAt)}</dd></div>
        <div><dt>{tc('col_author')}</dt><dd>{r.user?.name ?? '—'}</dd></div>
        <div><dt>{tc('col_machine')}</dt><dd className="num"><Link href={`/app/calculations/${r.calculationId}`}>{r.calculation.summary}</Link></dd></div>
        <div className="wide"><dt>{tc('col_hash')}</dt><dd className="hash">{r.sha256}</dd></div>
      </dl>
      {download ? (
        <section className="panel" aria-labelledby="room-docs">
          <h2 id="room-docs">{t('docsTitle')}</h2>
          <p className="note">{t('docsLead')}</p>
          <div className="doc-links">
            <a className="btn" href={`/api/room-designs/${r.id}/relazione`}>{t('docTecnica')}</a>
            <a className="btn" href={`/api/room-designs/${r.id}/pdf`}>{t('docDraft')}</a>
            <a className="btn" href={`/api/room-designs/${r.id}/dxf`}>DXF</a>
            <a className="btn" href={`/api/room-designs/${r.id}/dwg`}>DWG</a>
            <a className="btn" href={`/api/calculations/${r.calculationId}/relazione?locale=${locale}`}>{tc('downloadReport')}</a>
          </div>
        </section>
      ) : null}
      {views.map(({ k, c }) => (
        <DrawingFigure key={k} className="sheet-view" w={c.w} h={c.h} label={ts(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')}
          caption={`${ts(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')} · ${ts('scale', { n: c.scale })}`}>
          <ShapesSvg shapes={c.shapes} w={c.w} h={c.h} id={`room-${k}`} label={ts(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')} />
        </DrawingFigure>
      ))}
      {d && rep.ok ? (
        <section className="panel" aria-labelledby="room-checks">
          <h2 id="room-checks">{t('checksTitle')}</h2>
          <div className="table-scroll">
            <table className="data-table stack">
              <thead><tr><th scope="col">{t('check')}</th><th scope="col" className="num">{t('value')}</th><th scope="col" className="num">{t('limit')}</th><th scope="col">{t('outcome')}</th></tr></thead>
              <tbody>
                {d.checks.map((c) => (
                  <tr key={c.id}>
                    <td className="row-title">{ts(roomCheckKey(c.id, d))}</td>
                    <td className="num" data-label={t('value')}>{c.value === null ? '—' : `${shownValue(c, fmt)} ${c.unit}`}</td>
                    <td className="num" data-label={t('limit')}>{c.limit === null ? '—' : `${isUpperLimit(c.id) ? '≤' : '≥'} ${fmt(c.limit, c.dec)} ${c.unit}`}</td>
                    <td data-label={t('outcome')}>{ambitoOf(rep.collaudo, c.id) === 'existing' ? <span className="status-pill">{t('existing')}</span> : <span className={`status-pill ${c.status}`}>{ts(`st_${c.status}`)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">{t('existingNote')}</p>
        </section>
      ) : null}
      {costed && rep.ok ? <ProjectCost cost={costed.cost} skipped={costed.skipped} uncounted={calcUncounted(rep.collaudo)} locale={locale} scope="calc" editable={can(user, 'prices:edit')} /> : null}
      <section className="panel" aria-labelledby="room-sets">
        <h2 id="room-sets">{tt('title')}</h2>
        <p className="note">{t('setsLead')}</p>
        {sets.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {sets.map((x) => <li key={x.id}><Link href={`/app/drawing-sets/${x.id}`} className="num">{x.number}{x.revision ? ` R${x.revision}` : ''}</Link> · <span className="note">{fd.dateTime(x.createdAt)} · {x.user?.name ?? x.authorInitials}</span></li>)}
          </ul>
        ) : null}
        {d && editable ? <IssueForm roomDesignId={r.id} initials={initialsOf(user.name)} checks={checks} projectId={r.projectId} /> : null}
      </section>
    </main>
  );
}
