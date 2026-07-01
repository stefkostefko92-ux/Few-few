import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { siteByHost } from "@/lib/site-by-host";
import { PublicSiteView } from "@/components/PublicSiteView";
import { blocksToPlainText } from "@/lib/seo";
import { availableLocales, resolveLocale, langAlternates, LOCALE_OG } from "@/lib/locale";

export const dynamic = "force-dynamic";

// Обслужване на публикуван сайт по СОБСТВЕН домейн / наш поддомейн. Middleware
// пренаписва заявки от такива хостове насам; истинският хост е в заглавието Host.
async function resolve(path: string[] | undefined) {
  const h = await headers();
  const host = h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const site = await siteByHost(host);
  if (!site) return null;
  // Плоски slug-ове: дълбоки пътища (/a/b) не съществуват → чист 404.
  if (path && path.length > 1) return null;
  const slug = path?.[0] ?? "";
  const page = await prisma.page.findFirst({
    where: { siteId: site.id, slug, status: "PUBLISHED" },
  });
  if (!page) return null;
  return { site, page, slug, origin: `${proto}://${host.split(":")[0]}` };
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ lang?: string }>;
}): Promise<Metadata> {
  const { path } = await params;
  const { lang } = await searchParams;
  const data = await resolve(path);
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
  const bgUrl = data.slug ? `${data.origin}/${data.slug}` : data.origin;
  const url = locale === "bg" ? bgUrl : `${bgUrl}?lang=${locale}`;

  return {
    title,
    description,
    icons: data.site.faviconUrl ? { icon: data.site.faviconUrl } : undefined,
    alternates: {
      canonical: url,
      languages: langAlternates(bgUrl, locales),
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

export default async function HostSite({
  params,
  searchParams,
}: {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { path } = await params;
  const { lang } = await searchParams;
  const data = await resolve(path);
  if (!data) notFound();

  return (
    <PublicSiteView
      site={data.site}
      page={data.page}
      lang={lang}
      hrefBase=""
      homeHref="/"
      currentPath={data.slug ? `/${data.slug}` : "/"}
    />
  );
}
