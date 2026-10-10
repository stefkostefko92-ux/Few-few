import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LOGO, LOGO_COMPACT } from '@/lib/brand';
import LangSwitch from './LangSwitch';
import MobileNav from './MobileNav';

/** The landing's sections the header leads to, in the page's order: the id of each and the key of its name. */
const NAV = [['funzionalita', 'navFeatures'], ['prodotto', 'navProduct'], ['prezzi', 'navPricing'], ['norme', 'navNorms'], ['faq', 'navFaq']] as const;

// Header of the public pages, after the Premium template's landing: the full logo, the landing's sections, the language,
// the way in (sign in, sign up). Sticky; under 1080 px the sections and the way in move into a drawer (MobileNav), under
// 720 px the logo loses its tagline. The skip link comes first: every public page's <main> carries id="main".
export default async function SiteHeader({ showLogin = true }: { showLogin?: boolean }) {
  const [t, tc] = await Promise.all([getTranslations('landing'), getTranslations('common')]);
  const sections = NAV.map(([id, key]) => <Link key={id} href={`/#${id}`}>{t(key)}</Link>);
  return (
    <>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link href="/" className="site-logo">
            <picture>
              <source media="(max-width: 720px)" srcSet={LOGO_COMPACT.srcSet} width={LOGO_COMPACT.width} height={LOGO_COMPACT.height} />
              <img src={LOGO.src} srcSet={LOGO.srcSet} width={LOGO.width} height={LOGO.height} alt="LiftPilot" decoding="async" />
            </picture>
          </Link>
          <nav className="main-nav" aria-label={t('navLabel')}>{sections}</nav>
          <div className="header-actions">
            <LangSwitch />
            {showLogin ? <Link className="btn btn-sm header-wide" href="/login">{tc('login')}</Link> : null}
            <Link className="btn btn-primary btn-sm header-wide" href="/register">{t('ctaStart')}</Link>
            <MobileNav label={t('navMenu')}>
              <nav className="drawer-nav" aria-label={t('navLabel')}>{sections}</nav>
              <div className="drawer-actions">
                {showLogin ? <Link className="btn" href="/login">{tc('login')}</Link> : null}
                <Link className="btn btn-primary" href="/register">{t('ctaStart')}</Link>
              </div>
            </MobileNav>
          </div>
        </div>
      </header>
    </>
  );
}
