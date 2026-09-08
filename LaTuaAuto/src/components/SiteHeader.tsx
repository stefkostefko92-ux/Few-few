import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { LocaleSwitcher } from './LocaleSwitcher';

const NAV: ReadonlyArray<{ key: 'how' | 'safety' | 'deadlines' | 'faq' | 'contact'; href: string }> = [
  { key: 'how', href: '/come-funziona' },
  { key: 'safety', href: '/sicurezza' },
  { key: 'deadlines', href: '/scadenze' },
  { key: 'faq', href: '/faq' },
  { key: 'contact', href: '/contatti' },
];

export function SiteHeader() {
  const t = useTranslations('common');
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:bg-white focus:p-2">
        {t('skipToContent')}
      </a>
      <div className="container-page flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-targa-700">
          <span aria-hidden className="inline-block h-6 w-2 rounded-sm bg-targa-600" />
          {t('appName')}
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {NAV.map((item) => (
            <Link key={item.key} href={item.href} className="text-slate-700 hover:text-targa-700">
              {t(`nav.${item.key}`)}
            </Link>
          ))}
          <LocaleSwitcher />
        </nav>
      </div>
    </header>
  );
}
