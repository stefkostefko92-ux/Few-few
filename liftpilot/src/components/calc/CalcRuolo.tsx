import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { dateFormat } from '@/lib/dates';
import { TIPI_INTERVENTO, type TipoIntervento } from '@/lib/lift/intervento';

/** The record's role under its title (round 45): the type of intervention with the rising scale of «Calcolo argano»
 *  (how far into the lift the test reaches), then what the calculation is — the «Calcolo argano» of the installation,
 *  a lift design's own calculation (drawn on the «Calcolo argano» named, linked, or one of the one form before it), or a
 *  calculation of the archive made from a shaft design. */
export default async function CalcRuolo({ tipo, ruolo, base, locale }: {
  tipo: TipoIntervento;
  ruolo: 'calcolo' | 'progetto' | 'archivio';
  /** the «Calcolo argano» a lift design's calculation was drawn on; null: one of the one form */
  base?: { id: string; createdAt: Date } | null;
  locale: string;
}) {
  const [t, ti] = await Promise.all([getTranslations('calculations.ruolo'), getTranslations('calculations.intervento')]);
  const i = TIPI_INTERVENTO.indexOf(tipo);
  return (
    <p className="calc-ruolo">
      <span className="tipo-badge" data-tipo={tipo}>
        <span className="tipo-scala" aria-hidden="true">{[0, 1, 2].map((s) => <i key={s} className={s <= i ? 'piena' : undefined} />)}</span>
        {ti(tipo)}
      </span>
      <span className="ruolo">
        {ruolo === 'calcolo' ? t('calcolo') : ruolo === 'archivio' ? t('archivio') : base
          ? <>{t('progetto')} <Link href={`/app/calculations/${base.id}`}>{t('base', { date: dateFormat(locale).date(base.createdAt) })}</Link></>
          : t('moduloUnico')}
      </span>
    </p>
  );
}
