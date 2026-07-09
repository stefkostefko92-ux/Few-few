import Link from 'next/link';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const user = await getSessionUser();
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
      <Link href={`/${locale}`} className="flex items-center">
        <Image
          src="/logo.png"
          alt={tCommon('appName')}
          width={132}
          height={50}
          priority
          className="h-9 w-auto"
        />
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <Link
              href={`/${locale}/dashboard`}
              className="font-medium text-linketto-700 hover:underline"
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
              className="rounded-full bg-linketto-600 px-4 py-2 font-semibold text-white shadow-sm transition hover:bg-linketto-700"
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

export async function SiteFooter({
  locale,
  currentPath,
}: {
  locale: Locale;
  currentPath: string;
}) {
  const t = await getTranslations({ locale, namespace: 'footer' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  return (
    <footer className="bg-slate-950 px-6 py-14 text-sm text-slate-400">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.2fr_1fr_1fr]">
        <div>
          <Image
            src="/logo.png"
            alt={tCommon('appName')}
            width={158}
            height={60}
            className="h-11 w-auto brightness-0 invert opacity-90"
          />
          <p className="mt-4 max-w-xs leading-relaxed">{tCommon('tagline')}</p>
        </div>
        <nav
          className="flex flex-col items-start gap-2.5"
          aria-label="Language"
        >
          {LOCALES.map((loc) => (
            <a
              key={loc}
              href={`/${loc}${currentPath}`}
              className={
                loc === locale
                  ? 'font-semibold text-white'
                  : 'transition hover:text-white'
              }
              hrefLang={loc}
            >
              {LOCALE_NAMES[loc]}
            </a>
          ))}
        </nav>
        <div className="flex flex-col items-start gap-2.5">
          <Link
            href={`/${locale}/privacy`}
            className="transition hover:text-white"
          >
            {t('privacy')}
          </Link>
          <Link
            href={`/${locale}/terms`}
            className="transition hover:text-white"
          >
            {t('terms')}
          </Link>
          <Link
            href={`/${locale}/cookies`}
            className="transition hover:text-white"
          >
            {t('cookies')}
          </Link>
          <a
            href="mailto:info@carbonstealth.eu"
            className="transition hover:text-white"
          >
            {t('contact')}
          </a>
        </div>
      </div>
      <div className="mx-auto mt-12 max-w-6xl border-t border-white/10 pt-6 text-xs text-slate-500">
        {t('company')} · {t('legalLine')}
      </div>
    </footer>
  );
}
