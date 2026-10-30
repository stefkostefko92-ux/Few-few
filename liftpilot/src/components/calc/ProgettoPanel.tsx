import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import SectionTitle from '@/components/project/SectionTitle';
import { testoAiuto } from '@/lib/aiuto';
import { dateFormat } from '@/lib/dates';
import type { Disegno } from '@/lib/lift/intervento';
import AIUTO from '../../../messages/aiuto/calcolo.json';
import { ConAiuto } from '../shaft/Campo';

interface Rec {
  id: string;
  label: string | null;
  createdAt: Date;
  summary: string;
}

/** The Progetto of a «Calcolo argano» (round 45), by what its intervention draws (intervento.ts disegnoDi): the survey
 *  of the machine room, with the whole drawing as the alternative; or the drawing of the shaft and the car, with the
 *  machine room's survey offered on an existing lift (it does not verify the parts in the shaft). The machine rooms
 *  surveyed and the lift designs drawn on this calculation are listed; the buttons are for whoever draws the project,
 *  on a live installation and a calculation the running engine reproduces; a role without that right reads whose the
 *  step is (`handoff`, as on the installation's page). Round 52: the leads say what the Progetto is, the «?» beside the
 *  title how it uses the calculation. */
export default async function ProgettoPanel({ calcId, projectId, disegno, repl, below, rooms, progetti, draws, handoff = false, locale }: {
  calcId: string;
  projectId: string;
  disegno: Disegno;
  /** an existing lift's context: its machine room can be surveyed */
  repl: boolean;
  /** the machine below: no machine room over the shaft */
  below: boolean;
  rooms: readonly Rec[];
  progetti: readonly Rec[];
  draws: boolean;
  /** the role does not hold the right to draw the project (read-only mode or not) */
  handoff?: boolean;
  locale: string;
}) {
  const [t, tm, tp] = await Promise.all([getTranslations('calculations.progetto'), getTranslations('room'), getTranslations('projects')]);
  const fd = dateFormat(locale), survey = repl && !below;
  const rileva = <Link className={`btn${disegno === 'locale' ? ' btn-primary' : ''}`} href={`/app/calculations/${calcId}/locale`}>{rooms.length ? tm('again') : tm('start')}</Link>;
  const disegna = (primary: boolean) => (
    <Link className={`btn${primary ? ' btn-primary' : ''}`} href={`/app/projects/${projectId}/progetto?calc=${calcId}`}>{t(disegno === 'locale' ? 'disegnaIntero' : 'disegna')}</Link>
  );
  const list = (title: string, href: (id: string) => string, xs: readonly Rec[]) => (xs.length ? (
    <>
      <h3 className="sub">{title}</h3>
      <ul className="rec-list">
        {xs.map((x) => <li key={x.id}><Link href={href(x.id)}>{fd.dateTime(x.createdAt)}{x.label ? ` · ${x.label}` : ''}</Link><span className="note">{x.summary}</span></li>)}
      </ul>
    </>
  ) : null);
  return (
    <section className="panel" aria-labelledby="calc-progetto">
      <ConAiuto aiuto={testoAiuto(AIUTO, 'progetto')} nome={t('title')} block>
        <SectionTitle id="calc-progetto" icon="building-gear">{t('title')}</SectionTitle>
      </ConAiuto>
      <p className="note">{disegno === 'locale' ? t('leadLocale') : below && repl ? tm('calcBelow') : t('leadVano')}</p>
      {list(t('locali'), (id) => `/app/room-designs/${id}`, rooms)}
      {list(t('progetti'), (id) => `/app/lift-designs/${id}`, progetti)}
      {progetti.length ? <p className="note">{t('preliminare')}</p> : null}
      {draws ? (
        <div className="btnrow">
          {disegno === 'locale' ? <>{rileva}{disegna(false)}</> : <>{disegna(true)}{survey ? rileva : null}</>}
        </div>
      ) : null}
      {draws && disegno === 'vano' && survey ? <p className="note">{t('notaVano')}</p> : null}
      {handoff ? <p className="note">{tp('handoff_progetto')}</p> : null}
    </section>
  );
}
