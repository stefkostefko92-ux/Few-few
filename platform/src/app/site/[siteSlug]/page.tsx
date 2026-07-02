import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { PublicSiteView } from "@/components/PublicSiteView";
import { blocksToPlainText, pageUrl, publicSiteOrigin } from "@/lib/seo";
import { availableLocales, resolveLocale, langAlternates, LOCALE_OG } from "@/lib/locale";

export const dynamic = "force-dynamic";

async function loadHome(siteSlug: string) {
  // Само публикуван сайт (иначе чернова/непусната работа би се индексирала тук).
  const site = await prisma.site.findFirst({
    where: { slug: siteSlug, published: true },
  });
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

  const byLocale = {
    bg: parseBlocks(data.page.blocks),
    en: parseBlocks(data.page.blocksEn),
    it: parseBlocks(data.page.blocksIt),
  } as const;
  const locales = availableLocales({
    localeEn: data.site.localeEn, enCount: byLocale.en.length,
    localeIt: data.site.localeIt, itCount: byLocale.it.length,
  });
  const locale = resolveLocale(locales, lang);
  const primary = byLocale[locale];
  const blocks = primary.length > 0 ? primary : byLocale.bg;
  const localizedTitle =
    locale === "en" ? data.page.titleEn : locale === "it" ? data.page.titleIt : null;
  const pageTitle = data.page.seoTitle || localizedTitle || data.page.title;
  const title = `${pageTitle} · ${data.site.name}`;
  const description =
    data.page.seoDescription || blocksToPlainText(blocks).slice(0, 155) || undefined;
  // Ако сайтът има собствен хост (поддомейн/домейн), той е каноничният публичен
  // адрес. Тогава /site/<slug> е само вътрешен преглед → canonical сочи хоста и
  // НЕ индексираме този дублиращ път (иначе duplicate content на два хоста).
  const host = publicSiteOrigin(data.site);
  const bgUrl = host ? `${host}/` : pageUrl(data.site.slug, "");
  const url = locale === "bg" ? bgUrl : `${bgUrl}?lang=${locale}`;

  return {
    title,
    description,
    icons: data.site.faviconUrl ? { icon: data.site.faviconUrl } : undefined,
    alternates: {
      canonical: url,
      languages: langAlternates(bgUrl, locales),
    },
    robots: host ? { index: false, follow: true } : { index: true, follow: true },
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

  const base = `/site/${data.site.slug}`;
  return (
    <PublicSiteView
      site={data.site}
      page={data.page}
      lang={lang}
      hrefBase={base}
      homeHref={base}
      currentPath={base}
    />
  );
}
