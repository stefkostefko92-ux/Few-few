// The landing's hero, after the Premium template: the promise in three lines (the last in cyan), the answer, the two
// ways on (register, see the product), the beta and the honesty note, four tiles with the software's own numbers; beside
// it the cutaway illustration on the blueprint grid with four labels naming what the software does, and a mono line
// along the bottom edge (the standards profile, the five steps, the engine). The illustration is the page's LCP: it is
// preloaded (page.tsx) and never lazy. Server component.
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon, { type IconName } from '@/components/Icon';

/** The hero's illustration (public/img/premium, scripts/premium-images.py): 3:4, three widths in AVIF and WebP. */
export const HERO_IMG = {
  avif: '/img/premium/elevator-cutaway-480.avif 480w, /img/premium/elevator-cutaway-800.avif 800w, /img/premium/elevator-cutaway-1086.avif 1086w',
  webp: '/img/premium/elevator-cutaway-480.webp 480w, /img/premium/elevator-cutaway-800.webp 800w, /img/premium/elevator-cutaway-1086.webp 1086w',
  src: '/img/premium/elevator-cutaway-800.webp',
  // the picture fills the hero's right half from 1024 px, its full width (less the gutters) below
  sizes: '(min-width: 1024px) 50vw, 100vw',
  width: 1086,
  height: 1448,
} as const;

const LABELS: ReadonlyArray<readonly [IconName, string]> = [['cube', 'heroLabel1'], ['calculator-check', 'heroLabel2'], ['file-dwg', 'heroLabel3'], ['file-pdf', 'heroLabel4']];

interface Props {
  counts: { values: number; checks: number };
  scenarios: number;
  /** no subscription on this server: the free beta (terms, article «subscription») */
  beta: boolean;
  profile: string;
  engine: string;
}

export default async function Hero({ counts, scenarios, beta, profile, engine }: Props) {
  const t = await getTranslations('landing');
  const tiles: ReadonlyArray<readonly [IconName, string, string]> = [
    ['shield-check', String(counts.checks), t('b1')],
    ['database', String(counts.values), t('b2')],
    ['blueprint', '1:1', t('b3')],
    ['rotate-3d', String(scenarios), t('b4')],
  ];
  const steps = [1, 2, 3, 4, 5].map((n) => t(`step${n}Title`));
  return (
    <section className="hero" aria-labelledby="lp-title">
      <div className="hero-blueprint" aria-hidden="true" />
      <div className="hero-vignette" aria-hidden="true" />
      <div className="hero-copy">
        <p className="eyebrow">{t('heroEyebrow')}</p>
        <h1 id="lp-title">
          <span>{t('h1a')}</span> <span>{t('h1b')}</span> <em>{t('h1c')}</em>
        </h1>
        <p id="answer" className="hero-lead">{t('answer')}</p>
        <div className="hero-buttons">
          <Link className="btn btn-primary btn-lg" href="/register">
            {t('ctaRegister')} <span className="btn-arrow" aria-hidden="true">→</span>
          </Link>
          <a className="btn btn-lg" href="#prodotto">{t('ctaProduct')}</a>
        </div>
        {beta ? <p className="hero-beta"><span className="badge accent">{t('betaTag')}</span> {t('betaFree')}</p> : null}
        <p className="hero-note">{t('status')}</p>
        <ul className="hero-benefits" aria-label={t('factsLabel')}>
          {tiles.map(([icon, v, l]) => (
            <li key={icon}>
              <span className="icon-tile"><Icon name={icon} size={20} /></span>
              <span><strong>{v}</strong> {l}</span>
            </li>
          ))}
        </ul>
      </div>
      <figure className="hero-art">
        <div className="art-grid" aria-hidden="true" />
        <picture>
          <source type="image/avif" srcSet={HERO_IMG.avif} sizes={HERO_IMG.sizes} />
          <img className="hero-render" src={HERO_IMG.src} srcSet={HERO_IMG.webp} sizes={HERO_IMG.sizes} width={HERO_IMG.width} height={HERO_IMG.height}
            alt={t('heroImgAlt')} fetchPriority="high" decoding="async" />
        </picture>
        <ul className="art-labels" aria-hidden="true">
          {LABELS.map(([icon, key], k) => (
            <li key={key} className={`art-label art-label-${k + 1}`}>
              <span className="icon-tile sm"><Icon name={icon} size={18} /></span>
              {t(key)}
            </li>
          ))}
        </ul>
        <figcaption className="art-caption">{t('heroArtLabel')}</figcaption>
      </figure>
      <p className="hero-bottom-line" aria-hidden="true">
        <span>{t('heroProfile', { profile })}</span>
        <span className="hero-steps">{steps.join(' · ')}</span>
        <span>{t('heroEngine', { engine })}</span>
      </p>
    </section>
  );
}
