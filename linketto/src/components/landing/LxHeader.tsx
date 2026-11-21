import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { LanguageMenu } from '@/components/LanguageMenu';
import { isAdminEmail } from '@/lib/admin';

// Хедърът на публичния сайт (лендинг, инструменти, сравнения, правни, вход):
// тъмно стъкло, логото от лендинга. Вход/регистрация или табло/изход;
// на мобилно основната навигация е във футъра.
export async function LxHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const user = await getSessionUser();
  const links = [
    { href: `/${locale}#features`, label: t('features') },
    { href: `/${locale}#pricing`, label: t('pricing') },
    { href: `/${locale}#faq`, label: t('faq') },
    { href: `/${locale}/tools`, label: t('tools') },
  ];
  return (
    <header className="lx-header">
      <a href="#main" className="lx-skip">
        {t('skip')}
      </a>
      <div className="lx-wrap lx-header-in">
        <Link href={`/${locale}`} className="flex items-center" aria-label={tCommon('appName')}>
          <Image
            src="/logo.png"
            alt={tCommon('appName')}
            width={132}
            height={50}
            priority
            className="lx-logo"
          />
        </Link>
        <nav aria-label={t('main')} className="lx-nav lx-nav-main">
          {links.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="lx-nav">
          <LanguageMenu locale={locale} label={t('language')} />
          {user ? (
            <>
              {/* Мастър акаунт: админът е на един клик (само за ADMIN_EMAILS). */}
              {isAdminEmail(user.email) && (
                <Link href={`/${locale}/admin`} className="lx-admin-link">
                  {t('admin')}
                </Link>
              )}
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
        </div>
      </div>
    </header>
  );
}
