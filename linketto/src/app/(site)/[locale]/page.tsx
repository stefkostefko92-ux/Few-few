import type { CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/SiteChrome';
import { safeJsonLd } from '@/lib/jsonld';
import { ClaimHandle } from '@/components/ClaimHandle';
import { KineticLines } from '@/components/landing/Kinetic';
import { LxController } from '@/components/landing/LxController';
import { LxHeader } from '@/components/landing/LxHeader';
import { LxShader } from '@/components/landing/LxShader';
import '@/components/landing/lx.css';
import { BRAND_PATHS } from '@/components/brand-icons';
import { profileUrl } from '@/lib/profile-url';
import { faqJsonLd, pageMetadata, siteJsonLd } from '@/lib/seo';
import { LOCALES, type Locale } from '@/i18n/locales';
import { BLOCK_KINDS } from '@/lib/blocks';
import { BILLING_INTERVALS, PLANS } from '@/lib/plans';

// Максималната отстъпка (годишен план) — за маркетинговия ред в цените.
const ANNUAL_DISCOUNT =
  BILLING_INTERVALS.find((i) => i.id === 'annual')?.discountPercent ?? 0;

const FEATURE_KEYS = [
  'Lang',
  'Ai',
  'Fee',
  'Qr',
  'Analytics',
  'Trust',
  'Eu',
  'Domain',
] as const;

const PLAN_ORDER = ['free', 'pro', 'business', 'founder'] as const;

// Поздрави на езиците на света — универсални, не се превеждат.
// [дума, езиков код]
const GREETINGS = [
  ['Здравей', 'BG'],
  ['Hello', 'EN'],
  ['Ciao', 'IT'],
  ['Hola', 'ES'],
  ['Bonjour', 'FR'],
  ['Hallo', 'DE'],
  ['Olá', 'PT'],
  ['Merhaba', 'TR'],
] as const;

// Брандови имена от профила-пример (без превод)
const MOCK_PILLS = ['YouTube', 'Shop', 'Podcast', 'Tip'] as const;

const RIBBON_GREETINGS = [
  'Здравей',
  'Hello',
  'Ciao',
  'Hola',
  'Hallo',
  'Bonjour',
  'Olá',
  'Merhaba',
  'Ahoj',
  'Cześć',
  'Γεια',
  'Привіт',
  'こんにちは',
  '안녕하세요',
  'مرحبا',
] as const;

const RIBBON_PLATFORMS = [
  'YouTube',
  'Instagram',
  'TikTok',
  'X',
  'Twitch',
  'Kick',
  'Discord',
  'Spotify',
  'Snapchat',
  'Threads',
  'Facebook',
  'Telegram',
] as const;

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

function Ribbon({
  words,
  className,
  direction,
}: {
  words: readonly string[];
  className: string;
  direction: 'l' | 'r';
}) {
  // две еднакви половини → безшевно -50% превъртане; нечетните думи са контур
  const half = (
    <span>
      {words.map((word, index) => (
        <b key={word} className={index % 2 === 1 ? 'o' : undefined}>
          {word}
        </b>
      ))}
    </span>
  );
  return (
    <div className={`lx-ribbon ${className}`} aria-hidden>
      <div className={`lx-track lx-track-${direction} lx-auto`}>
        {half}
        {half}
      </div>
    </div>
  );
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('home');
  const tPricing = await getTranslations('pricing');
  const tSeo = await getTranslations('seo');

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
    t('trustEu'),
    t('trustGdpr'),
    t('trustPayments'),
    t('trustCookies'),
  ] as const;

  // [цел на брояча, суфикс, етикет] — всичко се смята от кода
  const STATS = [
    [String(LOCALES.length), '', t('statsLangsLabel')],
    [String(Object.keys(BRAND_PATHS).length), '', t('statsBrandsLabel')],
    [String(BLOCK_KINDS.length), '', t('statsBlocksLabel')],
    ['0', '%', t('statsFeeLabel')],
  ] as const;

  const quoteWords = `„${t('manifestoQuote')}“`.split(' ');

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      {/* Лендингът е винаги тъмен: вложеният data-theme дава тъмните токени и на общите
          компоненти вътре (езиковото меню, футъра), независимо от темата на сайта. */}
      <div className="lx" data-theme="dark" data-lx-root data-lx-motion="on">
        <div aria-hidden className="lx-progress" />
        <LxHeader locale={locale as Locale} />
        <main id="main">
          {/* ── HERO: течен хром (WebGL2) + кинетичен плакат ─────────── */}
          <section className="lx-hero" data-lx-hero>
            <div aria-hidden className="lx-hero-bg">
              <div className="lx-fallback lx-auto" />
              <LxShader />
              <div className="lx-scrim" />
            </div>
            <div aria-hidden className="lx-grain" />

            <div className="lx-wrap lx-hero-grid">
              <div className="lx-hero-copy">
                <p className="lx-sticker">{t('heroBadge')}</p>
                <h1 className="lx-h1 lx-display">
                  <KineticLines text={t('heroTitle')} locale={locale} ghost />
                </h1>
                <p className="lx-sub">{t('heroSubtitle')}</p>
                {/* „Запази си името“ — от първия екран право към своя адрес */}
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
                <div className="lx-hero-links">
                  <a href="#pricing">{t('ctaSecondary')}</a>
                  <Link href={`/${locale}/tools`}>{t('claimTools')}</Link>
                </div>
              </div>

              {/* пръстен от профили, който се върти в 3D */}
              <div aria-hidden className="lx-ring-stage">
                <div className="lx-ring-tilt">
                  <div className="lx-ring lx-auto">
                    {GREETINGS.map(([word, code], index) => (
                      <div
                        key={word}
                        className={`lx-card lx-card-${index % 4}`}
                        style={{ '--a': `${index * 45}deg` } as CSSProperties}
                      >
                        <div>
                          <b>{word}</b>
                          <small>{code}</small>
                        </div>
                        <div>
                          <i>{MOCK_PILLS[index % 4]}</i>
                          <i>{MOCK_PILLS[(index + 1) % 4]}</i>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="lx-wrap lx-trust">
              {TRUST.map((label) => (
                <p key={label}>{label}</p>
              ))}
            </div>
          </section>

          {/* ── ЛЕНТИ: два пресичащи се потока ───────────────────────── */}
          <div className="lx-ribbons">
            <Ribbon words={RIBBON_GREETINGS} className="lx-ribbon-a" direction="l" />
            <Ribbon words={RIBBON_PLATFORMS} className="lx-ribbon-b" direction="r" />
          </div>

          {/* ── ФУНКЦИИ: pinned лента от плакати ─────────────────────── */}
          <section aria-labelledby="features" className="lx-strip">
            <div className="lx-strip-pin">
              <div className="lx-wrap lx-strip-head">
                <h2 id="features" className="lx-display">
                  <KineticLines text={t('featuresTitle')} locale={locale} split={false} />
                </h2>
                <p className="lx-hint">{t('lxStripHint')}</p>
              </div>
              <ul className="lx-strip-track">
                {FEATURE_KEYS.map((key, index) => (
                  <li
                    key={key}
                    className={`lx-poster lx-poster-${index}`}
                    data-tilt
                  >
                    <span
                      aria-hidden
                      className={`lx-art lx-art-${index}`}
                      data-d={index === 7 ? t('claimPlaceholder') : undefined}
                    >
                      {index === 6
                        ? Array.from({ length: 12 }, (_, k) => (
                            <s key={k} style={{ '--k': k } as CSSProperties} />
                          ))
                        : null}
                    </span>
                    <h3>{t(`feature${key}Title`)}</h3>
                    <p>{t(`feature${key}Body`)}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── ЧИСЛА (всичко се смята от кода) ──────────────────────── */}
          <section className="lx-stats" aria-labelledby="stats-title">
            <div className="lx-wrap">
              <h2 id="stats-title" className="lx-display">
                {t('lxStatsTitle')}
              </h2>
              <div className="lx-stats-grid">
                {STATS.map(([value, suffix, label]) => (
                  <div key={label} className="lx-stat">
                    <p
                      className="lx-num"
                      style={{ '--lx-target': value } as CSSProperties}
                    >
                      <span aria-hidden className="lx-live" />
                      <span className="lx-static">{value}</span>
                      {suffix}
                    </p>
                    <p className="lx-stat-label">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── МАНИФЕСТ ─────────────────────────────────────────────── */}
          <section className="lx-manifesto">
            <div aria-hidden className="lx-grain" />
            <div className="lx-wrap lx-manifesto-grid">
              <div>
                <h2 className="lx-display">
                  <KineticLines text={t('manifestoTitle')} locale={locale} split={false} />
                </h2>
                <p className="lx-quote">
                  {quoteWords.map((word, index) => (
                    <span key={index}>
                      <span className="w">{word}</span>{' '}
                    </span>
                  ))}
                </p>
                <p className="lx-by">{t('manifestoBy')}</p>
              </div>
              <div aria-hidden className="lx-disc lx-auto" />
            </div>
          </section>

          {/* ── ЦЕНИ ─────────────────────────────────────────────────── */}
          <section
            id="pricing"
            aria-labelledby="pricing-title"
            className="lx-pricing"
          >
            <div className="lx-wrap">
              <h2 id="pricing-title" className="lx-display">
                <KineticLines text={tPricing('title')} locale={locale} split={false} />
              </h2>
              <p className="lx-pricing-note">
                {tPricing('prepaidNote')} {tPricing('vatNote')}
              </p>
              <div className="lx-plans">
                {PLAN_ORDER.map((planKey) => {
                  const def = PLANS[planKey.toUpperCase() as keyof typeof PLANS];
                  const highlight = planKey === 'pro';
                  return (
                    <div
                      key={planKey}
                      className={`lx-plan lx-plan-${planKey}`}
                      data-tilt
                    >
                      {highlight && (
                        <span className="lx-badge lx-auto">
                          {tPricing('mostPopular')}
                        </span>
                      )}
                      <h3>{tPricing(`${planKey}.name`)}</h3>
                      <p className="lx-price">
                        {tPricing(`${planKey}.price`)}
                        <small>
                          {def.oneTime
                            ? ` ${tPricing('oneTime')}`
                            : tPricing('perMonth')}
                        </small>
                      </p>
                      {!def.oneTime && def.priceCents > 0 && (
                        <p className="lx-offer">
                          {tPricing('annualOffer', { percent: ANNUAL_DISCOUNT })}
                        </p>
                      )}
                      <ul>
                        {(['f1', 'f2', 'f3'] as const).map((feature) => (
                          <li key={feature}>{tPricing(`${planKey}.${feature}`)}</li>
                        ))}
                      </ul>
                      <Link
                        href={`/${locale}/register`}
                        className="lx-btn"
                        data-magnet
                      >
                        {tPricing('choose')}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── ЧЗВ: отговори отпред — за хора и за AI (AEO) ─────────── */}
          <section id="faq" aria-labelledby="faq-title" className="lx-faq">
            <div className="lx-wrap">
              <h2 id="faq-title" className="lx-display">
                <KineticLines text={t('faqTitle')} locale={locale} split={false} />
              </h2>
              <div className="lx-faq-list">
                {faqItems.map((item, index) => (
                  <details key={item.q} className="lx-q" open={index === 0}>
                    <summary>
                      <span>{item.q}</span>
                      <span aria-hidden className="lx-plus" />
                    </summary>
                    <p>{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>

          {/* ── ФИНАЛ ────────────────────────────────────────────────── */}
          <section className="lx-final">
            <div aria-hidden className="lx-grain" />
            <div className="lx-wrap">
              <h2 className="lx-display">
                <KineticLines text={t('ctaTitle')} locale={locale} split={false} ghost />
              </h2>
              <Link href={`/${locale}/register`} className="lx-sun" data-magnet>
                {t('ctaButton')}
              </Link>
            </div>
            <p aria-hidden className="lx-mark">
              <KineticLines text="Linketto" locale="en" split={false} />
            </p>
          </section>
        </main>
        <LxController
          pauseLabel={t('pauseMotion')}
          resumeLabel={t('resumeMotion')}
        />
      </div>
      <div className="lx-foot" data-theme="dark">
        <SiteFooter locale={locale as Locale} currentPath="" />
      </div>
    </>
  );
}
