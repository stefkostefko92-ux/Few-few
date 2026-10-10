import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import { LOGO } from '@/lib/brand';

// The footer of every page (public and application), after the Premium template: the logo, the year and the note on
// the results, the legal links, the Carbon Stealth credit, then the provider's details in small print.
export default async function Footer() {
  const t = await getTranslations('common');
  return (
    <footer className="site-footer">
      <div className="inner">
        <Link href="/" className="site-logo footer-logo">
          {/* eslint-disable-next-line @next/next/no-img-element -- prebuilt sizes with a srcset (scripts/brand-assets.py), nothing to optimise */}
          <img src={LOGO.src} srcSet={LOGO.srcSet} width={LOGO.width} height={LOGO.height} alt="LiftPilot" loading="lazy" decoding="async" />
        </Link>
        <span className="footer-note">© {new Date().getFullYear()} {t('footerNote')}</span>
        <span className="footer-links">
          <Link className="footer-link" href="/privacy">{t('legal')}</Link>
          <Link className="footer-link" href="/pricing">{t('pricingLink')}</Link>
          <Link className="footer-link" href="/data">{t('dataLink')}</Link>
        </span>
        <span className="footer-credit" lang="en">
          Created and Designed by{' '}
          <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>
        </span>
        <small className="footer-provider">{t('provider')}</small>
      </div>
    </footer>
  );
}
