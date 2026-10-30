import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { dateFormat } from '@/lib/dates';
import type { RtBaseState } from '@/server/rt/base';

// What the relazione tecnica di modifica is made from (RT plan §7, the workspace's header): the latest «Calcolo argano»
// and its Progetto (the machine room surveyed or the lift design) with links, or — when it cannot be made now — why, in
// words, with the way to what is missing: the calculation, the Progetto on the latest calculation, «Aggiorna con il
// software attuale» on the record the running engines no longer reproduce; a «Trasformazione completa» has the new
// lift's documents. A server component.
export default async function BaseStato({ state, projectId, locale, archived }: { state: RtBaseState | null; projectId: string; locale: string; archived: boolean }) {
  const t = await getTranslations('rt'), fd = dateFormat(locale);
  if (archived || !state) return <p className="alert alert-info" role="status">{t('base.archiviato')}</p>;
  const { calc, progetto, disegno, result } = state;
  const calcLink = calc ? <Link href={`/app/calculations/${calc.id}`}>{t('base.calcolo', { data: fd.dateTime(calc.createdAt) })}</Link> : null;
  const progLink = progetto ? (
    <Link href={progetto.kind === 'room' ? `/app/room-designs/${progetto.id}` : `/app/lift-designs/${progetto.id}`}>
      {t(progetto.kind === 'room' ? 'base.rilievo' : 'base.progetto', { data: fd.dateTime(progetto.createdAt) })}
    </Link>
  ) : null;
  const disegna = calc ? (disegno === 'locale' ? `/app/calculations/${calc.id}/locale` : `/app/projects/${projectId}/progetto?calc=${calc.id}`) : `/app/projects/${projectId}/calc`;
  if (result.ok) {
    return (
      <p className="calc-ruolo rt-base" data-rt-base={result.base.path}>
        {t(result.base.path === 'locale' ? 'base.percorsoLocale' : 'base.percorsoVano')}: {progLink} · {calcLink}
      </p>
    );
  }
  const why = result.reason;
  return (
    <div className={`alert ${why === 'trasformazione' || why === 'en81' ? 'alert-info' : 'alert-warn'} flex flex-col items-start gap-2`} role="status" data-rt-motivo={why}>
      <p className="m-0">{t(`base.motivo.${why}`)}</p>
      {why === 'noCalc' ? <Link className="btn btn-sm" href={`/app/projects/${projectId}/calc`}>{t('base.vaiCalcolo')}</Link> : null}
      {why === 'noProgetto' || why === 'progettoVecchio' ? <Link className="btn btn-sm" href={disegna}>{t(disegno === 'locale' ? 'base.vaiRilievo' : 'base.vaiProgetto')}</Link> : null}
      {why === 'engineChanged' ? <p className="m-0">{progLink ?? calcLink}</p> : null}
    </div>
  );
}
