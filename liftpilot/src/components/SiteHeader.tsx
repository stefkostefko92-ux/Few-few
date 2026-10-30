import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LOGO, LOGO_COMPACT } from '@/lib/brand';
import MobileNav from './MobileNav';

/** The landing's sections the header leads to, in the page's order: the id of each and the key of its name. */
const NAV = [['funzionalita', 'navFeatures'], ['prodotto', 'navProduct'], ['prezzi', 'navPricing'], ['norme', 'navNorms'], ['faq', 'navFaq']] as const;

// Header of the public pages, after the Premium template's landing: the full logo, the landing's sections, the way in
// (sign in, sign up). Sticky; under 1080 px the sections move into a drawer (MobileNav) and under 720 px the logo loses
// its tagline and only one way in stays beside the menu (sign in, as in the template; sign up on the sign-in page
// itself), the other one in the drawer. Without the sign-in button (`lean`: the sign-in family, the 404) sign-up stays
// beside the menu. The skip link comes first: every public page's <main> carries id="main".
// `at` names the page the header stands on: on the landing the sections are anchors on the page; elsewhere "Prices"
// leads to /pricing, which marks it as the current page; on the registration its own button is the current page.
export default async function SiteHeader({ showLogin = true, at }: { showLogin?: boolean; at?: 'home' | 'pricing' | 'register' }) {
  const [t, tc] = await Promise.all([getTranslations('landing'), getTranslations('common')]);
  const here = at === 'register' ? 'page' : undefined;
  const sections = NAV.map(([id, key]) => (id === 'prezzi' && at !== 'home'
    ? <Link key={id} href="/pricing" aria-current={at === 'pricing' ? 'page' : undefined}>{t(key)}</Link>
    : <Link key={id} href={`/#${id}`}>{t(key)}</Link>));
  return (
    <>
      <a className="skip-link" href="#main">{t('skip')}</a>
      <header className={`site-header${showLogin ? '' : ' lean'}`}>
        <div className="site-header-inner">
          <Link href="/" className="site-logo" aria-current={at === 'home' ? 'page' : undefined}>
            <picture>
              <source media="(max-width: 720px)" srcSet={LOGO_COMPACT.srcSet} width={LOGO_COMPACT.width} height={LOGO_COMPACT.height} />
              <img src={LOGO.src} srcSet={LOGO.srcSet} width={LOGO.width} height={LOGO.height} alt="LiftPilot" decoding="async" />
            </picture>
          </Link>
          <nav className="main-nav" aria-label={t('navLabel')}>{sections}</nav>
          <div className="header-actions">
            {showLogin ? <Link className="btn btn-sm" href="/login">{tc('login')}</Link> : null}
            <Link className={`btn btn-primary btn-sm${showLogin ? ' header-wide' : ''}`} href="/register" aria-current={here}>{t('ctaStart')}</Link>
            <MobileNav label={t('navMenu')}>
              <nav className="drawer-nav" aria-label={t('navLabel')}>{sections}</nav>
              <div className="drawer-actions">
                {showLogin ? <Link className="btn" href="/login">{tc('login')}</Link> : null}
                <Link className="btn btn-primary" href="/register" aria-current={here}>{t('ctaStart')}</Link>
              </div>
            </MobileNav>
          </div>
        </div>
      </header>
    </>
  );
}
