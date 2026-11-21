import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { LocaleChoice } from '@/components/LocaleChoice';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/components/ui/cn';

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
