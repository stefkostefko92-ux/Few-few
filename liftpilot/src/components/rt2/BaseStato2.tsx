import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { dateFormat } from '@/lib/dates';
import type { Rt2BaseState } from '@/server/rt2/base';

// What the RT after the owner's model is made from (round 52): the latest «Calcolo argano», or why it cannot be made now
// — no calculation, a «Trasformazione completa» or a test to UNI EN 81-20/50 (the new lift's documents apply), a
// calculation the running engine no longer reproduces («Aggiorna con il software attuale» on its page). A server component.
export default async function BaseStato2({ state, projectId, locale, archived }: { state: Rt2BaseState; projectId: string; locale: string; archived: boolean }) {
  const t = await getTranslations('rt'), fd = dateFormat(locale);
  if (archived) return <p className="alert alert-info" role="status">{t('base.archiviato')}</p>;
  const calcLink = state.calc ? <Link href={`/app/calculations/${state.calc.id}`}>{t('base.calcolo', { data: fd.dateTime(state.calc.createdAt) })}</Link> : null;
  if (state.result.ok) return <p className="calc-ruolo rt-base" data-rt-base="calcolo">Fatta sul {calcLink}</p>;
  const why = state.result.reason;
  return (
    <div className={`alert ${why === 'trasformazione' || why === 'en81' ? 'alert-info' : 'alert-warn'} flex flex-col items-start gap-2`} role="status" data-rt-motivo={why}>
      <p className="m-0">{t(`base.motivo.${why}`)}</p>
      {why === 'noCalc' ? <Link className="btn btn-sm" href={`/app/projects/${projectId}/calc`}>{t('base.vaiCalcolo')}</Link> : null}
      {why === 'engineChanged' ? <p className="m-0">{calcLink}</p> : null}
    </div>
  );
}
