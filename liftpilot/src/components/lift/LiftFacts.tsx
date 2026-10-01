// What the software worked out from the one form, in one strip: the car and its load, the car mass (with its origin),
// the counterweight, travel and speed, the machine; and the verdict of every check together.
import { useTranslations } from 'next-intl';
import type { LiftDerived } from '@/lib/lift';
import type { Texts } from '@/lib/present/texts';
import { verdictOf } from '@/shaft';

interface Props {
  derived: LiftDerived;
  X: Texts;
  fmt(x: number, dec?: number): string;
}

export default function LiftFacts({ derived, X, fmt }: Props) {
  const t = useTranslations('lift');
  const L = derived.layout, res = derived.analysis.res, { I, N } = derived.analysis.ctx, o = derived.origin;
  const fails = res.fails.length + L.checks.filter((c) => c.status === 'fail').length;
  const warns = res.checks.filter((c) => c.status === 'warn').length + L.checks.filter((c) => c.status === 'warn').length;
  const verdict = fails ? 'fail' : warns || verdictOf(L) === 'warn' ? 'warn' : 'ok';
  const badge = (k: keyof typeof o) => (o[k] === 'estimate' ? <span className="badge est">{t('badge_estimate')}</span> : o[k] === 'auto' ? <span className="badge">{t('badge_auto')}</span> : null);
  return (
    <section className="lift-facts" aria-label={t('facts')}>
      <div className={`lift-verdict ${verdict}`}>
        <span className={`status-pill ${verdict}`}>{t(`verdict_${verdict}`)}</span>
        <span>{fails ? t('facts_fail', { n: fails }) : warns ? t('facts_warn', { n: warns }) : t('facts_ok')}</span>
      </div>
      <dl className="facts">
        <div><dt>{t('d_car')}</dt><dd className="num">{fmt(L.A, 0)} × {fmt(L.B, 0)} mm</dd></div>
        <div><dt>{t('d_Q')}</dt><dd className="num">{fmt(I.Q, 0)} kg · {L.persons} {t('persons')} {badge('Q')}</dd></div>
        <div><dt>{t('d_P')}</dt><dd className="num">{fmt(I.P, 0)} kg {badge('P')}</dd></div>
        <div><dt>{t('d_cw')}</dt><dd className="num">{fmt(res.Mcw, 0)} kg</dd></div>
        <div><dt>{t('d_travel')}</dt><dd className="num">{fmt(I.H, 2)} m · {fmt(I.v, 2)} m/s</dd></div>
        <div className="wide"><dt>{t('d_machine')}</dt><dd className="num">{X.grooveShort(N.groove)} · D {fmt(N.D, 0)} · {N.n} × Ø{X.dText(N.d)} · 1:{fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · {fmt(N.Pn, 1)} kW · {N.brakeSets} × {fmt(N.brakeNm, 0)} N·m {badge('machine')}</dd></div>
      </dl>
    </section>
  );
}
