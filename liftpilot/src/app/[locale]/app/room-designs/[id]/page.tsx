import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import SectionTitle from '@/components/project/SectionTitle';
import { requireCapability } from '@/lib/auth';
import { can, remakerOf } from '@/lib/rbac';
import { dateFormat } from '@/lib/dates';
import { INTL_LOCALE, isLocale } from '@/i18n/locales';
import { ambitoOf } from '@/lib/lift/collaudo';
import { makeFmt } from '@/lib/present/tr';
import { roomCheckKey } from '@/lib/room/derive';
import { cropped, surveyView } from '@/lib/tavole/views';
import { isUpperLimit, shownValue } from '@/shaft/checks';
import { reproduceRoomRecord } from '@/server/room-compose';
import { roomSummaryLine } from '@/server/room-summary';
import { getRoomDesign, refreshedFrom } from '@/server/queries';
import { rilevaLocale } from '@/server/calcolo-base';
import Crumbs from '@/components/Crumbs';
import ImpiantoNav from '@/components/impianto/ImpiantoNav';
import DrawingFigure from '@/components/drawing/DrawingFigure';
import ShapesSvg from '@/components/drawing/ShapesSvg';
import VerdictPill from '@/components/VerdictPill';
import StaleNotice from '@/components/StaleNotice';
import Refreshed from '@/components/Refreshed';

export async function generateMetadata() {
  const t = await getTranslations('room');
  return { title: t('viewTitle') };
}

const AREA = { x0: 0, y0: 0, x1: 190, y1: 190 };

// A saved machine room of a replacement: its result, its plan and section, the checks (those of the parts that stay
// marked "esistente"); its documents, its cost and the drawing sets issued from it are «Tavole e documenti» (round 53),
// its relazione tecnica the installation's relazione tecnica di modifica (round 49), both reached from here. Drawn again
// from the stored survey and calculation only when the running engines reproduce them; else «Aggiorna con il software
// attuale» saves it again.
export default async function RoomDesignPage({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ da?: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireCapability(locale, 'calc:view');
  const r = await getRoomDesign(user, id);
  if (!r) notFound();
  const [t, tp, tc, ts, trt, td, before] = await Promise.all([getTranslations('room'), getTranslations('projects'), getTranslations('calculations'),
    getTranslations('shaft'), getTranslations('rt'), getTranslations('documenti'), refreshedFrom(user, 'roomDesign', (await searchParams).da, r.projectId)]);
  const rep = reproduceRoomRecord(r, r.calculation), d = rep.ok ? rep.derived : null;
  const fd = dateFormat(locale), fmt = makeFmt(INTL_LOCALE[isLocale(locale) ? locale : 'it']), lead = (await roomSummaryLine())(r);
  // a machine room is surveyed on a «Calcolo argano» of an existing lift (round 45: whatever the installation was called);
  // one whose calculation is not such a one is read only
  const live = !r.project.archivedAt, editable = can(user, 'progetto:edit') && live;
  const replacement = rilevaLocale(r.calculation);
  const views = d ? (['plan', 'section'] as const).map((k) => {
    try {
      const v = surveyView(d, k, AREA);
      return v ? { k, c: cropped(v) } : null;
    } catch {
      return null;
    }
  }).filter((x) => x !== null) : [];
  return (
    <main className="page">
      <Crumbs items={[{ href: '/app/impianti', label: tp('title') }, { href: `/app/projects/${r.projectId}`, label: r.project.name }, { label: t('viewTitle') }]} />
      <ImpiantoNav user={user} projectId={r.projectId} corrente="progetto" />
      <div className="page-head">
        <div className="titles"><h1>{t('viewTitle')}{r.label ? `\u00a0· ${r.label}` : ''}</h1><p className="lead">{lead}</p></div>
        <div className="actions">
          <Link className="btn btn-primary" href={`/app/projects/${r.projectId}/documenti?design=${r.id}`}>{td('titolo')}</Link>
          <Link className="btn" href={`/app/projects/${r.projectId}/relazione-tecnica`}>{trt('apri')}</Link>
          {editable && replacement ? <Link className="btn" href={`/app/calculations/${r.calculationId}/locale?from=${r.id}`}>{t('newFrom')}</Link> : null}
        </div>
      </div>
      {before ? <Refreshed before={before} now={r} kind="room" locale={locale} /> : null}
      {/* a new machine room, a replacement's: whoever draws the project (rbac.ts remakerOf); the others read who does */}
      {d ? null : <StaleNotice text={replacement ? 'room' : 'archive'} by={remakerOf(user, 'room', live && replacement)} refresh={{ kind: 'room', id: r.id }} />}
      <dl className="cartiglio">
        <div><dt>{tc('col_result')}</dt><dd><VerdictPill verdict={r.verdict} fails={r.failCount} warns={r.warnCount} record={{ kind: 'room', id: r.id }} /></dd></div>
        <div><dt>{tc('col_date')}</dt><dd>{fd.dateTime(r.createdAt)}</dd></div>
        <div><dt>{tc('col_author')}</dt><dd>{r.user?.name ?? '—'}</dd></div>
        <div><dt>{tc('col_machine')}</dt><dd className="num"><Link href={`/app/calculations/${r.calculationId}`}>{r.calculation.summary}</Link></dd></div>
        <div className="wide"><dt>{tc('col_hash')}</dt><dd className="hash">{r.sha256}</dd></div>
      </dl>
      {views.map(({ k, c }) => (
        <DrawingFigure key={k} className="sheet-view" w={c.w} h={c.h} label={ts(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')}
          caption={`${ts(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')} · ${ts('scale', { n: c.scale })}`}>
          <ShapesSvg shapes={c.shapes} w={c.w} h={c.h} id={`room-${k}`} label={ts(k === 'plan' ? 'ed_v_room_plan' : 'ed_v_room_section')} />
        </DrawingFigure>
      ))}
      {d && rep.ok ? (
        <section className="panel" aria-labelledby="room-checks">
          <SectionTitle id="room-checks" icon="list-checks">{t('checksTitle')}</SectionTitle>
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
    </main>
  );
}
