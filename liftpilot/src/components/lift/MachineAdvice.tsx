'use client';

// The machine to order among SICOR's and Montanari's (src/lib/lift/advice.ts): each maker's proposal side by side, the
// one the software would order first with the reason, and a button that takes it — the maker and model in the one
// form, the values in the replacement's calculator. The order itself is drawn from the saved design or calculation.
import { useTranslations } from 'next-intl';
import type { MachineAdvice as Advice, MachineCandidate } from '@/lib/lift/advice';

interface Props {
  advice: Advice;
  fmt(x: number, dec?: number): string;
  /** the candidate the form or the calculator holds now */
  inUse(c: MachineCandidate): boolean;
  onUse(c: MachineCandidate): void;
  /** where the order is downloaded from once saved */
  saved: 'design' | 'calc';
}

const name = (c: MachineCandidate): string => `${c.brand} ${c.model}`;

export default function MachineAdvice({ advice, fmt, inUse, onUse, saved }: Props) {
  const t = useTranslations('advice');
  const { candidates: [a, b], why } = advice;
  const pct = (x: number): string => `${x >= 0 ? '+' : '−'}${fmt(Math.abs(x) * 100, 1)}`;
  const reason = (): string => {
    if (!a) return '';
    if (!b || why === 'only') return t('why_only', { a: name(a) });
    switch (why) {
      case 'checks': return t('why_checks', { a: name(a), b: name(b) });
      case 'warns': return t('why_warns', { a: name(a), b: name(b), na: a.warns, nb: b.warns });
      case 'bedplate': return t('why_bedplate', { a: name(a), b: name(b), code: a.bedplate?.code ?? '' });
      case 'smaller': return t('why_smaller', { a: name(a), b: name(b), sa: fmt(a.staticKg, 0), sb: fmt(b.staticKg, 0), test: fmt(a.testKg, 0) });
      case 'speed': return t('why_speed', { a: name(a), b: name(b), dva: pct(a.dv), dvb: pct(b.dv) });
      case 'lighter': return t('why_lighter', { a: name(a), b: name(b), ma: fmt(a.mass ?? 0, 0), mb: b.mass === null ? '—' : fmt(b.mass, 0) });
      default: return t('why_tie', { a: name(a) });
    }
  };
  return (
    <section className="panel advice" aria-labelledby="advice-title">
      <div className="advice-head">
        <h2 id="advice-title">{t('title')}</h2>
        <p className="note">{t('lead')}</p>
      </div>
      {advice.candidates.length ? (
        <div className="advice-grid">
          {advice.candidates.map((c, k) => {
            const used = inUse(c), status = c.fails ? 'fail' : c.warns ? 'warn' : 'ok';
            return (
              <article key={c.brand} className={`advice-card${k === 0 ? ' best' : ''}`} aria-label={name(c)}>
                <header>
                  <h3>{name(c)}</h3>
                  {k === 0 ? <span className="badge ok">{t('best')}</span> : null}
                  {used ? <span className="badge">{t('in_use')}</span> : null}
                </header>
                <dl>
                  <div><dt>{t('f_ratio')}</dt><dd className="num">{c.ratio} · v {pct(c.dv)} %</dd></div>
                  <div><dt>{t('f_sheave')}</dt><dd className="num">Ø {fmt(c.N.D, 0)} · {c.N.n} × Ø{fmt(c.N.d, Number.isInteger(c.N.d) ? 0 : 1)}</dd></div>
                  <div><dt>{t('f_motor')}</dt><dd className="num">{fmt(c.N.Pn, 1)} kW{c.kWmax !== null ? ` · ${t('max', { kw: fmt(c.kWmax, 1) })}` : ''}</dd></div>
                  <div><dt>{t('f_static')}</dt><dd className="num">{fmt(c.staticKg, 0)} kg · {t('test', { kg: fmt(c.testKg, 0) })}</dd></div>
                  <div><dt>{t('f_mass')}</dt><dd className="num">{c.mass === null ? '—' : `${fmt(c.mass, 0)} kg`}</dd></div>
                  {c.I.layout === 'topDefl' ? (
                    <div><dt>{t('f_bedplate')}</dt><dd>{c.bedplate ? t('bed_maker', { code: c.bedplate.code, kg: fmt(c.bedplate.mass, 0) }) : t('bed_ours')}</dd></div>
                  ) : null}
                  <div><dt>{t('f_result')}</dt><dd className={`res ${status}`}>{c.fails ? t('res_fail', { n: c.fails }) : c.warns ? t('res_warn', { n: c.warns }) : t('res_ok')}</dd></div>
                  {c.others.length ? <div className="wide"><dt>{t('f_others')}</dt><dd>{c.others.join(' · ')}</dd></div> : null}
                </dl>
                <button type="button" className={k === 0 ? 'btn btn-primary primary' : 'btn'} onClick={() => onUse(c)} disabled={used}>{used ? t('using') : t('use')}</button>
              </article>
            );
          })}
        </div>
      ) : <p className="note">{t('none_all')}</p>}
      {a ? <p className="advice-why">{reason()}</p> : null}
      {advice.candidates.length ? advice.none.map((brand) => <p key={brand} className="note">{t('none_brand', { brand })}</p>) : null}
      <p className="note">{t(saved === 'design' ? 'note_design' : 'note_calc')}</p>
    </section>
  );
}
