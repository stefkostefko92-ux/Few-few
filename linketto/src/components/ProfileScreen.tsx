import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { bestLocale, dirFor, LOCALE_NAMES } from '@/i18n/locales';
import { isBlockVisible, videoEmbedSrc, type BlockMeta } from '@/lib/blocks';
import {
  backgroundCss,
  buttonCss,
  buttonShadowClass,
  buttonShapeClass,
  fontFamily,
  parseStyle,
  readableOn,
} from '@/lib/style';
import { submitContactAction } from '@/app/actions/contact';
import { startProductPurchaseAction } from '@/app/actions/shop';

// Общото публично рендиране на профил — ползва се от /u/[slug]
// и от собствените домейни (/d/[domain] през middleware rewrite).

const THEME_CLASSES: Record<string, string> = {
  aurora:
    'bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white',
  mono: 'bg-white text-slate-900',
  dusk: 'bg-gradient-to-b from-rose-950 via-slate-900 to-slate-950 text-white',
};

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
        select: { stripeAccountId: true, stripeChargesEnabled: true },
      },
    },
  });
}

export type LoadedProfile = NonNullable<
  Awaited<ReturnType<typeof loadProfileBy>>
>;

export function profileMetadata(
  profile: LoadedProfile | null,
): Metadata {
  if (!profile || !profile.published) return { title: 'Linketto' };
  const fallback = profile.translations[0];
  const main =
    profile.translations.find((t) => t.locale === profile.defaultLocale) ??
    fallback;
  const languages: Record<string, string> = {};
  for (const translation of profile.translations) {
    languages[translation.locale] =
      `/u/${profile.slug}?hl=${translation.locale}`;
  }
  return {
    title: main?.displayName ?? profile.slug,
    description: main?.bio ?? undefined,
    alternates: { languages },
  };
}

export async function ProfileScreen({
  profile,
  hl,
  sent,
  formError,
  shopError,
}: {
  profile: LoadedProfile;
  hl?: string;
  sent?: string;
  formError?: string;
  shopError?: string;
}) {
  const slug = profile.slug;
  const available = profile.translations.map((t) => t.locale);
  const requestHeaders = await headers();
  let viewLocale: string;
  if (hl && available.includes(hl)) {
    viewLocale = hl;
  } else {
    viewLocale = bestLocale(
      requestHeaders.get('accept-language'),
      available,
      available.includes(profile.defaultLocale)
        ? profile.defaultLocale
        : available[0],
    );
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
  const btnClass = `block border px-6 py-3 text-center font-medium transition hover:scale-[1.02] ${shapeClass} ${shadowClass}`;
  const gridSpan = styleCfg.layout === 'grid' ? 'col-span-2' : '';
  const buttonStyle = buttonCss(styleCfg, accent);
  const avatarShapeClass =
    styleCfg.avatarShape === 'circle'
      ? 'rounded-full'
      : styleCfg.avatarShape === 'rounded'
        ? 'rounded-2xl'
        : '';

  const titleFor = (link: LoadedProfile['links'][number]) =>
    (
      link.translations.find((item) => item.locale === viewLocale) ??
      link.translations.find(
        (item) => item.locale === profile.defaultLocale,
      ) ??
      link.translations[0]
    )?.title;

  return (
    <main
      lang={viewLocale}
      dir={dirFor(viewLocale)}
      className={`flex min-h-screen flex-col items-center px-6 py-16 ${themeClass}`}
      style={{
        ...backgroundCss(styleCfg),
        color: baseTextColor,
        fontFamily: fontFamily(styleCfg),
      }}
    >
      <div
        className={`w-full max-w-md ${
          styleCfg.align === 'start' ? 'text-start' : 'text-center'
        }`}
      >
        {styleCfg.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- външен URL по избор на потребителя
          <img
            src={styleCfg.avatarUrl}
            alt=""
            width={96}
            height={96}
            className={`mb-4 h-24 w-24 object-cover ${avatarShapeClass} ${
              styleCfg.align === 'start' ? '' : 'mx-auto'
            }`}
          />
        )}
        <h1 className="text-2xl font-bold">{translation.displayName}</h1>
        {translation.bio && (
          <p className="mt-2 opacity-80">{translation.bio}</p>
        )}

        {available.length > 1 && (
          <nav aria-label="Language" className="mt-4 flex justify-center gap-2">
            {available.map((loc) => (
              <a
                key={loc}
                href={`/u/${slug}?hl=${loc}`}
                className={`rounded-full px-3 py-1 text-xs ${
                  loc === viewLocale
                    ? 'bg-white/20 font-semibold'
                    : 'opacity-60 hover:opacity-100'
                }`}
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

            switch (link.kind) {
              case 'HEADER':
                return (
                  <li key={link.id} className={`pt-4 text-center ${gridSpan}`}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">
                      {title}
                    </h2>
                  </li>
                );
              case 'PHONE':
                return (
                  <li key={link.id}>
                    <a
                      href={link.url ?? '#'}
                      className={btnClass}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      ☎ {title}
                    </a>
                  </li>
                );
              case 'VIDEO': {
                const src = link.url ? videoEmbedSrc(link.url) : null;
                if (!src) return null;
                return (
                  <li key={link.id} className={gridSpan}>
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
                  <li key={link.id} className={gridSpan}>
                    <div
                      className={`border px-6 py-3 text-center ${boxShape} ${shadowClass}`}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      <p className="font-medium">♪ {title}</p>
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
                  <li key={link.id} className={gridSpan}>
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
              // LINK, MAP, APP, TIP, VCARD — бутон през click redirect-а
              default:
                return (
                  <li key={link.id}>
                    <a
                      href={clickHref}
                      className={btnClass}
                      style={buttonCss(styleCfg, accentFor(meta))}
                    >
                      {link.kind === 'MAP' && '📍 '}
                      {link.kind === 'APP' && '📲 '}
                      {link.kind === 'TIP' && '💖 '}
                      {link.kind === 'VCARD' && '👤 '}
                      {title}
                    </a>
                  </li>
                );
            }
          })}
        </ul>

        {profile.user.stripeAccountId &&
          profile.user.stripeChargesEnabled &&
          profile.products.length > 0 && (
            <section className="mt-10 text-start">
              <h2 className="text-center text-sm font-semibold uppercase tracking-wide opacity-70">
                🛒 {t('shopTitle')}
              </h2>
              {shopError && (
                <p className="mt-2 text-center text-sm text-red-300">
                  {t('shopError')}
                </p>
              )}
              <ul className="mt-4 space-y-3">
                {profile.products.map((product) => {
                  const productTitle =
                    product.translations.find((tr) => tr.locale === viewLocale)
                      ?.title ??
                    product.translations.find(
                      (tr) => tr.locale === profile.defaultLocale,
                    )?.title ??
                    product.translations[0]?.title;
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
                          className={`flex w-full items-center justify-between border px-6 py-3 font-medium transition hover:scale-[1.02] ${shapeClass} ${shadowClass}`}
                          style={buttonStyle}
                        >
                          <span>{productTitle}</span>
                          <span className="font-bold">
                            €{(product.priceCents / 100).toFixed(2)}
                          </span>
                        </button>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

        {!styleCfg.hideBadge && (
          <p className="mt-12 text-center text-xs opacity-50">
            <Link href="/" className="hover:underline">
              Linketto
            </Link>
          </p>
        )}
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
