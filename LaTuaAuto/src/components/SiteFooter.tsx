import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

export function SiteFooter() {
  const t = useTranslations();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="container-page flex flex-col gap-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-800">{t('common.appName')}</p>
          <p>{t('common.tagline')}</p>
          <p className="mt-2">
            © {year} Carbon Stealth VCC. {t('footer.rights')}
          </p>
        </div>
        <nav aria-label={t('footer.legal')} className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/privacy">{t('legal.privacy.title')}</Link>
          <Link href="/termini">{t('legal.terms.title')}</Link>
          <Link href="/cookie">{t('legal.cookies.title')}</Link>
          <Link href="/contatti">{t('common.nav.contact')}</Link>
        </nav>
      </div>
      <div className="border-t border-slate-100 py-3 text-center text-xs text-slate-500">
        <a href="https://carbonstealth.eu" target="_blank" rel="noopener" className="hover:text-targa-700">
          {t('footer.credit')}
        </a>
      </div>
    </footer>
  );
}
