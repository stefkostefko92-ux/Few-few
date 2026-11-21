import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { getSessionUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';
import { LocaleChoice } from '@/components/LocaleChoice';
import { LanguageMenu } from '@/components/LanguageMenu';
import { MobileMenu } from '@/components/MobileMenu';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cn } from '@/components/ui/cn';

const NAV_LINK =
  'focus-ring rounded-control px-3 py-2 text-body font-medium text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg';

export async function SiteHeader({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const user = await getSessionUser();

  const themeLabels = {
    group: t('theme'),
    light: t('themeLight'),
    dark: t('themeDark'),
    system: t('themeSystem'),
  };
  const links = [
    { href: `/${locale}#features`, label: t('features') },
    { href: `/${locale}#pricing`, label: t('pricing') },
    { href: `/${locale}#faq`, label: t('faq') },
    { href: `/${locale}/tools`, label: t('tools') },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
      <a
        href="#main"
        className="focus-ring absolute start-4 top-2 z-50 -translate-y-20 rounded-control bg-surface px-3 py-2 text-small font-semibold text-fg shadow-e3 focus:translate-y-0"
      >
        {t('skip')}
      </a>
      <Container className="flex h-header items-center justify-between gap-6">
        <Link
          href={`/${locale}`}
          aria-label={tCommon('appName')}
          className="focus-ring -ms-1 rounded-control px-1 py-1"
        >
          <Logo name={tCommon('appName')} />
        </Link>

        <nav aria-label={t('main')} className="hidden items-center gap-0.5 md:flex">
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={NAV_LINK}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <LanguageMenu locale={locale} label={t('language')} />
          <ThemeToggle labels={themeLabels} />
          <span aria-hidden className="mx-1 h-5 w-px bg-line-strong" />
          {user ? (
            <>
              <ButtonLink href={`/${locale}/dashboard`} size="sm">
                {t('dashboard')}
              </ButtonLink>
              <form action={logoutAction}>
                <input type="hidden" name="locale" value={locale} />
                <Button type="submit" variant="ghost" size="sm">
                  {t('logout')}
                </Button>
              </form>
            </>
          ) : (
            <>
              <ButtonLink href={`/${locale}/login`} variant="ghost" size="sm">
                {t('login')}
              </ButtonLink>
              <ButtonLink href={`/${locale}/register`} size="sm">
                {t('register')}
              </ButtonLink>
            </>
          )}
        </div>

        <MobileMenu labels={{ open: t('menu'), close: t('closeMenu') }}>
          <nav aria-label={t('main')} className="flex flex-col">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="focus-ring rounded-control px-1 py-3 text-[1.0625rem] font-semibold text-fg"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 space-y-3 border-t border-line pt-4">
            <LanguageMenu locale={locale} label={t('language')} inline />
            <ThemeToggle
              labels={themeLabels}
              showLabels
              className="flex w-full"
            />
          </div>
          <div className="mt-5 grid gap-2.5">
            {user ? (
              <>
                <ButtonLink href={`/${locale}/dashboard`} size="lg" block>
                  {t('dashboard')}
                </ButtonLink>
                <form action={logoutAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" variant="secondary" size="lg" block>
                    {t('logout')}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <ButtonLink href={`/${locale}/register`} size="lg" block>
                  {t('register')}
                </ButtonLink>
                <ButtonLink href={`/${locale}/login`} variant="secondary" size="lg" block>
                  {t('login')}
                </ButtonLink>
              </>
            )}
          </div>
        </MobileMenu>
      </Container>
    </header>
  );
}

const FOOT_LINK =
  'focus-ring rounded-sm text-body text-fg-2 transition-colors hover:text-fg';

export async function SiteFooter({
  locale,
  currentPath,
}: {
  locale: Locale;
  currentPath: string;
}) {
  const t = await getTranslations({ locale, namespace: 'footer' });
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  return (
    <footer className="border-t border-line bg-surface-2/60">
      <Container className="grid gap-12 py-14 md:grid-cols-[1.3fr_1fr_1fr] lg:py-16">
        <div>
          <Logo name={tCommon('appName')} />
          <p className="mt-4 max-w-xs text-body text-fg-muted">
            {tCommon('tagline')}
          </p>
          <a
            href="mailto:info@carbonstealth.eu"
            className={cn(FOOT_LINK, 'mt-5 inline-block font-medium text-accent-text')}
          >
            {t('contact')}
          </a>
        </div>
        <nav aria-label={t('product')}>
          <p className="text-small font-semibold text-fg">{t('product')}</p>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href={`/${locale}#features`} className={FOOT_LINK}>
                {tNav('features')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}#pricing`} className={FOOT_LINK}>
                {tNav('pricing')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/tools`} className={FOOT_LINK}>
                {t('tools')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/vs/linktree`} className={FOOT_LINK}>
                {t('compare')}
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t('legal')}>
          <p className="text-small font-semibold text-fg">{t('legal')}</p>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href={`/${locale}/privacy`} className={FOOT_LINK}>
                {t('privacy')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/terms`} className={FOOT_LINK}>
                {t('terms')}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/cookies`} className={FOOT_LINK}>
                {t('cookies')}
              </Link>
            </li>
          </ul>
        </nav>
      </Container>

      <Container className="border-t border-line py-8">
        <nav aria-label={t('languages')}>
          <p className="sr-only">{t('languages')}</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-small">
            {LOCALES.map((loc) => (
              <li key={loc}>
                <LocaleChoice
                  locale={loc}
                  href={`/${loc}${currentPath}`}
                  className={cn(
                    'focus-ring rounded-sm transition-colors',
                    loc === locale
                      ? 'font-semibold text-fg'
                      : 'text-fg-muted hover:text-fg',
                  )}
                >
                  {LOCALE_NAMES[loc]}
                </LocaleChoice>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-8 text-micro leading-relaxed text-fg-muted">
          {t('company')} · {t('legalLine')}
        </p>
      </Container>
    </footer>
  );
}
