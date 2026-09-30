import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import LangSwitch from './LangSwitch';

// Header of the public pages: brand, language, access.
export default async function SiteHeader({ showLogin = true }: { showLogin?: boolean }) {
  const t = await getTranslations('common');
  return (
    <header className="topbar">
      <div className="inner">
        <Link href="/" className="brand"><b>Argano</b><span>{t('tagline')}</span></Link>
        <div className="nav" />
        <div className="userbox">
          <LangSwitch />
          {showLogin ? <Link className="btn btn-primary btn-sm" href="/login">{t('login')}</Link> : null}
        </div>
      </div>
    </header>
  );
}
