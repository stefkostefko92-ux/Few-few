import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";
import { SiteChrome } from "@/components/blocks/SiteChrome";
import { blocksToPlainText, pageUrl, siteJsonLd } from "@/lib/seo";
import { localeState, LOCALE_OG } from "@/lib/locale";
import { loadSiteNav } from "@/lib/site-nav";

export const dynamic = "force-dynamic";

async function loadHome(siteSlug: string) {
  const site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) return null;
  const page = await prisma.page.findFirst({
    where: { siteId: site.id, slug: "", status: "PUBLISHED" },
  });
  return page ? { site, page } : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { siteSlug } = await params;
  const { lang } = await searchParams;
  const data = await loadHome(siteSlug);
  if (!data) return { title: "Страница", robots: { index: false } };

  const bgBlocks = parseBlocks(data.page.blocks);
  const enBlocks = parseBlocks(data.page.blocksEn);
  const { locale, showEn } = localeState(data.site.localeEn, lang, enBlocks.length);
  const primary = locale === "en" ? enBlocks : bgBlocks;
  const blocks = primary.length > 0 ? primary : bgBlocks; // резерв към BG
  const pageTitle =
    (data.page.seoTitle && data.page.seoTitle) ||
    (locale === "en" ? data.page.titleEn || data.page.title : data.page.title);
  const title = `${pageTitle} · ${data.site.name}`;
  const description =
    data.page.seoDescription || blocksToPlainText(blocks).slice(0, 155) || undefined;
  const bgUrl = pageUrl(data.site.slug, "");
  const enUrl = `${bgUrl}?lang=en`;
  const url = locale === "en" ? enUrl : bgUrl;

  return {
    title,
    description,
    icons: data.site.faviconUrl ? { icon: data.site.faviconUrl } : undefined,
    alternates: {
      canonical: url,
      languages: showEn ? { bg: bgUrl, en: enUrl, "x-default": bgUrl } : undefined,
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: data.site.name,
      locale: LOCALE_OG[locale],
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Публична начална страница на сайт, изграден в платформата.
export default async function SiteHome({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { siteSlug } = await params;
  const { lang } = await searchParams;
  const data = await loadHome(siteSlug);
  if (!data) notFound();

  const bgBlocks = parseBlocks(data.page.blocks);
  const enBlocks = parseBlocks(data.page.blocksEn);
  const { locale, showEn } = localeState(data.site.localeEn, lang, enBlocks.length);
  const primary = locale === "en" ? enBlocks : bgBlocks;
  const blocks = primary.length > 0 ? primary : bgBlocks; // резерв към BG
  const pageTitle =
    locale === "en" ? data.page.titleEn || data.page.title : data.page.title;

  const nav = await loadSiteNav(data.site.id, data.site.slug, locale, "");
  const jsonLd = siteJsonLd({
    siteName: data.site.name,
    siteSlug: data.site.slug,
    pageTitle,
    pageSlug: "",
  });
  return (
    <div lang={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteChrome
        siteName={data.site.name}
        siteSlug={data.site.slug}
        currentPath={`/site/${data.site.slug}`}
        logoUrl={data.site.logoUrl}
        brandColor={data.site.brandColor}
        fontFamily={data.site.fontFamily}
        navEnabled={data.site.navEnabled}
        nav={nav}
        locale={locale}
        showEn={showEn}
        footerText={data.site.footerText}
        privacyUrl={data.site.privacyUrl}
      >
        <BlockView blocks={blocks} siteSlug={data.site.slug} locale={locale} />
      </SiteChrome>
    </div>
  );
}
