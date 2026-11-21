import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { safeJsonLd } from '@/lib/jsonld';
import { ClaimHandle } from '@/components/ClaimHandle';
import { HeroProfile } from '@/components/landing/HeroProfile';
import { profileUrl } from '@/lib/profile-url';
import { faqJsonLd, pageMetadata, siteJsonLd } from '@/lib/seo';
import {
  ChartColumnIcon,
  CheckIcon,
  CoinsIcon,
  CookieIcon,
  GlobeIcon,
  HandshakeIcon,
  LanguagesIcon,
  LockIcon,
  QrCodeIcon,
  ServerIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from '@/components/icons';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/i18n/locales';
import { BLOCK_KINDS } from '@/lib/blocks';
import { BRAND_PATHS } from '@/components/brand-icons';
import { BILLING_INTERVALS, PLANS } from '@/lib/plans';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink, buttonStyles } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Container } from '@/components/ui/Container';
import { ArrowRightGlyph, ChevronDownGlyph } from '@/components/ui/glyphs';
import { cn } from '@/components/ui/cn';

// Максималната отстъпка (годишен план) — за маркетинговия ред в цените.
const ANNUAL_DISCOUNT =
  BILLING_INTERVALS.find((i) => i.id === 'annual')?.discountPercent ?? 0;

// Цените идват САМО от lib/plans.ts (в евроцентове) — никакви суми в текстовете.
const formatEur = (cents: number) =>
  `€${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`;

// Функциите като „bento“: голямата плочка носи основната идея (езиците),
// останалите — с различна ширина. Иконите са наследяващи цвета (themable).
const FEATURES = [
  { key: 'Lang', Icon: LanguagesIcon, span: 'sm:col-span-2' },
  { key: 'Fee', Icon: CoinsIcon, span: 'sm:col-span-2' },
  { key: 'Eu', Icon: ServerIcon, span: 'sm:col-span-2' },
  { key: 'Ai', Icon: SparklesIcon, span: '' },
  { key: 'Analytics', Icon: ChartColumnIcon, span: '' },
  { key: 'Qr', Icon: QrCodeIcon, span: '' },
  { key: 'Trust', Icon: HandshakeIcon, span: '' },
  { key: 'Domain', Icon: GlobeIcon, span: 'sm:col-span-2' },
] as const;

const PLAN_ORDER = ['free', 'pro', 'business', 'founder'] as const;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const tSeo = await getTranslations({ locale, namespace: 'seo' });
  return pageMetadata(locale as Locale, '', {
    title: tSeo('metaTitle'),
    description: tSeo('metaDescription'),
    keywords: tSeo('keywords').split(', '),
  });
}

const FAQ_KEYS = ['faq1', 'faq2', 'faq3', 'faq4', 'faq5'] as const;

const SECTION = 'py-20 sm:py-28';
const H2 = 'text-balance text-title text-fg';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tPricing = await getTranslations('pricing');
  const tSeo = await getTranslations('seo');
  const tFooter = await getTranslations('footer');

  const faqItems = FAQ_KEYS.map((key) => ({
    q: t(`${key}q`),
    a: t(`${key}a`),
  }));
  const jsonLd = [
    ...siteJsonLd({
      locale: locale as Locale,
      description: tSeo('metaDescription'),
      plans: PLAN_ORDER.map((planKey) => {
        const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
        return {
          name: tPricing(`${planKey}.name`),
          priceEur: def.priceCents / 100,
        };
      }),
    }),
    faqJsonLd(faqItems),
  ];

  const TRUST = [
    [ServerIcon, t('trustEu')],
    [ShieldCheckIcon, t('trustGdpr')],
    [CookieIcon, t('trustCookies')],
  ] as const;

  // Само проверими факти за самия продукт — без клиенти, оценки и логота.
  const FACTS = [
    [String(LOCALES.length), t('statsLangsLabel')],
    // Броят се смята от реалния списък с икони — твърдо число остарява (беше „29“ при 30 икони).
    [String(Object.keys(BRAND_PATHS).length), t('statsBrandsLabel')],
    [String(BLOCK_KINDS.length), t('statsBlocksLabel')],
    ['0%', t('statsFeeLabel')],
  ] as const;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <SiteHeader locale={locale as Locale} />
      <main id="main">
        {/* ── HERO ─────────────────────────────────────────────────── */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
          <div aria-hidden className="bg-glow absolute inset-0 -z-10" />
          <Container className="grid grid-cols-1 items-center gap-16 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12 lg:pb-24 lg:pt-20">
            <div className="min-w-0">
              <h1 className="enter text-balance text-display text-fg">
                {t('heroTitle')}
              </h1>
              <p
                className="enter mt-6 max-w-xl text-lead text-fg-muted"
                style={{ '--d': '0.06s' } as React.CSSProperties}
              >
                {t('heroSubtitle')}
              </p>
              <div
                className="enter mt-9"
                style={{ '--d': '0.12s' } as React.CSSProperties}
              >
                <ClaimHandle
                  locale={locale}
                  prefix={profileUrl('').replace(/^https?:\/\//, '')}
                  labels={{
                    label: t('claimLabel'),
                    placeholder: t('claimPlaceholder'),
                    cta: t('claimCta'),
                    checking: t('claimChecking'),
                    available: t.raw('claimAvailable') as string,
                    taken: t.raw('claimTaken') as string,
                    invalid: t('claimInvalid'),
                    reserved: t.raw('claimTaken') as string,
                  }}
                />
                <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-2 text-body">
                  <span className="text-fg-muted">{t('heroNote')}</span>
                  <a
                    href="#pricing"
                    className="focus-ring inline-flex items-center gap-1 rounded-sm font-semibold text-accent-text hover:underline"
                  >
                    {t('ctaSecondary')}
                    <ArrowRightGlyph className="h-4 w-4 rtl:-scale-x-100" />
                  </a>
                  <Link
                    href={`/${locale}/tools`}
                    className="focus-ring rounded-sm font-semibold text-accent-text hover:underline"
                  >
                    {t('claimTools')}
                  </Link>
                </div>
              </div>
              <ul
                className="enter mt-10 flex flex-wrap gap-x-6 gap-y-2.5 text-small font-medium text-fg-2"
                style={{ '--d': '0.18s' } as React.CSSProperties}
              >
                {TRUST.map(([TrustIcon, label]) => (
                  <li key={label} className="flex items-center gap-2">
                    <TrustIcon className="h-4 w-4 shrink-0 text-accent-text" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <div
              className="enter min-w-0"
              style={{ '--d': '0.1s' } as React.CSSProperties}
            >
              <HeroProfile
                url={profileUrl('anna').replace(/^https?:\/\//, '')}
                caption={t('demoLabel')}
                pauseLabel={t('pauseMotion')}
              />
            </div>
          </Container>
        </section>

        {/* ── ФАКТИ ЗА ПРОДУКТА ────────────────────────────────────── */}
        <section aria-label={t('factsLabel')} className="border-y border-line bg-surface">
          <Container>
            <dl className="grid grid-cols-2 lg:grid-cols-4">
              {FACTS.map(([value, label], index) => (
                <div
                  key={label}
                  className={cn(
                    'px-1 py-8 sm:px-6',
                    index % 2 === 1 && 'border-s border-line',
                    index >= 2 && 'border-t border-line lg:border-t-0',
                    index >= 1 && 'lg:border-s lg:border-line',
                    index === 0 && 'sm:ps-0',
                  )}
                >
                  <dt className="order-2 mt-1 text-small text-fg-muted">{label}</dt>
                  <dd className="text-title tabular-nums text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </section>

        {/* ── ФУНКЦИИ ──────────────────────────────────────────────── */}
        <section id="features" aria-labelledby="features-title" className={SECTION}>
          <Container>
            <h2 id="features-title" className={cn(H2, 'max-w-2xl')}>
              {t('featuresTitle')}
            </h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ key, Icon, span }) => (
                <Card
                  key={key}
                  as="article"
                  padding="lg"
                  className={cn(
                    'flex flex-col transition-[border-color,box-shadow] duration-200 hover:border-line-input hover:shadow-e2',
                    span,
                  )}
                >
                  <span
                    aria-hidden
                    className="flex h-10 w-10 items-center justify-center rounded-control bg-accent-soft text-accent-soft-fg"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  {key === 'Fee' && (
                    <p aria-hidden className="mt-6 text-title tabular-nums text-accent-text">
                      0%
                    </p>
                  )}
                  <h3 className={cn('text-subheading text-fg', key === 'Fee' ? 'mt-1' : 'mt-5')}>
                    {t(`feature${key}Title`)}
                  </h3>
                  <p className="mt-2 text-body text-fg-muted">
                    {t(`feature${key}Body`)}
                  </p>
                  {key === 'Lang' && (
                    <ul
                      aria-label={t('statsLangsLabel')}
                      className="mt-8 flex flex-wrap gap-1.5"
                    >
                      {LOCALES.map((loc) => (
                        <li
                          key={loc}
                          className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-micro font-medium text-fg-2"
                        >
                          {LOCALE_NAMES[loc]}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </Container>
        </section>

        {/* ── ОБЕЩАНИЕ ─────────────────────────────────────────────── */}
        <section className="border-y border-line bg-surface-2/60">
          <Container narrow className="py-20 sm:py-24">
            <h2 className="text-balance text-heading text-fg">
              {t('manifestoTitle')}
            </h2>
            <blockquote className="mt-8 border-s-2 border-accent ps-6 sm:ps-8">
              <p className="text-[1.3125rem] font-medium leading-[1.6] tracking-[-0.01em] text-fg-2">
                {t('manifestoQuote')}
              </p>
              <footer className="mt-5 text-small text-fg-muted">
                {t('manifestoBy')}
              </footer>
            </blockquote>
          </Container>
        </section>

        {/* ── ЦЕНИ ─────────────────────────────────────────────────── */}
        <section id="pricing" aria-labelledby="pricing-title" className={SECTION}>
          <Container>
            <h2 id="pricing-title" className={cn(H2, 'max-w-2xl')}>
              {tPricing('title')}
            </h2>
            <p className="mt-4 max-w-2xl text-lead text-fg-muted">
              {tPricing('prepaidNote')} {tPricing('vatNote')}
            </p>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_ORDER.map((planKey) => {
                const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
                const highlight = planKey === 'pro';
                return (
                  <Card
                    key={planKey}
                    as="article"
                    variant={highlight ? 'accent' : 'default'}
                    padding="lg"
                    className={cn(
                      'relative flex flex-col',
                      highlight && 'ring-1 ring-accent/40',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-subheading text-fg">
                        {tPricing(`${planKey}.name`)}
                      </h3>
                      {highlight && (
                        <Badge tone="accent">{tPricing('mostPopular')}</Badge>
                      )}
                    </div>
                    <p className="mt-5 flex items-baseline gap-1.5 tabular-nums">
                      <span className="text-[2.75rem] font-bold leading-none tracking-[-0.04em] text-fg">
                        {formatEur(def.priceCents)}
                      </span>
                      <span className="text-small text-fg-muted">
                        {def.oneTime ? tPricing('oneTime') : tPricing('perMonth')}
                      </span>
                    </p>
                    <p className="mt-2 min-h-5 text-small font-semibold text-success-text">
                      {!def.oneTime && def.priceCents > 0
                        ? tPricing('annualOffer', { percent: ANNUAL_DISCOUNT })
                        : null}
                    </p>
                    <ul className="mt-6 flex-1 space-y-3 border-t border-line pt-6 text-body text-fg-2">
                      {(['f1', 'f2', 'f3'] as const).map((feature) => (
                        <li key={feature} className="flex gap-2.5">
                          <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-accent-text" />
                          {tPricing(`${planKey}.${feature}`)}
                        </li>
                      ))}
                    </ul>
                    <ButtonLink
                      href={`/${locale}/register`}
                      variant={highlight ? 'primary' : 'secondary'}
                      block
                      className="mt-8"
                    >
                      {tPricing('choose')}
                    </ButtonLink>
                  </Card>
                );
              })}
            </div>
            <p className="mt-8 flex max-w-2xl items-start gap-2.5 text-small text-fg-muted">
              <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {t('trustPayments')}
            </p>
          </Container>
        </section>

        {/* ── ЧЗВ: отговори отпред — за хора и за AI (AEO) ─────────── */}
        <section
          id="faq"
          aria-labelledby="faq-title"
          className="border-t border-line bg-surface-2/50 py-20 sm:py-28"
        >
          <Container className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <h2 id="faq-title" className={H2}>
                {t('faqTitle')}
              </h2>
              <Link
                href={`/${locale}/vs/linktree`}
                className="focus-ring mt-6 inline-flex items-center gap-1.5 rounded-sm text-body font-semibold text-accent-text hover:underline"
              >
                {tFooter('compare')}
                <ArrowRightGlyph className="h-4 w-4 rtl:-scale-x-100" />
              </Link>
            </div>
            <div className="divide-y divide-line border-y border-line">
              {faqItems.map((item, index) => (
                <details
                  key={item.q}
                  className="disclosure group py-1"
                  open={index === 0}
                >
                  <summary className="focus-ring flex cursor-pointer items-center justify-between gap-6 rounded-control py-4 text-[1.0625rem] font-semibold text-fg">
                    <span>{item.q}</span>
                    <ChevronDownGlyph className="disclosure-chevron h-5 w-5 shrink-0 text-fg-muted transition-transform duration-200" />
                  </summary>
                  <p className="max-w-[62ch] pb-5 pe-8 text-body text-fg-muted">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </Container>
        </section>

        {/* ── ФИНАЛНА ПОКАНА ───────────────────────────────────────── */}
        <section className="py-20 sm:py-28">
          <Container>
            <div className="relative isolate overflow-hidden rounded-panel border border-line bg-surface px-6 py-16 shadow-e2 sm:px-14 sm:py-20">
              <div aria-hidden className="bg-grid absolute inset-0 -z-10" />
              <div aria-hidden className="bg-glow absolute inset-0 -z-10" />
              <h2 className="max-w-2xl text-balance text-title text-fg">
                {t('ctaTitle')}
              </h2>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link
                  href={`/${locale}/register`}
                  className={buttonStyles({ size: 'lg' })}
                >
                  {t('ctaButton')}
                </Link>
                <span className="text-body text-fg-muted">{t('heroNote')}</span>
              </div>
            </div>
          </Container>
        </section>
      </main>
      <SiteFooter locale={locale as Locale} currentPath="" />
    </>
  );
}
