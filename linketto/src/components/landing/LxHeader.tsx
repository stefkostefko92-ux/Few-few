import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { LanguageMenu } from '@/components/LanguageMenu';

// Хедърът на лендинга: тъмно стъкло върху шейдъра. Същата логика като
// общия SiteHeader (вход/регистрация/табло), друг облик.
export async function LxHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const user = await getSessionUser();
  return (
    <header className="lx-header">
      <div className="lx-wrap lx-header-in">
        <Link href={`/${locale}`} className="flex items-center">
          <Image
            src="/logo.png"
            alt={tCommon('appName')}
            width={132}
            height={50}
            priority
            className="lx-logo"
          />
        </Link>
        <nav className="lx-nav">
          <LanguageMenu locale={locale} label={t('language')} />
          {user ? (
            <>
              <Link href={`/${locale}/dashboard`}>{t('dashboard')}</Link>
              <form action={logoutAction}>
                <input type="hidden" name="locale" value={locale} />
                <button type="submit" className="font-bold hover:text-[#d6ff3d]">
                  {t('logout')}
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href={`/${locale}/login`}>{t('login')}</Link>
              <Link
                href={`/${locale}/register`}
                className="lx-btn lx-btn-lime lx-btn-sm"
                data-magnet
              >
                {t('register')}
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
