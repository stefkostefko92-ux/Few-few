// The landing's hero: a cyanotype sheet with the promise and the way in beside the live machine of example A in a
// drawing's viewport, three of its checks as the engine computes them on this request docked on the picture's edge, and
// the product's numbers along a dimension chain. Server component; the stage is the only client part.
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import MachineStage from '@/components/machine/MachineStage';
import { SCENARIOS } from '@/components/lift/scenarios';
import type { Example } from './example';

/** The checks the hero shows: the ropes' safety factor, the sheave's D/d, the brake with all its sets. */
const HERO_CHECKS = ['r_sfa', 'r_dd', 'b_all'] as const;

interface Props {
  example: Example;
  counts: { values: number; checks: number };
  /** no subscription on this server: the free beta (terms, article «subscription») */
  beta: boolean;
}

export default async function Hero({ example, counts, beta }: Props) {
  const t = await getTranslations('landing');
  const shown = HERO_CHECKS.map((id) => example.checks.find((c) => c.id === id)).filter((c) => c !== undefined);
  const facts = [
    { v: String(counts.checks), l: t('f1l') },
    { v: String(counts.values), l: t('f2l') },
    { v: '1:1', l: t('f3l') },
    { v: String(SCENARIOS.length), l: t('f4l') },
  ];
  return (
    <section className="lp-hero lp-sheetband" aria-labelledby="lp-title">
      <div className="lp-wrap lp-hero-grid">
        <h1 id="lp-title" className="lp-hero-title">{t('h1')}</h1>
        <div className="lp-hero-copy">
          <p id="answer" className="lp-hero-lead">{t('answer')}</p>
          <div className="lp-actions">
            <Link className="lp-btn lp-btn-call" href="/register">{t('ctaRegister')}</Link>
            <Link className="lp-btn lp-btn-line" href="/login">{t('ctaLogin')}</Link>
          </div>
          {beta ? <p className="lp-beta"><span className="lp-beta-tag">{t('betaTag')}</span><strong>{t('betaFree')}</strong></p> : null}
          <p className="lp-hero-note">{t('status')}</p>
        </div>
        <div className="lp-hero-visual">
          <MachineStage alt={t('machineAlt')} priority sizes="(min-width: 1320px) 740px, (min-width: 1024px) 56vw, 100vw" />
          <div className="lp-checks">
            <p className="lp-checks-title" id="lp-checks-title">{t('heroChecks', { engine: example.engine })}</p>
            <ul aria-labelledby="lp-checks-title">
              {shown.map((c) => (
                <li key={c.id} className={`lp-check is-${c.status}`}>
                  <span className="lp-check-mark" aria-hidden="true">{c.status === 'ok' ? '✓' : c.status === 'fail' ? '✕' : '!'}</span>
                  <span className="lp-check-name">{c.label}</span>
                  <span className="lp-check-value">{c.value} <span>{c.limit}</span></span>
                  <span className="sr-only">{c.statusText}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="lp-stage-caption">{t('machineCaption')}</p>
        </div>
      </div>
      <div className="lp-wrap">
        <dl className="lp-chain" aria-label={t('factsLabel')}>
          {facts.map((f) => (
            <div key={f.l}>
              <dt>{f.v}</dt>
              <dd>{f.l}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
