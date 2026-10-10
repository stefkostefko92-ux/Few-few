// What the software worked out from the one form, in one strip: the car and its load, the car mass (with its origin),
// the counterweight, travel and speed, the machine; and the verdict of the acceptance test: every check that the
// intervention touches under any of its standards (all of them for a new lift), with how many concern parts that stay
// as they are, and a badge with each standard's own result (and one for a renovation keeping the existing sling).
import { useTranslations } from 'next-intl';
import Icon, { type IconName } from '@/components/Icon';
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
  // the template's KPI tile: the name with its icon tile in the corner, the figure under it
  const term = (label: string, icon: IconName) => <dt><span>{label}</span><span className="icon-tile sm"><Icon name={icon} size={18} /></span></dt>;
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
        <div>{term(t('d_car'), 'elevator')}<dd className="num">{fmt(L.A, 0)} × {fmt(L.B, 0)} mm</dd></div>
        <div>{term(t('d_Q'), 'users')}<dd className="num">{fmt(I.Q, 0)} kg · {L.persons} {t('persons')} {badge('Q')}</dd></div>
        <div>{term(t('d_P'), 'weight')}<dd className="num big">{fmt(I.P, 0)} kg {badge('P')}</dd></div>
        <div>{term(t('d_cw'), 'weight-scale')}<dd className="num big">{fmt(res.Mcw, 0)} kg</dd></div>
        <div>{term(t('d_travel'), 'route')}<dd className="num">{fmt(I.H, 2)} m · {fmt(I.v, 2)} m/s</dd></div>
        <div className="wide">{term(t('d_machine'), 'motor')}<dd className="num">{made ? `${made.brand} ${made.model} · ` : ''}{X.grooveShort(N.groove)} · D {fmt(N.D, 0)} · {N.n} × Ø{X.dText(N.d)} · 1:{fmt(N.i, Number.isInteger(N.i) ? 0 : 1)} · {fmt(N.Pn, 1)} kW · {N.brakeSets} × {fmt(N.brakeNm, 0)} N·m {badge('machine')}</dd></div>
      </dl>
    </section>
  );
}
