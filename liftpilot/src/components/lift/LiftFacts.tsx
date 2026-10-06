// What the software worked out from the one form, in one strip: the car and its load, the car mass (with its origin),
// the counterweight, travel and speed, the machine; and the verdict of the acceptance test: every check that the
// intervention touches under any of its standards (all of them for a new lift), with how many concern parts that stay
// as they are, and a badge with each standard's own result (and one for a renovation keeping the existing sling).
import { useTranslations } from 'next-intl';
import { NORMA_BREVE, NORMA_SIGLA, ambitoOf, collaudoVerdict, esitiNorme, type LiftDerived } from '@/lib/lift';
import type { Texts } from '@/lib/present/texts';
import { mergeChecks } from '@/shaft';

interface Props {
  derived: LiftDerived;
  X: Texts;
  fmt(x: number, dec?: number): string;
}

export default function LiftFacts({ derived, X, fmt }: Props) {
  const t = useTranslations('lift');
  const L = derived.layout, res = derived.analysis.res, { I, N } = derived.analysis.ctx, o = derived.origin;
  const all = [...res.checks, ...mergeChecks(L.checks, derived.supportChecks)], C = derived.collaudo;
  const { verdict, fails, warns } = collaudoVerdict(C, all), outside = all.filter((c) => ambitoOf(C, c.id) === 'existing');
  const existing = outside.length, existingFails = outside.filter((c) => c.status === 'fail').length, made = derived.catalog?.fit?.machine;
  const badge = (k: keyof typeof o) => (o[k] === 'estimate' ? <span className="badge est">{t('badge_estimate')}</span> : o[k] === 'auto' ? <span className="badge">{t('badge_auto')}</span> : null);
  return (
    <section className="lift-facts" aria-label={t('facts')}>
      <div className={`lift-verdict ${verdict}`}>
        <span className={`status-pill ${verdict}`}>{t(`verdict_${verdict}`)}</span>
        <span>{fails ? t('facts_fail', { n: fails }) : warns ? t('facts_warn', { n: warns }) : t('facts_ok')}{existing ? ` ${t('facts_existing', { n: existing })}` : ''}{existingFails ? ` ${t('facts_existing_fail', { n: existingFails })}` : ''}</span>
        <span className="norms">
          {esitiNorme(C, all).map((e) => (
            <span key={e.norma} className={`badge ${e.ids.length ? e.verdict : ''}`} title={`${NORMA_SIGLA[e.norma]}: ${t('norma_checks', { n: e.ids.length })}`}>{NORMA_BREVE[e.norma]}</span>
          ))}
          {C.rifacimento ? <span className="badge" title={t('context_rifacimento')}>{t('facts_rif')}</span> : null}
        </span>
      </div>
      <dl className="facts">
        <div><dt>{t('d_car')}</dt><dd className="num">{fmt(L.A, 0)} × {fmt(L.B, 0)} mm</dd></div>
        <div><dt>{t('d_Q')}</dt><dd className="num">{fmt(I.Q, 0)} kg · {L.persons} {t('persons')} {badge('Q')}</dd></div>
        <div><dt>{t('d_P')}</dt><dd className="num">{fmt(I.P, 0)} kg {badge('P')}</dd></div>
        <div><dt>{t('d_cw')}</dt><dd className="num">{fmt(res.Mcw, 0)} kg</dd></div>
        <div><dt>{t('d_travel')}</dt><dd className="num">{fmt(I.H, 2)} m · {fmt(I.v, 2)} m/s</dd></div>
        <div className="wide"><dt>{t('d_machine')}</dt><dd className="num">{made ? `${made.brand} ${made.model} · ` : ''}{X.grooveShort(N.groove)} · D {fmt(N.D, 0)} · {N.n} × Ø{X.dText(N.d)} · 1:{fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · {fmt(N.Pn, 1)} kW · {N.brakeSets} × {fmt(N.brakeNm, 0)} N·m {badge('machine')}</dd></div>
      </dl>
    </section>
  );
}
