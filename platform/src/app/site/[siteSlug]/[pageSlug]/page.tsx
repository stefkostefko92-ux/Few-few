import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { PublicSiteView } from "@/components/PublicSiteView";
import { blocksToPlainText, pageUrl } from "@/lib/seo";
import { localeState, LOCALE_OG } from "@/lib/locale";

export const dynamic = "force-dynamic";

async function loadPage(siteSlug: string, pageSlug: string) {
  const site = await prisma.site.findUnique({ where: { slug: siteSlug } });
  if (!site) return null;
  const page = await prisma.page.findFirst({
    where: { siteId: site.id, slug: pageSlug, status: "PUBLISHED" },
  });
  return page ? { site, page } : null;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { siteSlug, pageSlug } = await params;
  const { lang } = await searchParams;
  const data = await loadPage(siteSlug, pageSlug);
  if (!data) return { title: "Страница", robots: { index: false } };

  const bgBlocks = parseBlocks(data.page.blocks);
  const enBlocks = parseBlocks(data.page.blocksEn);
  const { locale, showEn } = localeState(data.site.localeEn, lang, enBlocks.length);
  const primary = locale === "en" ? enBlocks : bgBlocks;
  const blocks = primary.length > 0 ? primary : bgBlocks; // резерв към BG
  const pageTitle =
    data.page.seoTitle ||
    (locale === "en" ? data.page.titleEn || data.page.title : data.page.title);
  const title = `${pageTitle} · ${data.site.name}`;
  const description =
    data.page.seoDescription || blocksToPlainText(blocks).slice(0, 155) || undefined;
  const bgUrl = pageUrl(data.site.slug, data.page.slug);
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

// Публична вътрешна страница на сайт, изграден в платформата.
export default async function SitePage({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { siteSlug, pageSlug } = await params;
  const { lang } = await searchParams;
  const data = await loadPage(siteSlug, pageSlug);
  if (!data) notFound();

  const base = `/site/${data.site.slug}`;
  return (
    <PublicSiteView
      site={data.site}
      page={data.page}
      lang={lang}
      hrefBase={base}
      homeHref={base}
      currentPath={`${base}/${data.page.slug}`}
    />
  );
}
