import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { safeJsonLd } from '@/lib/jsonld';
import { profileUrl } from '@/lib/profile-url';
import { SITE_URL } from '@/lib/seo';
import {
  DIALECT_LOCALES,
  dirFor,
  localeFromGeo,
  LOCALE_NAMES,
} from '@/i18n/locales';
import {
  isBlockVisible,
  pollPercentages,
  videoEmbedSrc,
  type BlockMeta,
} from '@/lib/blocks';
import { brandFor, isSensitiveUrl } from '@/lib/brands';
import { countryOf } from '@/lib/analytics';
import { BrandIcon, BRAND_COLORS } from '@/components/brand-icons';
import { ShareButton } from '@/components/ShareButton';
import { VideoFacade } from '@/components/VideoFacade';
import {
  backgroundCss,
  buttonShadowClass,
  buttonShapeClass,
  fontFamily,
  parseStyle,
  readableOn,
} from '@/lib/style';
import {
  THEME_DEFS,
  buttonVars,
  customVars,
  resolveProfileTheme,
  safeAccent,
  themeVars,
} from '@/lib/profile-themes';
import {
  GlobeIcon,
  HeartIcon,
  MapPinIcon,
  MusicIcon,
  PhoneIcon,
  ShoppingBagIcon,
  SmartphoneIcon,
  UserRoundPlusIcon,
} from '@/components/icons';
import { submitContactAction } from '@/app/actions/contact';
import { subscribeAction } from '@/app/actions/newsletter';
import { votePollAction } from '@/app/actions/poll';
import { submitBookingAction } from '@/app/actions/booking';

// Общото публично рендиране на профил — ползва се от /u/[slug]
// и от собствените домейни (/d/[domain] през middleware rewrite).

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
        // Същият ред като в таблото (равни позиции → по създаване).
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: { translations: true },
      },
      // Само продукти с линк за плащане на създателя (решение О-1).
      products: {
        where: { active: true, externalUrl: { not: null } },
        orderBy: { position: 'asc' },
        include: { translations: true },
      },
      user: {
        select: {
          isTrader: true,
          // Баджът „Създай своя“ носи реферала на собственика (вирусна верига).
          referralCode: true,
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
    // Диалектите nap/scn/lmo не са валидни hreflang кодове — извън набора.
    if (DIALECT_LOCALES.includes(translation.locale)) continue;
    languages[translation.locale] = `${path}?hl=${translation.locale}`;
  }
  languages['x-default'] = path;
  const title = `${main?.displayName ?? profile.slug} · Linketto`;
  // Генерирана social карта 1200×630 на гледания език (/u/<slug>/og).
  const ogImage = {
    url: `${path}/og${activeLocale ? `?hl=${activeLocale}` : ''}`,
    width: 1200,
    height: 630,
    alt: main?.displayName ?? profile.slug,
  };
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
      images: [ogImage],
    },
    twitter: { card: 'summary_large_image', images: [ogImage.url] },
  };
}

export async function ProfileScreen({
  profile,
  hl,
  sent,
  formError,
  subscribed,
  subError,
  unsub,
  voted,
  booked,
  bookError,
  preview = false,
}: {
  profile: LoadedProfile;
  hl?: string;
  sent?: string;
  formError?: string;
  subscribed?: string;
  subError?: string;
  unsub?: string;
  voted?: string;
  booked?: string;
  bookError?: string;
  /** Жив преглед от таблото: не се брои посещение, нищо не е кликаемо. */
  preview?: boolean;
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

  // Преглед на страницата — без бисквитки, без лични данни. Прегледът от
  // таблото не е посещение.
  if (!preview) await prisma.clickEvent
    .create({
      data: {
        profileId: profile.id,
        locale: viewLocale,
        referrerHost: hostOf(requestHeaders.get('referer')),
        country: countryOf(requestHeaders.get('cf-ipcountry')),
      },
    })
    .catch(() => undefined);

  // Стилов енджин — „персонализация до крайна степен“.
  const styleCfg = parseStyle(profile.style);
  const isTheme = styleCfg.bgStyle === 'theme';
  const themeId = resolveProfileTheme(profile.theme);
  const themeDef = THEME_DEFS[themeId];
  const accent = safeAccent(profile.accent);
  // Собствен фон (solid/gradient/image): цветът на текста идва от фона или
  // от избора на създателя; темата тогава не участва.
  const customFg =
    styleCfg.textColor ??
    (styleCfg.bgStyle === 'image' ? '#ffffff' : readableOn(styleCfg.bgColor1));
  const customLight =
    styleCfg.bgStyle !== 'image' && readableOn(styleCfg.bgColor1) !== '#ffffff';
  const rootStyle: React.CSSProperties = isTheme
    ? {
        ...themeVars(themeId),
        // Изричният цвят на текста от таблото важи и върху тема (както преди редизайна);
        // textColor е валидиран hex от zod схемата в lib/style.ts.
        ...(styleCfg.textColor
          ? ({
              '--pf-fg': styleCfg.textColor,
              '--pf-muted': `color-mix(in srgb, ${styleCfg.textColor} 76%, transparent)`,
            } as React.CSSProperties)
          : {}),
      }
    : {
        ...backgroundCss(styleCfg),
        ...customVars({ fg: customFg, light: customLight, accent }),
        color: customFg,
      };
  const auraOn = isTheme ? themeDef.aura : !customLight;
  const framed = isTheme && themeDef.cardAlways === true;
  const nameFont =
    isTheme && themeDef.displayName === 'serif' && styleCfg.font === 'sans'
      ? fontFamily({ ...styleCfg, font: 'serif' })
      : undefined;
  const accentFor = (meta: BlockMeta | null) =>
    meta?.color && /^#[0-9a-fA-F]{6}$/.test(meta.color) ? meta.color : accent;
  const shapeClass = buttonShapeClass(styleCfg);
  const shadowClass = buttonShadowClass(styleCfg);
  const boxShape =
    styleCfg.buttonShape === 'square' ? 'rounded-none' : 'rounded-2xl';
  // Плочката с иконата следва формата на бутона.
  const tileRadius =
    styleCfg.buttonShape === 'square'
      ? '0'
      : styleCfg.buttonShape === 'rounded'
        ? '0.7rem'
        : '9999px';
  const isGrid = styleCfg.layout === 'grid';
  const isStart = styleCfg.align === 'start';
  const btnClass = `pf-btn block min-h-[3.25rem] border px-3 py-2.5 font-semibold ${shapeClass} ${shadowClass}`;
  const gridSpan = isGrid ? 'col-span-2' : '';
  const bv = (a: string) =>
    buttonVars(styleCfg.buttonFill, a, isTheme, readableOn(a));
  // Бутон за изпращане във формите: плътен; ако панелът е плътен — обратен.
  const submitVars = (a: string): React.CSSProperties => {
    const ink = readableOn(a);
    return styleCfg.buttonFill === 'solid'
      ? ({
          '--b-bg': ink,
          '--b-fg': a,
          '--b-bd': ink,
          '--b-hbg': ink,
          '--b-hbd': ink,
        } as React.CSSProperties)
      : buttonVars('solid', a, isTheme, ink);
  };
  const submitClass =
    'pf-btn w-full min-h-11 rounded-full border px-4 py-2 font-semibold';
  const avatarShapeClass =
    styleCfg.avatarShape === 'circle'
      ? 'rounded-full'
      : styleCfg.avatarShape === 'rounded'
        ? 'rounded-2xl'
        : '';
  // Нечуплими пилюли: само рамка от цвета на текста (върху фона на темата
  // контрастът на второстепенния текст остава непроменен).
  const chipStyle: React.CSSProperties = {
    borderColor: 'color-mix(in srgb, var(--pf-fg) 26%, transparent)',
  };
  const dangerStyle: React.CSSProperties = { color: 'var(--pf-danger)' };
  // Съдържание на бутон: иконата в плочка отляво, заглавието в средата.
  const btnInner = (
    icon: React.ReactNode,
    title: string,
    badge?: React.ReactNode,
    big?: boolean,
  ) => (
    <span className="flex items-center gap-3">
      {icon && (
        <span
          className="pf-tile shrink-0"
          style={{ borderRadius: tileRadius }}
        >
          {icon}
        </span>
      )}
      <span
        className={`min-w-0 flex-1 break-words ${
          isStart ? 'text-start' : 'text-center'
        } ${big ? 'text-lg font-bold' : ''}`}
      >
        {title}
        {badge && <span className="ms-2 align-middle">{badge}</span>}
      </span>
      {icon && !isStart && !isGrid && (
        <span aria-hidden className="w-8 shrink-0" />
      )}
    </span>
  );

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
        linkId: null, productId: null,
        createdAt: { gte: monthStart },
      },
    });
  }
  // Гласове по анкета: агрегат по опция (без бисквитки/PII).
  const pollLinkIds = profile.links
    .filter((link) => link.kind === 'POLL')
    .map((link) => link.id);
  const pollCounts = new Map<string, number[]>();
  if (pollLinkIds.length > 0) {
    const rows = await prisma.pollVote.groupBy({
      by: ['linkId', 'optionIndex'],
      where: { linkId: { in: pollLinkIds } },
      _count: { _all: true },
    });
    for (const link of profile.links) {
      if (link.kind !== 'POLL') continue;
      const options = Array.isArray((link.meta as BlockMeta | null)?.options)
        ? ((link.meta as BlockMeta).options as string[])
        : [];
      const counts = options.map(
        (_, i) =>
          rows.find((r) => r.linkId === link.id && r.optionIndex === i)?._count
            ._all ?? 0,
      );
      pollCounts.set(link.id, counts);
    }
  }

  const greeting = GREETING_BY_LOCALE[viewLocale] ?? GREETING_BY_LOCALE.en;
  const initials = Array.from(translation.displayName.trim().split(/\s+/))
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
  // Споделянето ползва краткия линк (PROFILE_HOST); JSON-LD — canonical.
  const shareUrl = profileUrl(slug);
  const canonicalUrl = `${SITE_URL}/u/${slug}`;

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
      '@id': `${canonicalUrl}#person`,
      name: translation.displayName,
      description: translation.bio ?? undefined,
      url: canonicalUrl,
      ...(styleCfg.avatarUrl ? { image: styleCfg.avatarUrl } : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
    },
  };
  // Магазин активен → структуриран списък с продуктите (GEO/AI цитиране).
  const shopLive = profile.products.length > 0;
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
      className="relative flex min-h-screen flex-col items-center overflow-x-clip px-4 py-6 sm:px-6 sm:py-16"
      style={{
        ...rootStyle,
        fontFamily: fontFamily(styleCfg),
      }}
    >
      {preview && (
        // Прегледът е само за гледане: без кликове (не се броят) и без формуляри.
        <style>{'main a,main button,main input,main textarea,main select,main summary,main iframe{pointer-events:none}'}</style>
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(
            productListJsonLd ? [personJsonLd, productListJsonLd] : personJsonLd,
          ),
        }}
      />
      {/* Модна сцена на темата (chrome/acid) — само CSS, без SVG */}
      {isTheme && themeDef.scene && (
        <div aria-hidden className={`pf-scene pf-${themeDef.scene}`}>
          <span />
          <span />
          <span />
        </div>
      )}
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
        className={`pf-card ${framed ? 'pf-card-all px-4 pb-6' : 'px-1 pb-4'} ${auraOn ? 'pf-card-aura' : ''} relative w-full max-w-[30rem] pt-10 sm:px-10 sm:pb-10 sm:pt-12 ${
          styleCfg.buttonShape === 'square'
            ? 'rounded-none'
            : framed
              ? 'rounded-3xl'
              : 'sm:rounded-3xl'
        } ${isStart ? 'text-start' : 'text-center'}`}
        style={{ '--aura': accent } as React.CSSProperties}
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
            width={112}
            height={112}
            fetchPriority="high"
            decoding="async"
            className={`pf-pop pf-ring mb-6 h-28 w-28 object-cover shadow-xl ${avatarShapeClass} ${
              isStart ? '' : 'mx-auto'
            }`}
            style={{ '--ring': accent } as React.CSSProperties}
          />
        )}
        {!styleCfg.avatarUrl && initials && (
          // Без качена снимка: монограм в акцента — профилът не зее празен отгоре.
          <div
            aria-hidden
            className={`pf-pop pf-ring mb-6 flex h-28 w-28 select-none items-center justify-center text-4xl font-bold tracking-tight shadow-xl ${avatarShapeClass} ${
              isStart ? '' : 'mx-auto'
            }`}
            style={
              {
                '--ring': accent,
                background: `linear-gradient(140deg, ${accent}, color-mix(in srgb, ${accent} 62%, ${readableOn(accent) === '#ffffff' ? '#000000' : '#ffffff'}))`,
                color: readableOn(accent),
              } as React.CSSProperties
            }
          >
            {initials}
          </div>
        )}
        <p className="pf-muted text-sm font-medium">{greeting}</p>
        <h1
          className={`pf-name mt-0.5 font-bold leading-[1.1] tracking-tight ${
            nameFont ? 'text-[2.15rem] sm:text-4xl' : 'text-[1.85rem] sm:text-3xl'
          }`}
          style={nameFont ? { fontFamily: nameFont, fontWeight: 600 } : undefined}
        >
          {translation.displayName}
        </h1>
        {translation.bio && (
          <p
            className={`pf-bio pf-muted mt-3 max-w-sm text-[15px] leading-relaxed ${
              isStart ? '' : 'mx-auto'
            }`}
          >
            {translation.bio}
          </p>
        )}
        {unsub && (
          <p
            role="status"
            className="pf-note mx-auto mt-3 max-w-sm rounded-lg px-3 py-2 text-xs"
          >
            {t('unsubDone')}
          </p>
        )}

        {(available.length > 1 || monthViews !== null) && (
          <div
            className={`mt-4 flex flex-wrap gap-2 text-xs font-medium ${
              isStart ? '' : 'justify-center'
            }`}
          >
            {available.length > 1 && (
              <span className="pf-muted rounded-full border px-3 py-1" style={chipStyle}>
                {t('speaksLangs', { count: available.length })}
              </span>
            )}
            {monthViews !== null && (
              <span className="pf-muted rounded-full border px-3 py-1" style={chipStyle}>
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
            className={`pf-lang mt-3 flex flex-wrap gap-1.5 ${
              isStart ? '' : 'justify-center'
            }`}
          >
            {available.map((loc) => (
              <a
                key={loc}
                href={`/u/${slug}?hl=${loc}`}
                aria-current={loc === viewLocale ? 'true' : undefined}
                className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] ${
                  loc === viewLocale
                    ? 'font-semibold'
                    : 'pf-muted border-transparent hover:text-[color:var(--pf-fg)] hover:underline hover:underline-offset-4'
                }`}
                style={
                  loc === viewLocale
                    ? { borderColor: accent, borderWidth: 2 }
                    : undefined
                }
              >
                {LOCALE_NAMES[loc as keyof typeof LOCALE_NAMES] ?? loc}
              </a>
            ))}
          </nav>
        )}

        <ul
          className={`mt-7 text-start ${
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
                      <h2 className="pf-muted text-sm font-semibold">
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
                      style={bv(accentFor(meta))}
                    >
                      {btnInner(<PhoneIcon className="h-4 w-4" />, title)}
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
                      <VideoFacade
                        src={src}
                        title={title}
                        playLabel={t('videoPlay')}
                        accent={accentFor(meta)}
                      />
                    </div>
                  </li>
                );
              }
              case 'MUSIC':
                return (
                  <li key={link.id} className={`pf-rise ${gridSpan}`} style={rise()}>
                    <div
                      className={`pf-panel border px-5 py-3.5 text-center ${boxShape} ${shadowClass}`}
                      style={bv(accentFor(meta))}
                    >
                      <p className="inline-flex items-center gap-2 font-semibold">
                        <MusicIcon className="h-4 w-4 shrink-0" />
                        {title}
                      </p>
                      <p className="mt-2 flex justify-center gap-3 text-sm">
                        {meta?.spotify && (
                          <a
                            href={`${clickHref}&svc=spotify`}
                            className="inline-flex min-h-9 items-center underline underline-offset-4"
                          >
                            Spotify
                          </a>
                        )}
                        {meta?.apple && (
                          <a
                            href={`${clickHref}&svc=apple`}
                            className="inline-flex min-h-9 items-center underline underline-offset-4"
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
                      className={`pf-panel border px-5 py-4 ${boxShape} ${shadowClass}`}
                      style={bv(accentFor(meta))}
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
                            autoComplete="name"
                            aria-label={t('formName')}
                            placeholder={t('formName')}
                            className="pf-field"
                          />
                          <input
                            type="email"
                            name="email"
                            autoComplete="email"
                            aria-label={t('formEmail')}
                            placeholder={t('formEmail')}
                            className="pf-field"
                          />
                          <textarea
                            name="message"
                            required
                            rows={3}
                            aria-label={t('formMessage')}
                            placeholder={t('formMessage')}
                            className="pf-field"
                          />
                          {formError && (
                            <p className="text-xs font-medium" style={dangerStyle}>
                              {t('formError')}
                            </p>
                          )}
                          {/* чл. 13 ОРЗД: информация в момента на събиране */}
                          <p className="text-[11px] leading-snug opacity-80">
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
                            className={submitClass}
                            style={submitVars(accentFor(meta))}
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
                      className={`pf-panel border px-5 py-4 ${boxShape} ${shadowClass}`}
                      style={bv(accentFor(meta))}
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
                            autoComplete="email"
                            aria-label={t('formEmail')}
                            placeholder={t('formEmail')}
                            className="pf-field"
                          />
                          {subError && (
                            <p className="text-xs font-medium" style={dangerStyle}>
                              {t('subError')}
                            </p>
                          )}
                          <label className="flex items-start gap-2 text-[11px] leading-snug opacity-85">
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
                            className={submitClass}
                            style={submitVars(accentFor(meta))}
                          >
                            {t('subButton')}
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              case 'POLL': {
                const options = Array.isArray(meta?.options)
                  ? (meta.options as string[])
                  : [];
                const counts = pollCounts.get(link.id) ?? options.map(() => 0);
                const total = counts.reduce((sum, n) => sum + n, 0);
                const pct = pollPercentages(counts);
                const showResults = voted === link.id || total > 0;
                return (
                  <li
                    key={link.id}
                    id={`poll-${link.id}`}
                    className={`pf-rise ${gridSpan}`}
                    style={rise()}
                  >
                    <div
                      className={`pf-panel border px-5 py-4 ${boxShape} ${shadowClass}`}
                      style={bv(accentFor(meta))}
                    >
                      <p className="text-center font-medium">{title}</p>
                      <div className="mt-3 space-y-2">
                        {options.map((option, i) => (
                          <form
                            key={i}
                            action={votePollAction}
                            className="relative"
                          >
                            <input type="hidden" name="slug" value={slug} />
                            <input
                              type="hidden"
                              name="hl"
                              value={viewLocale}
                            />
                            <input
                              type="hidden"
                              name="linkId"
                              value={link.id}
                            />
                            <input
                              type="hidden"
                              name="optionIndex"
                              value={i}
                            />
                            <button
                              type="submit"
                              className="pf-poll-opt relative w-full overflow-hidden rounded-lg px-3 py-2 text-start text-sm"
                            >
                              {showResults && (
                                <span
                                  className="pf-poll-bar absolute inset-y-0 start-0"
                                  style={{ width: `${pct[i]}%` }}
                                  aria-hidden="true"
                                />
                              )}
                              <span className="relative flex justify-between gap-2">
                                <span>{option}</span>
                                {showResults && (
                                  <span className="font-semibold">
                                    {pct[i]}%
                                  </span>
                                )}
                              </span>
                            </button>
                          </form>
                        ))}
                      </div>
                      {showResults && (
                        <p className="mt-2 text-center text-[11px] opacity-75">
                          {t('pollVotes', { count: total })}
                        </p>
                      )}
                    </div>
                  </li>
                );
              }
              case 'BOOKING':
                return (
                  <li key={link.id} className={`pf-rise ${gridSpan}`} style={rise()}>
                    <div
                      className={`pf-panel border px-5 py-4 ${boxShape} ${shadowClass}`}
                      style={bv(accentFor(meta))}
                    >
                      <p className="text-center font-medium">{title}</p>
                      {booked ? (
                        <p className="mt-3 text-center text-sm opacity-80">
                          {t('bookingSent')}
                        </p>
                      ) : (
                        <form
                          action={submitBookingAction}
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
                            type="text"
                            name="name"
                            autoComplete="name"
                            aria-label={t('formName')}
                            placeholder={t('formName')}
                            className="pf-field"
                          />
                          <input
                            type="email"
                            name="email"
                            required
                            autoComplete="email"
                            aria-label={t('formEmail')}
                            placeholder={t('formEmail')}
                            className="pf-field"
                          />
                          <input
                            type="datetime-local"
                            name="preferredAt"
                            aria-label={t('bookingWhen')}
                            className="pf-field"
                          />
                          <textarea
                            name="message"
                            rows={2}
                            aria-label={t('bookingMessage')}
                            placeholder={t('bookingMessage')}
                            className="pf-field"
                          />
                          {bookError && (
                            <p className="text-xs font-medium" style={dangerStyle}>
                              {t('subError')}
                            </p>
                          )}
                          <p className="text-[11px] leading-snug opacity-80">
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
                            className={submitClass}
                            style={submitVars(accentFor(meta))}
                          >
                            {t('bookingSend')}
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
                ) : (
                  <GlobeIcon className="h-4 w-4 shrink-0" />
                );
                const badge = sensitive && (
                  <span className="rounded border border-current px-1 text-[10px] font-bold leading-4">
                    18+
                  </span>
                );
                // Spotlight: голяма плътна карта в акцента с дишащо сияние.
                if (featured) {
                  const a = accentFor(meta);
                  const ink = readableOn(a);
                  const end = `color-mix(in srgb, ${a} 72%, ${ink === '#ffffff' ? '#000000' : '#ffffff'})`;
                  const grad = `linear-gradient(135deg, ${a}, ${end})`;
                  return (
                    <li
                      key={link.id}
                      className={`pf-rise ${gridSpan}`}
                      style={rise()}
                    >
                      <a
                        href={clickHref}
                        className={`pf-spot pf-sheen pf-btn block min-h-[4.5rem] border px-4 py-5 ${shapeClass}`}
                        style={
                          {
                            '--b-bg': grad,
                            '--b-hbg': grad,
                            '--b-fg': ink,
                            '--b-bd': a,
                            '--b-hbd': a,
                            '--spot': a,
                          } as React.CSSProperties
                        }
                      >
                        {btnInner(icon, title, badge, true)}
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
                          ...bv(accentFor(meta)),
                          ...(brandColor ? { '--brand': brandColor } : {}),
                        } as React.CSSProperties
                      }
                    >
                      {btnInner(icon, title, badge)}
                    </a>
                  </li>
                );
              }
            }
          })}
        </ul>

        {shopLive && (
          <section className="mt-10 text-start">
            <h2 className="pf-muted flex items-center justify-center gap-2 text-center text-sm font-semibold">
              <ShoppingBagIcon className="h-4 w-4" />
              {t('shopTitle')}
            </h2>
            {/* Дир. 2011/83 чл. 6а: продавачът е създателят (статут), Linketto
                не е страна по покупката — плащането е при него (решение О-1). */}
            <p className="pf-muted mt-2 text-center text-[11px] leading-snug">
              {t('shopSellerNote')} {profile.user.isTrader ? t('sellerTrader') : t('sellerPrivate')}.{' '}
              {t('shopExternalNote')}
            </p>
            <ul className="mt-4 space-y-3">
              {profile.products.map((product) => {
                const productTr =
                  product.translations.find((tr) => tr.locale === viewLocale) ??
                  product.translations.find((tr) => tr.locale === profile.defaultLocale) ??
                  product.translations[0];
                const productTitle = productTr?.title;
                if (!productTitle || !product.externalUrl) return null;
                return (
                  <li key={product.id}>
                    <a
                      href={`/u/${slug}/p/${product.id}?hl=${viewLocale}`}
                      target="_blank"
                      rel="nofollow noopener noreferrer ugc"
                      className={`pf-btn flex min-h-[3.5rem] w-full items-center justify-between gap-4 border px-5 py-3 text-start ${
                        styleCfg.buttonShape === 'pill' ? 'rounded-3xl' : shapeClass
                      } ${shadowClass}`}
                      style={bv(accent)}
                    >
                      <span className="min-w-0">
                        <span className="block font-semibold">{productTitle}</span>
                        {productTr?.description && (
                          <span className="mt-0.5 block text-xs font-normal opacity-80">
                            {productTr.description}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-base font-bold tabular-nums">
                        €{(product.priceCents / 100).toFixed(2)}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Вирусната верига: посетител → своя безплатна страница, с реферала
            на собственика (бонус при платен план). Абсолютен URL — работи и
            на собствен/кратък домейн. Скрива се само на платени планове. */}
        {!styleCfg.hideBadge && (
          <p className="mt-10 text-center">
            <a
              href={`${SITE_URL}/${viewLocale}/register${
                profile.user.referralCode
                  ? `?ref=${encodeURIComponent(profile.user.referralCode)}`
                  : ''
              }`}
              className="pf-muted inline-flex min-h-10 max-w-full flex-wrap items-center justify-center gap-x-2.5 gap-y-0.5 rounded-3xl border px-4 py-2 text-center text-[13px] font-medium transition-transform hover:-translate-y-px"
              style={chipStyle}
            >
              <span className="font-bold" style={{ color: 'var(--pf-fg)' }}>
                Linketto
              </span>
              <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-current opacity-40" />
              <span>{t('badgeCta')}</span>
            </a>
          </p>
        )}
        {/* DSA чл. 16: път за сигнали — дискретен, но винаги наличен */}
        <p className={`${styleCfg.hideBadge ? 'mt-10' : 'mt-2'} text-center`}>
          <a
            href={`/u/${slug}/report?hl=${viewLocale}`}
            rel="nofollow"
            className="pf-muted inline-flex min-h-10 items-center px-3 text-xs underline-offset-4 hover:underline"
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
