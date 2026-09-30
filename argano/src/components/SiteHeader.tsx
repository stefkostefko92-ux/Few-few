import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import Brand from './Brand';
import LangSwitch from './LangSwitch';

// Header of the public pages: brand, language, access. One row down to phone width.
export default async function SiteHeader({ showLogin = true }: { showLogin?: boolean }) {
  const t = await getTranslations('common');
  return (
    <header className="topbar public">
      <div className="inner">
        <Brand href="/" sub={t('tagline')} />
        <div className="bar-end">
          <LangSwitch />
          {showLogin ? <Link className="btn btn-primary btn-sm" href="/login">{t('login')}</Link> : null}
        </div>
      </div>
    </header>
  );
}
