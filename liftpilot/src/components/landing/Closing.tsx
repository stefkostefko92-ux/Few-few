// The closing call, after the template: the invitation to register on the left of a framed band, the lobby illustration
// fading in from the right (decorative). Server component.
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

const LOBBY = {
  avif: '/img/premium/elevator-lobby-800.avif 800w, /img/premium/elevator-lobby-1400.avif 1400w, /img/premium/elevator-lobby-1983.avif 1983w',
  webp: '/img/premium/elevator-lobby-800.webp 800w, /img/premium/elevator-lobby-1400.webp 1400w, /img/premium/elevator-lobby-1983.webp 1983w',
  // the band's right 57 % from 721 px (inside a 1312 px frame), its full width under it
  sizes: '(min-width: 1440px) 760px, (min-width: 721px) 57vw, 100vw',
} as const;

export default async function Closing() {
  const t = await getTranslations('landing');
  return (
    <section className="lp-section closing" aria-labelledby="inizia-h">
      <div className="lp-wrap">
        <div className="closing-cta">
          <picture className="closing-photo">
            <source type="image/avif" srcSet={LOBBY.avif} sizes={LOBBY.sizes} />
            <img src="/img/premium/elevator-lobby-1400.webp" srcSet={LOBBY.webp} sizes={LOBBY.sizes} width={1983} height={793} alt="" loading="lazy" decoding="async" />
          </picture>
          <div className="closing-content">
            <p className="eyebrow">{t('endEyebrow')}</p>
            <h2 id="inizia-h">{t('endTitle')}</h2>
            <p>{t('endText')}</p>
            <div className="hero-buttons">
              <Link className="btn btn-primary btn-lg" href="/register">{t('ctaRegister')} <span className="btn-arrow" aria-hidden="true">→</span></Link>
              <Link className="btn btn-lg" href="/login">{t('ctaLogin')}</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
