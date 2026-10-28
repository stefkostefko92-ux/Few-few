import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { SessionUser } from '@/lib/auth';
import { dateFormat } from '@/lib/dates';
import type { TipoIntervento } from '@/lib/lift/intervento';
import { remakerOf } from '@/lib/rbac';
import StaleNotice from '@/components/StaleNotice';
import { outdated } from '@/server/records';
import RecordTable, { type RecordRow } from './RecordTable';
import SectionTitle from './SectionTitle';
import TipoTag from './TipoTag';

// The sections of an installation's overview in the order of its work (round 45): «Calcolo argano» (its step-2
// calculations, their type), the Progetto (its saved versions and the machine rooms surveyed — round 53: the 3D is the
// Simulazione's page, the bill and the drawing sets «Tavole e documenti»), and the archive of the records made before the
// one form (shaft designs and their calculations without a lift design). Server components; the page reads the records.

type Calc = RecordRow & { tipo: TipoIntervento; reviews: number };

/** «Calcolo argano»: the step-2 calculations, newest first, with their type; the way to a new one. */
export async function CalcoloSection({ rows, locale, nuovo, vuoto }: { rows: Calc[]; locale: string; nuovo: string | null; vuoto: ReactNode }) {
  const [t, tc, ti] = await Promise.all([getTranslations('projects'), getTranslations('calculations'), getTranslations('calculations.intervento')]);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="sec-calcolo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id="sec-calcolo" icon="calculator">{t('sec_calcolo')}</SectionTitle>
        {nuovo && rows.length ? <Link className="btn" href={nuovo}>{tc('new')}</Link> : null}
      </div>
      {rows.length === 0 ? <div className="panel items-start">{vuoto}</div> : (
        <RecordTable rows={rows} kind="calc" href={(x) => `/app/calculations/${x}`} what={tc('col_machine')} locale={locale}
          extra={{ label: t('col_tipo'), cell: (r) => { const tp = rows.find((c) => c.id === r.id)?.tipo ?? null; return <TipoTag tipo={tp} label={ti(tp ?? 'daDefinire')} small />; } }}
          under={(r) => { const n = rows.find((c) => c.id === r.id)?.reviews ?? 0; return n ? <span className="note">{tc('reviewed', { n })}</span> : null; }} />
      )}
    </section>
  );
}

interface Latest { id: string; createdAt: Date; engineVersion: string; calculation: { engineVersion: string }; shaftDesign: { engineVersion: string } }

/** The Progetto: its saved versions (the latest first) and the machine rooms surveyed; nothing yet — what the Progetto of
 *  this intervention is and the way to it (or whose it is). */
export async function ProgettoSection({ user, latest, lifts, rooms, locale, live, vuoto }: {
  user: SessionUser; latest: Latest | null; lifts: RecordRow[]; rooms: RecordRow[]; locale: string; live: boolean; vuoto: ReactNode;
}) {
  const [t, tl, tm] = await Promise.all([getTranslations('projects'), getTranslations('lift'), getTranslations('room')]);
  const fd = dateFormat(locale);
  return (
    <section className="flex flex-col gap-3 lift-home" aria-labelledby="sec-progetto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle id="sec-progetto" icon="cube" eyebrow={latest ? fd.dateTime(latest.createdAt) : undefined}>{t('sec_progetto')}</SectionTitle>
        {latest ? <Link className="btn" href={`/app/lift-designs/${latest.id}`}>{tl('open')}</Link> : null}
      </div>
      {latest && outdated.lift(latest) ? <StaleNotice text="design" by={remakerOf(user, 'lift', live)} refresh={{ kind: 'lift', id: latest.id }} /> : null}
      {lifts.length ? <SectionTitle level={3} icon="history">{tl('history')}</SectionTitle> : null}
      {lifts.length ? <RecordTable rows={lifts} kind="lift" href={(x) => `/app/lift-designs/${x}`} what={tl('col_design')} locale={locale} /> : null}
      {rooms.length ? <SectionTitle level={3} icon="building-gear">{tm('projectTitle')}</SectionTitle> : null}
      {rooms.length ? <RecordTable rows={rooms} kind="room" href={(x) => `/app/room-designs/${x}`} what={tm('col_room')} locale={locale} /> : null}
      {!latest && rooms.length === 0 ? <div className="panel items-start">{vuoto}</div> : null}
    </section>
  );
}

/** The records made before the one form (shaft designs and the calculations made from them without a lift design). */
export async function ArchivioSection({ shafts, calcs, sources, locale }: { shafts: RecordRow[]; calcs: RecordRow[]; sources: ReadonlySet<string>; locale: string }) {
  const [t, ts, tc] = await Promise.all([getTranslations('projects'), getTranslations('shaft'), getTranslations('calculations')]);
  if (!shafts.length && !calcs.length) return null;
  return (
    <details className="panel archive">
      <summary>{t('archiveTitle')}</summary>
      <p className="note">{t('archiveLead')}</p>
      {shafts.length ? <h3>{ts('sectionTitle')}</h3> : null}
      {shafts.length ? (
        <RecordTable rows={shafts} kind="shaft" href={(x) => `/app/shaft-designs/${x}`} what={ts('col_design')} locale={locale}
          extra={{ label: ts('source'), cell: (r) => (sources.has(r.id) ? 'DXF/DWG' : ts('sourceHand')) }} />
      ) : null}
      {calcs.length ? <h3>{tc('title')}</h3> : null}
      {calcs.length ? <RecordTable rows={calcs} kind="calc" href={(x) => `/app/calculations/${x}`} what={tc('col_machine')} locale={locale} /> : null}
    </details>
  );
}
