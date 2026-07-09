import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { dirFor, localeFromGeo, LOCALE_NAMES } from '@/i18n/locales';
import { isBlockVisible, videoEmbedSrc, type BlockMeta } from '@/lib/blocks';
import { brandFor, isSensitiveUrl } from '@/lib/brands';
import { BrandIcon, BRAND_COLORS } from '@/components/brand-icons';
import { ShareButton } from '@/components/ShareButton';
import {
  backgroundCss,
  buttonCss,
  buttonShadowClass,
  buttonShapeClass,
  fontFamily,
  parseStyle,
  readableOn,
} from '@/lib/style';
import {
  HeartIcon,
  MapPinIcon,
  MusicIcon,
  PhoneIcon,
  ShoppingBagIcon,
  SmartphoneIcon,
  UserRoundPlusIcon,
} from '@/components/icons';
import { submitContactAction } from '@/app/actions/contact';
import { startProductPurchaseAction } from '@/app/actions/shop';
import { subscribeAction } from '@/app/actions/newsletter';

// Общото публично рендиране на профил — ползва се от /u/[slug]
// и от собствените домейни (/d/[domain] през middleware rewrite).

const THEME_CLASSES: Record<string, string> = {
  aurora:
    'bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white',
  mono: 'bg-white text-slate-900',
  dusk: 'bg-gradient-to-b from-rose-950 via-slate-900 to-slate-950 text-white',
};

// Поздравът над името — на езика, на който посетителят гледа профила.
const GREETING_BY_LOCALE: Record<string, string> = {
  bg: 'Здравей',
  en: 'Hello',
  it: 'Ciao',
  es: 'Hola',
  de: 'Hallo',
  fr: 'Bonjour',
};

// Звезди за сцената „звездно небе“: [top, left, размер px, ритъм, закъснение]
const PF_STARS = [
  ['6%', '10%', 2, '4.4s', '0s'],
  ['14%', '82%', 3, '5.6s', '1.2s'],
  ['24%', '28%', 2, '6.1s', '2.4s'],
  ['10%', '58%', 2, '4.9s', '0.6s'],
  ['34%', '90%', 2, '5.2s', '1.7s'],
  ['44%', '8%', 3, '6.6s', '0.3s'],
  ['58%', '46%', 2, '4.6s', '2.8s'],
  ['66%', '14%', 2, '5.8s', '1.5s'],
  ['76%', '76%', 3, '4.7s', '3.2s'],
  ['88%', '34%', 2, '6.3s', '0.9s'],
] as const;

export async function loadProfileBy(where: Prisma.ProfileWhereUniqueInput) {
  return prisma.profile.findUnique({
    where,
    include: {
      translations: true,
      links: {
        where: { active: true },
        orderBy: { position: 'asc' },
        include: { translations: true },
      },
      products: {
        where: { active: true },
        orderBy: { position: 'asc' },
        include: { translations: true },
      },
      user: {
        select: {
          stripeAccountId: true,
          stripeChargesEnabled: true,
          isTrader: true,
        },
      },
    },
  });
}

export type LoadedProfile = NonNullable<
  Awaited<ReturnType<typeof loadProfileBy>>
>;

export function profileMetadata(
  profile: LoadedProfile | null,
  hl?: string,
): Metadata {
  if (!profile || !profile.published || profile.bannedAt) {
    return { title: 'Linketto', robots: { index: false } };
  }
  const fallback = profile.translations[0];
  // Езиковата версия, която реално се гледа — за самореферентен canonical.
  const activeLocale = profile.translations.find((t) => t.locale === hl)
    ? hl
    : undefined;
  const main =
    profile.translations.find((t) => t.locale === (activeLocale ?? profile.defaultLocale)) ??
    fallback;
  const path = `/u/${profile.slug}`;
  const canonical = activeLocale ? `${path}?hl=${activeLocale}` : path;
  const languages: Record<string, string> = {};
  for (const translation of profile.translations) {
    languages[translation.locale] = `${path}?hl=${translation.locale}`;
  }
  languages['x-default'] = path;
  const title = `${main?.displayName ?? profile.slug} · Linketto`;
  const style = parseStyle(profile.style);
  // Профили с 18+ линкове не се индексират (защита на непълнолетни).
  const hasSensitive = profile.links.some((link) => isSensitiveUrl(link.url));
  return {
    title,
    description: main?.bio ?? undefined,
    ...(hasSensitive ? { robots: { index: false } } : {}),
    alternates: { canonical, languages },
    openGraph: {
      type: 'profile',
      siteName: 'Linketto',
      title: main?.displayName ?? profile.slug,
      description: main?.bio ?? undefined,
      url: canonical,
      ...(style.avatarUrl ? { images: [{ url: style.avatarUrl }] } : {}),
    },
    twitter: { card: 'summary' },
  };
}

export async function ProfileScreen({
  profile,
  hl,
  sent,
  formError,
  shopError,
  couponError,
  subscribed,
  subError,
  unsub,
}: {
  profile: LoadedProfile;
  hl?: string;
  sent?: string;
  formError?: string;
  shopError?: string;
  couponError?: string;
  subscribed?: string;
  subError?: string;
  unsub?: string;
}) {
  const slug = profile.slug;
  const available = profile.translations.map((t) => t.locale);
  const requestHeaders = await headers();
  let viewLocale: string;
  if (hl && available.includes(hl)) {
    // Явният избор (?hl) винаги печели.
    viewLocale = hl;
  } else {
    // Иначе автоматично по IP геолокация (държава) в рамките на езиците,
    // които създателят е превел; после Accept-Language. Диалектите не се
    // избират автоматично.
    viewLocale = localeFromGeo({
      country: requestHeaders.get('cf-ipcountry'),
      acceptLanguage: requestHeaders.get('accept-language'),
      available,
      fallback: available.includes(profile.defaultLocale)
        ? profile.defaultLocale
        : available[0],
    });
  }

  const translation =
    profile.translations.find((t) => t.locale === viewLocale) ??
    profile.translations[0];
  const t = await getTranslations({
    locale: viewLocale,
    namespace: 'profile',
  });

  // Преглед на страницата — без бисквитки, без лични данни.
  await prisma.clickEvent
    .create({
      data: {
        profileId: profile.id,
        locale: viewLocale,
        referrerHost: hostOf(requestHeaders.get('referer')),
        country: requestHeaders.get('cf-ipcountry') ?? undefined,
      },
    })
    .catch(() => undefined);

  // Стилов енджин — „персонализация до крайна степен“.
  const styleCfg = parseStyle(profile.style);
  const isTheme = styleCfg.bgStyle === 'theme';
  const themeClass = isTheme
    ? (THEME_CLASSES[profile.theme] ?? THEME_CLASSES.aurora)
    : '';
  const baseTextColor =
    styleCfg.textColor ??
    (isTheme
      ? undefined
      : styleCfg.bgStyle === 'image'
        ? '#ffffff'
        : readableOn(styleCfg.bgColor1));
  const accent = profile.accent ?? '#3b82c4';
  const accentFor = (meta: BlockMeta | null) => meta?.color ?? accent;
  const shapeClass = buttonShapeClass(styleCfg);
  const shadowClass = buttonShadowClass(styleCfg);
  const boxShape =
    styleCfg.buttonShape === 'square' ? 'rounded-none' : 'rounded-2xl';
  const btnClass = `block border px-6 py-3.5 text-center font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${shapeClass} ${shadowClass}`;
  const gridSpan = styleCfg.layout === 'grid' ? 'col-span-2' : '';
  const buttonStyle = buttonCss(styleCfg, accent);
  const avatarShapeClass =
    styleCfg.avatarShape === 'circle'
      ? 'rounded-full'
      : styleCfg.avatarShape === 'rounded'
        ? 'rounded-2xl'
        : '';
  // Светъл фон → тъмно стъкло; тъмен фон → светло стъкло.
  const isLightBg = isTheme
    ? profile.theme === 'mono'
    : styleCfg.bgStyle !== 'image' &&
      readableOn(styleCfg.bgColor1) === '#111827';
  const glassClass = isLightBg
    ? 'border-black/10 bg-white/70'
    : 'border-white/15 bg-white/10';

  const titleFor = (link: LoadedProfile['links'][number]) =>
    (
      link.translations.find((item) => item.locale === viewLocale) ??
      link.translations.find(
        (item) => item.locale === profile.defaultLocale,
      ) ??
      link.translations[0]
    )?.title;

  // Социално доказателство без бисквитки: посещения този месец.
  let monthViews: number | null = null;
  if (styleCfg.showViews) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    monthViews = await prisma.clickEvent.count({
      where: {
        profileId: profile.id,
        linkId: null,
        createdAt: { gte: monthStart },
      },
    });
  }
  const greeting = GREETING_BY_LOCALE[viewLocale] ?? GREETING_BY_LOCALE.en;
  const shareUrl = `${process.env.PUBLIC_BASE_URL ?? ''}/u/${slug}`;

  // GEO: създателят като субект — Person/ProfilePage JSON-LD, sameAs от
  // публичните линкове (само истински http(s) цели, без tel:/vcard).
  const sameAs = profile.links
    .filter((link) => link.active && link.url?.startsWith('http'))
    .map((link) => link.url as string)
    .slice(0, 20);
  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    inLanguage: viewLocale,
    mainEntity: {
      '@type': 'Person',
      '@id': `${shareUrl}#person`,
      name: translation.displayName,
      description: translation.bio ?? undefined,
      url: shareUrl,
      ...(styleCfg.avatarUrl ? { image: styleCfg.avatarUrl } : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
    },
  };
  // Магазин активен → структуриран списък с продуктите (GEO/AI цитиране).
  const shopLive =
    profile.user.stripeAccountId &&
    profile.user.stripeChargesEnabled &&
    profile.products.length > 0;
  const productListJsonLd = shopLive
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: profile.products
          .map((product, index) => {
            const title =
              product.translations.find((tr) => tr.locale === viewLocale)
                ?.title ??
              product.translations.find(
                (tr) => tr.locale === profile.defaultLocale,
              )?.title ??
              product.translations[0]?.title;
            if (!title) return null;
            return {
              '@type': 'ListItem',
              position: index + 1,
              item: {
                '@type': 'Product',
                name: title,
                offers: {
                  '@type': 'Offer',
                  price: (product.priceCents / 100).toFixed(2),
                  priceCurrency: 'EUR',
                  availability: 'https://schema.org/InStock',
                  url: shareUrl,
                },
              },
            };
          })
          .filter(Boolean),
      }
    : null;
  // Стъпаловиден вход: всеки видим блок пристига с малко закъснение.
  let riseIndex = 0;
  const rise = () =>
    ({ '--delay': `${Math.min(riseIndex++ * 0.08, 1.2)}s` }) as React.CSSProperties;

  return (
    <main
      lang={viewLocale}
      dir={dirFor(viewLocale)}
      className={`relative flex min-h-screen flex-col items-center px-6 py-16 ${themeClass}`}
      style={{
        ...backgroundCss(styleCfg),
        color: baseTextColor,
        fontFamily: fontFamily(styleCfg),
      }}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            productListJsonLd ? [personJsonLd, productListJsonLd] : personJsonLd,
          ),
        }}
      />
      {/* Жива сцена върху фона — по избор от стиловия енджин */}
      {styleCfg.bgEffect !== 'none' && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {styleCfg.bgEffect === 'gradient' && (
            <div
              className="pf-gradient absolute inset-0"
              style={
                {
                  '--g1': styleCfg.bgColor1,
                  '--g2': styleCfg.bgColor2,
                } as React.CSSProperties
              }
            />
          )}
          {styleCfg.bgEffect === 'aurora' && (
            <>
              <div
                className="animate-aurora absolute -top-40 left-[-12%] h-[36rem] w-[36rem] rounded-full blur-3xl"
                style={{ backgroundColor: accent, opacity: 0.35 }}
              />
              <div
                className="animate-aurora-slow absolute -bottom-52 right-[-12%] h-[38rem] w-[38rem] rounded-full blur-3xl"
                style={{ backgroundColor: '#8b5cf6', opacity: 0.3 }}
              />
            </>
          )}
          {styleCfg.bgEffect === 'stars' && (
            <>
              {PF_STARS.map(([top, left, size, dur, delay]) => (
                <span
                  key={`${top}-${left}`}
                  className="star"
                  style={
                    {
                      top,
                      left,
                      width: size,
                      height: size,
                      '--dur': dur,
                      '--delay': delay,
                    } as React.CSSProperties
                  }
                />
              ))}
              <span className="comet" style={{ top: '12%', left: '4%' }} />
            </>
          )}
        </div>
      )}
      <div
        className={`relative w-full max-w-lg border shadow-2xl backdrop-blur-xl ${glassClass} ${
          styleCfg.buttonShape === 'square' ? 'rounded-none' : 'rounded-3xl'
        } px-5 py-10 sm:px-10 ${
          styleCfg.align === 'start' ? 'text-start' : 'text-center'
        }`}
      >
        <ShareButton
          url={shareUrl}
          qrSrc={`/u/${slug}/qr`}
          labels={{
            share: t('share'),
            copy: t('copyLink'),
            copied: t('copied'),
            scan: t('scanQr'),
          }}
        />
        {styleCfg.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- външен URL по избор на потребителя
          <img
            src={styleCfg.avatarUrl}
            alt=""
            width={96}
            height={96}
            className={`pf-pop pf-ring mb-5 h-24 w-24 object-cover shadow-xl ${avatarShapeClass} ${
              styleCfg.align === 'start' ? '' : 'mx-auto'
            }`}
            style={{ '--ring': accent } as React.CSSProperties}
          />
        )}
        <p
          className="pf-greet text-sm font-semibold uppercase tracking-[0.25em] opacity-60"
          style={{ color: accent }}
        >
          {greeting}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{translation.displayName}</h1>
        {translation.bio && (
          <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed opacity-75">{translation.bio}</p>
        )}
        {unsub && (
          <p
            role="status"
            className="mx-auto mt-3 max-w-sm rounded-lg border border-current/20 bg-current/5 px-3 py-2 text-xs opacity-80"
          >
            {t('unsubDone')}
          </p>
        )}

        {(available.length > 1 || monthViews !== null) && (
          <div
            className={`mt-3 flex flex-wrap gap-2 text-xs font-medium ${
              styleCfg.align === 'start' ? '' : 'justify-center'
            }`}
          >
            {available.length > 1 && (
              <span
                className="rounded-full border px-3 py-1"
                style={{
                  borderColor: `${accent}66`,
                  backgroundColor: `${accent}1a`,
                }}
              >
                {t('speaksLangs', { count: available.length })}
              </span>
            )}
            {monthViews !== null && (
              <span
                className="rounded-full border px-3 py-1"
                style={{
                  borderColor: `${accent}66`,
                  backgroundColor: `${accent}1a`,
                }}
              >
                {t('viewsBadge', {
                  count: new Intl.NumberFormat(viewLocale, {
                    notation: 'compact',
                  }).format(monthViews),
                })}
              </span>
            )}
          </div>
        )}

        {available.length > 1 && (
          <nav
            aria-label="Language"
            className={`mt-4 flex flex-wrap gap-2 ${
              styleCfg.align === 'start' ? '' : 'justify-center'
            }`}
          >
            {available.map((loc) => (
              <a
                key={loc}
                href={`/u/${slug}?hl=${loc}`}
                className={`rounded-full border px-3.5 py-1.5 text-xs transition-all duration-300 ${
                  loc === viewLocale
                    ? 'font-semibold'
                    : 'border-transparent opacity-60 hover:-translate-y-0.5 hover:opacity-100'
                }`}
                style={
                  loc === viewLocale
                    ? {
                        borderColor: accent,
                        backgroundColor: `${accent}26`,
                        boxShadow: `0 0 16px ${accent}55`,
                      }
                    : undefined
                }
              >
                {LOCALE_NAMES[loc as keyof typeof LOCALE_NAMES] ?? loc}
              </a>
            ))}
          </nav>
        )}

        <ul
          className={`mt-8 text-start ${
            styleCfg.layout === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'
          }`}
        >
          {profile.links.map((link) => {
            if (!isBlockVisible(link, new Date())) return null;
            const title = titleFor(link);
            if (!title) return null;
            const meta = (link.meta ?? null) as BlockMeta | null;
            const clickHref = `/u/${slug}/l/${link.id}?hl=${viewLocale}`;
            const brand = brandFor(link.url);
            const sensitive = isSensitiveUrl(link.url);

            switch (link.kind) {
              case 'HEADER':
                return (
                  <li key={link.id} className={`pf-rise pt-4 ${gridSpan}`} style={rise()}>
                    <div className="flex items-center gap-3">
                      <span aria-hidden className="h-px flex-1 bg-current opacity-15" />
                      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">
                        {title}
                      </h2>
                      <span aria-hidden className="h-px flex-1 bg-current opacity-15" />
                    </div>
                  </li>
                );
              case 'PHONE':
                return (
                  <li key={link.id} className="pf-rise" style={rise()}>
                    <a
                      href={link.url ?? '#'}
                      className={btnClass}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      <span className="inline-flex items-center gap-2">
                        <PhoneIcon className="h-4 w-4 shrink-0" />
                        {title}
                      </span>
                    </a>
                  </li>
                );
              case 'VIDEO': {
                const src = link.url ? videoEmbedSrc(link.url) : null;
                if (!src) return null;
                return (
                  <li key={link.id} className={`pf-rise ${gridSpan}`} style={rise()}>
                    <div
                      className={`overflow-hidden border ${boxShape}`}
                      style={{ borderColor: accentFor(meta) }}
                    >
                      <iframe
                        src={src}
                        title={title}
                        loading="lazy"
                        allowFullScreen
                        className="aspect-video w-full"
                      />
                    </div>
                  </li>
                );
              }
              case 'MUSIC':
                return (
                  <li key={link.id} className={`pf-rise ${gridSpan}`} style={rise()}>
                    <div
                      className={`border px-6 py-3 text-center ${boxShape} ${shadowClass}`}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      <p className="inline-flex items-center gap-2 font-semibold">
                        <MusicIcon className="h-4 w-4 shrink-0" />
                        {title}
                      </p>
                      <p className="mt-2 flex justify-center gap-3 text-sm">
                        {meta?.spotify && (
                          <a
                            href={`${clickHref}&svc=spotify`}
                            className="underline-offset-2 hover:underline"
                          >
                            Spotify
                          </a>
                        )}
                        {meta?.apple && (
                          <a
                            href={`${clickHref}&svc=apple`}
                            className="underline-offset-2 hover:underline"
                          >
                            Apple Music
                          </a>
                        )}
                      </p>
                    </div>
                  </li>
                );
              case 'FORM':
                return (
                  <li key={link.id} className={`pf-rise ${gridSpan}`} style={rise()}>
                    <div
                      className={`border px-6 py-4 ${boxShape} ${shadowClass}`}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      <p className="text-center font-medium">{title}</p>
                      {sent ? (
                        <p className="mt-3 text-center text-sm opacity-80">
                          {t('formSent')}
                        </p>
                      ) : (
                        <form
                          action={submitContactAction}
                          className="mt-3 space-y-2 text-sm"
                        >
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="hl" value={viewLocale} />
                          <input
                            type="text"
                            name="website"
                            tabIndex={-1}
                            autoComplete="off"
                            className="hidden"
                            aria-hidden="true"
                          />
                          <input
                            type="text"
                            name="name"
                            placeholder={t('formName')}
                            className="w-full rounded-lg border border-white/30 bg-transparent px-3 py-2 placeholder:opacity-60"
                          />
                          <input
                            type="email"
                            name="email"
                            placeholder={t('formEmail')}
                            className="w-full rounded-lg border border-white/30 bg-transparent px-3 py-2 placeholder:opacity-60"
                          />
                          <textarea
                            name="message"
                            required
                            rows={3}
                            placeholder={t('formMessage')}
                            className="w-full rounded-lg border border-white/30 bg-transparent px-3 py-2 placeholder:opacity-60"
                          />
                          {formError && (
                            <p className="text-xs text-red-300">
                              {t('formError')}
                            </p>
                          )}
                          {/* чл. 13 ОРЗД: информация в момента на събиране */}
                          <p className="text-[11px] leading-snug opacity-60">
                            {t('formConsent')}{' '}
                            <a
                              href={`/${viewLocale}/privacy`}
                              className="underline"
                            >
                              {t('formPrivacyLink')}
                            </a>
                          </p>
                          <button
                            type="submit"
                            className="w-full rounded-full border px-4 py-2 font-semibold transition hover:scale-[1.01]"
                            style={{ borderColor: accentFor(meta) }}
                          >
                            {t('formSend')}
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              case 'EMAIL':
                return (
                  <li key={link.id} className={`pf-rise ${gridSpan}`} style={rise()}>
                    <div
                      className={`border px-6 py-4 ${boxShape} ${shadowClass}`}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      <p className="text-center font-medium">{title}</p>
                      {subscribed ? (
                        <p className="mt-3 text-center text-sm opacity-80">
                          {subscribed === 'confirmed'
                            ? t('subConfirmed')
                            : t('subCheck')}
                        </p>
                      ) : (
                        <form
                          action={subscribeAction}
                          className="mt-3 space-y-2 text-sm"
                        >
                          <input type="hidden" name="slug" value={slug} />
                          <input type="hidden" name="hl" value={viewLocale} />
                          <input
                            type="text"
                            name="company"
                            tabIndex={-1}
                            autoComplete="off"
                            className="hidden"
                            aria-hidden="true"
                          />
                          <input
                            type="email"
                            name="email"
                            required
                            placeholder={t('formEmail')}
                            className="w-full rounded-lg border border-white/30 bg-transparent px-3 py-2 placeholder:opacity-60"
                          />
                          {subError && (
                            <p className="text-xs text-red-300">
                              {t('subError')}
                            </p>
                          )}
                          <label className="flex items-start gap-2 text-[11px] leading-snug opacity-70">
                            <input
                              type="checkbox"
                              name="consent"
                              required
                              className="mt-0.5 h-3.5 w-3.5 shrink-0"
                            />
                            <span>
                              {t('subConsent')}{' '}
                              <a
                                href={`/${viewLocale}/privacy`}
                                className="underline"
                              >
                                {t('formPrivacyLink')}
                              </a>
                            </span>
                          </label>
                          <button
                            type="submit"
                            className="w-full rounded-full border px-4 py-2 font-semibold transition hover:scale-[1.01]"
                            style={{ borderColor: accentFor(meta) }}
                          >
                            {t('subButton')}
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              // LINK, MAP, APP, TIP, VCARD — бутон през click redirect-а
              default: {
                const featured = meta?.featured === true;
                const brandColor = brand ? BRAND_COLORS[brand] : undefined;
                const icon = brand ? (
                  <BrandIcon
                    brand={brand}
                    className={featured ? 'h-6 w-6 shrink-0' : 'h-4 w-4 shrink-0'}
                  />
                ) : link.kind === 'MAP' ? (
                  <MapPinIcon className="h-4 w-4 shrink-0" />
                ) : link.kind === 'APP' ? (
                  <SmartphoneIcon className="h-4 w-4 shrink-0" />
                ) : link.kind === 'TIP' ? (
                  <HeartIcon className="h-4 w-4 shrink-0" />
                ) : link.kind === 'VCARD' ? (
                  <UserRoundPlusIcon className="h-4 w-4 shrink-0" />
                ) : null;
                const badge = sensitive && (
                  <span className="rounded border border-current px-1 text-[10px] font-bold leading-4 opacity-80">
                    18+
                  </span>
                );
                // Spotlight: голяма карта с дишащо сияние в акцента на блока.
                if (featured) {
                  return (
                    <li
                      key={link.id}
                      className={`pf-rise ${gridSpan}`}
                      style={rise()}
                    >
                      <a
                        href={clickHref}
                        className={`pf-spot block border px-6 py-6 text-center text-lg font-bold transition-all duration-200 hover:-translate-y-1 ${shapeClass}`}
                        style={
                          {
                            ...buttonCss(styleCfg, accentFor(meta)),
                            '--spot': accentFor(meta),
                          } as React.CSSProperties
                        }
                      >
                        <span className="inline-flex items-center gap-2.5">
                          {icon}
                          {title}
                          {badge}
                        </span>
                      </a>
                    </li>
                  );
                }
                return (
                  <li key={link.id} className="pf-rise" style={rise()}>
                    <a
                      href={clickHref}
                      className={`${btnClass}${brandColor ? ' pf-brand' : ''}`}
                      style={
                        {
                          ...buttonCss(styleCfg, accentFor(meta)),
                          ...(brandColor ? { '--brand': brandColor } : {}),
                        } as React.CSSProperties
                      }
                    >
                      <span className="inline-flex items-center gap-2">
                        {icon}
                        {title}
                        {badge}
                      </span>
                    </a>
                  </li>
                );
              }
            }
          })}
        </ul>

        {profile.user.stripeAccountId &&
          profile.user.stripeChargesEnabled &&
          profile.products.length > 0 && (
            <section className="mt-10 text-start">
              <h2 className="flex items-center justify-center gap-2 text-center text-sm font-semibold uppercase tracking-wide opacity-70">
                <ShoppingBagIcon className="h-4 w-4" />
                {t('shopTitle')}
              </h2>
              {shopError && (
                <p className="mt-2 text-center text-sm text-red-300">
                  {t('shopError')}
                </p>
              )}
              {couponError && (
                <p className="mt-2 text-center text-sm text-red-300">
                  {t('shopCouponError')}
                </p>
              )}
              {/* Дир. 2011/83 чл. 6а: роля на платформата + статут на продавача. */}
              <p className="mt-2 text-center text-[11px] leading-snug opacity-55">
                {t('shopSellerNote')}{' '}
                {profile.user.isTrader
                  ? t('sellerTrader')
                  : t('sellerPrivate')}
                .
              </p>
              <ul className="mt-4 space-y-3">
                {profile.products.map((product) => {
                  const productTr =
                    product.translations.find((tr) => tr.locale === viewLocale) ??
                    product.translations.find(
                      (tr) => tr.locale === profile.defaultLocale,
                    ) ??
                    product.translations[0];
                  const productTitle = productTr?.title;
                  if (!productTitle) return null;
                  return (
                    <li key={product.id}>
                      <form action={startProductPurchaseAction}>
                        <input type="hidden" name="slug" value={slug} />
                        <input type="hidden" name="hl" value={viewLocale} />
                        <input
                          type="hidden"
                          name="productId"
                          value={product.id}
                        />
                        <button
                          type="submit"
                          className={`flex w-full items-center justify-between gap-3 border px-6 py-3.5 text-start transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${shapeClass} ${shadowClass}`}
                          style={buttonStyle}
                        >
                          <span className="min-w-0">
                            <span className="block font-semibold">
                              {productTitle}
                            </span>
                            {productTr?.description && (
                              <span className="mt-0.5 block text-xs font-normal opacity-75">
                                {productTr.description}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-bold">
                            €{(product.priceCents / 100).toFixed(2)}
                          </span>
                        </button>
                        {/* Промо код (по избор) — отстъпката се прилага на сървъра */}
                        <input
                          type="text"
                          name="coupon"
                          autoComplete="off"
                          placeholder={t('shopCouponPlaceholder')}
                          className="mt-1.5 w-full rounded-lg border border-current/20 bg-current/5 px-3 py-1.5 text-xs uppercase tracking-wide placeholder:normal-case placeholder:opacity-50"
                        />
                        {/* ЗЗП чл. 57, т. 13 / Дир. 2011/83 чл. 16(м):
                            изрично съгласие за незабавна доставка =
                            загуба на 14-дневния отказ */}
                        <label className="mt-1.5 flex items-start gap-2 text-xs leading-snug opacity-80">
                          <input
                            type="checkbox"
                            name="waiver"
                            required
                            className="mt-0.5 h-4 w-4 shrink-0"
                          />
                          {t('shopWaiver')}
                        </label>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

        {!styleCfg.hideBadge && (
          <p className="mt-12 text-center">
            <Link
              href="/"
              className="inline-block rounded-full border border-current px-3 py-1 text-[11px] uppercase tracking-widest opacity-50 transition hover:opacity-90"
            >
              Linketto
            </Link>
          </p>
        )}
        {/* DSA чл. 16: път за сигнали — дискретен, но винаги наличен */}
        <p className={`${styleCfg.hideBadge ? 'mt-12' : 'mt-3'} text-center`}>
          <a
            href={`/u/${slug}/report?hl=${viewLocale}`}
            rel="nofollow"
            className="text-[11px] opacity-40 transition hover:underline hover:opacity-80"
          >
            {t('report')}
          </a>
        </p>
      </div>
    </main>
  );
}

function hostOf(referer: string | null): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).host;
  } catch {
    return undefined;
  }
}
