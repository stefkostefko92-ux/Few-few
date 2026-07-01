import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";
import { LanguageSwitcher } from "@/components/blocks/LanguageSwitcher";
import { blocksToPlainText, pageUrl, siteJsonLd } from "@/lib/seo";
import { parseLocale, LOCALE_OG } from "@/lib/locale";

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

  const hasEn = data.site.localeEn;
  const locale = hasEn ? parseLocale(lang) : "bg";
  const blocks =
    locale === "en" ? parseBlocks(data.page.blocksEn) : parseBlocks(data.page.blocks);
  const pageTitle =
    locale === "en" ? data.page.titleEn || data.page.title : data.page.title;
  const title = `${pageTitle} · ${data.site.name}`;
  const description = blocksToPlainText(blocks).slice(0, 155) || undefined;
  const bgUrl = pageUrl(data.site.slug, data.page.slug);
  const enUrl = `${bgUrl}?lang=en`;
  const url = locale === "en" ? enUrl : bgUrl;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      languages: hasEn ? { bg: bgUrl, en: enUrl, "x-default": bgUrl } : undefined,
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

  const hasEn = data.site.localeEn;
  const locale = hasEn ? parseLocale(lang) : "bg";
  const blocks =
    locale === "en" ? parseBlocks(data.page.blocksEn) : parseBlocks(data.page.blocks);
  const pageTitle =
    locale === "en" ? data.page.titleEn || data.page.title : data.page.title;

  const jsonLd = siteJsonLd({
    siteName: data.site.name,
    siteSlug: data.site.slug,
    pageTitle,
    pageSlug: data.page.slug,
  });
  return (
    <div className="min-h-screen bg-white" lang={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {hasEn && (
        <LanguageSwitcher
          basePath={`/site/${data.site.slug}/${data.page.slug}`}
          active={locale}
        />
      )}
      <BlockView blocks={blocks} siteSlug={data.site.slug} locale={locale} />
    </div>
  );
}
