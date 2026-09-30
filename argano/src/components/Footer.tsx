import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('common');
  return (
    <footer className="site-footer">
      <div className="inner">
        <span>{t('footerNote')}</span>
        <span>
          Created and Designed by{' '}
          <a href="https://carbonstealth.eu" target="_blank" rel="noopener">Carbon Stealth VCC</a>
        </span>
      </div>
    </footer>
  );
}
