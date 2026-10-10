// The landing's hero, after the Premium template: the promise in three lines (the last in cyan), the answer, the two
// ways on (register, see the product); under them the four tiles with the software's own numbers, the beta and the
// honesty note; beside them the cutaway illustration on the blueprint grid with four labels naming what the software
// does, and a mono line along the bottom edge (the standards profile, the five steps, the engine). On a phone the
// illustration comes right after the two ways on (the first screen, as in the template) and the tiles, in one row, under
// it. The illustration is the page's LCP: it is preloaded (page.tsx) and never lazy. Server component.
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Icon, { type IconName } from '@/components/Icon';

const cutaway = (ext: string, widths: readonly number[], d: (w: number) => string): string =>
  widths.map((w) => `/img/premium/elevator-cutaway-${w}.${ext} ${d(w)}`).join(', ');
/** The hero's illustration (public/img/premium, scripts/premium-images.py): 3:4, four widths in AVIF and WebP. From
 *  721 px it fills the hero's right half (a little less under 980 px). On a phone it stands in a box 480 px high
 *  (home.css), never wider than 360 px, and comes into the first screen, where it is the LCP: its files go by the
 *  screen's density and stop at 640 px (49 KB; a 3x phone does not load 112 KB for a picture 360 px wide). The page preloads the same set
 *  for each (page.tsx), so the browser never fetches two files. */
export const HERO_IMG = {
  avif: cutaway('avif', [480, 640, 800, 1086], (w) => `${w}w`),
  webp: cutaway('webp', [480, 640, 800, 1086], (w) => `${w}w`),
  phoneAvif: cutaway('avif', [480, 640], (w) => `${(w / 360).toFixed(2)}x`),
  phoneWebp: cutaway('webp', [480, 640], (w) => `${(w / 360).toFixed(2)}x`),
  phone: '(max-width: 720px)',
  wide: '(min-width: 721px)',
  src: '/img/premium/elevator-cutaway-800.webp',
  sizes: '50vw',
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
      </div>
      <figure className="hero-art">
        <div className="art-grid" aria-hidden="true" />
        <picture>
          <source media={HERO_IMG.phone} type="image/avif" srcSet={HERO_IMG.phoneAvif} />
          <source media={HERO_IMG.phone} type="image/webp" srcSet={HERO_IMG.phoneWebp} />
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
      <div className="hero-facts">
        {beta ? <p className="hero-beta"><span className="badge accent">{t('betaTag')}</span> {t('betaFree')}</p> : null}
        <p className="hero-note">{t('status')}</p>
        <ul className="hero-benefits" aria-label={t('factsLabel')}>
          {tiles.map(([icon, v, l]) => (
            <li key={icon}>
              <span className="icon-tile"><Icon name={icon} size={20} priority /></span>
              <span><strong>{v}</strong> {l}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="hero-bottom-line" aria-hidden="true">
        <span>{t('heroProfile', { profile })}</span>
        <span className="hero-steps">{steps.join(' · ')}</span>
        <span>{t('heroEngine', { engine })}</span>
      </p>
    </section>
  );
}
