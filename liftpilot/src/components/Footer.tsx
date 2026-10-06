import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export default async function Footer() {
  const t = await getTranslations('common');
  return (
    <footer className="site-footer">
      <div className="inner">
        <span>{t('footerNote')}</span>
        <span className="footer-links">
          <Link href="/privacy">{t('legal')}</Link>
          <Link href="/pricing">{t('pricingLink')}</Link>
          <Link href="/data">{t('dataLink')}</Link>
          <span lang="en">
            Created and Designed by{' '}
            <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>
          </span>
        </span>
        <span className="footer-provider">{t('provider')}</span>
      </div>
    </footer>
  );
}
