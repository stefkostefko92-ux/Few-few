import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const user = await getSessionUser();
  return (
    <header className="flex items-center justify-between px-6 py-4">
      <Link href={`/${locale}`} className="text-xl font-bold text-millelink-700">
        {tCommon('appName')}
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <Link
              href={`/${locale}/dashboard`}
              className="font-medium text-millelink-700 hover:underline"
            >
              {t('dashboard')}
            </Link>
            <form action={logoutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button type="submit" className="text-slate-600 hover:underline">
                {t('logout')}
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href={`/${locale}/login`}
              className="text-slate-600 hover:underline"
            >
              {t('login')}
            </Link>
            <Link
              href={`/${locale}/register`}
              className="rounded-full bg-millelink-600 px-4 py-1.5 font-medium text-white hover:bg-millelink-700"
            >
              {t('register')}
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

export async function SiteFooter({
  locale,
  currentPath,
}: {
  locale: Locale;
  currentPath: string;
}) {
  const t = await getTranslations({ locale, namespace: 'footer' });
  return (
    <footer className="mt-16 border-t border-slate-200 px-6 py-8 text-sm text-slate-500">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Language">
          {LOCALES.map((loc) => (
            <a
              key={loc}
              href={`/${loc}${currentPath}`}
              className={
                loc === locale
                  ? 'font-semibold text-millelink-700'
                  : 'hover:underline'
              }
              hrefLang={loc}
            >
              {LOCALE_NAMES[loc]}
            </a>
          ))}
        </nav>
        <p>
          {t('company')} · {t('legalLine')}
        </p>
        <p className="flex gap-4">
          <Link href={`/${locale}/privacy`} className="hover:underline">
            {t('privacy')}
          </Link>
          <Link href={`/${locale}/terms`} className="hover:underline">
            {t('terms')}
          </Link>
          <a href="mailto:info@carbonstealth.eu" className="hover:underline">
            {t('contact')}
          </a>
        </p>
      </div>
    </footer>
  );
}
