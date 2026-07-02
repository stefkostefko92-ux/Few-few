import type { Site, Page } from "@prisma/client";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";
import { SiteChrome } from "@/components/blocks/SiteChrome";
import { siteJsonLd, safeJsonLd } from "@/lib/seo";
import { availableLocales, resolveLocale } from "@/lib/locale";
import { loadSiteNav } from "@/lib/site-nav";

// Общ изглед на публикуван сайт — ползва се и при обслужване по slug
// (/site/<slug>), и по собствен домейн/поддомейн (/_host). hrefBase="" за
// хост-обслужване, "/site/<slug>" за платформения адрес.
export async function PublicSiteView({
  site,
  page,
  lang,
  hrefBase,
  homeHref,
  currentPath,
}: {
  site: Site;
  page: Page;
  lang?: string;
  hrefBase: string;
  homeHref: string;
  currentPath: string;
}) {
  const byLocale = {
    bg: parseBlocks(page.blocks),
    en: parseBlocks(page.blocksEn),
    it: parseBlocks(page.blocksIt),
  } as const;
  const locales = availableLocales({
    localeEn: site.localeEn,
    enCount: byLocale.en.length,
    localeIt: site.localeIt,
    itCount: byLocale.it.length,
  });
  const locale = resolveLocale(locales, lang);
  const primary = byLocale[locale];
  const blocks = primary.length > 0 ? primary : byLocale.bg;
  const pageTitle =
    locale === "en"
      ? page.titleEn || page.title
      : locale === "it"
        ? page.titleIt || page.title
        : page.title;

  const nav = await loadSiteNav(site.id, hrefBase, locale, page.slug);
  const jsonLd = siteJsonLd({
    siteName: site.name,
    siteSlug: site.slug,
    pageTitle,
    pageSlug: page.slug,
  });

  return (
    <div lang={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />
      <SiteChrome
        siteName={site.name}
        homeHref={homeHref}
        currentPath={currentPath}
        logoUrl={site.logoUrl}
        brandColor={site.brandColor}
        fontFamily={site.fontFamily}
        navEnabled={site.navEnabled}
        nav={nav}
        locale={locale}
        locales={locales}
        footerText={site.footerText}
        privacyUrl={site.privacyUrl}
        premium={site.premium}
      >
        <BlockView blocks={blocks} siteSlug={site.slug} locale={locale} />
      </SiteChrome>
    </div>
  );
}
