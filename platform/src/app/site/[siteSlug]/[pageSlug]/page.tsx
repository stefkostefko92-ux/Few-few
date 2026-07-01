import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";
import { blocksToPlainText, pageUrl, siteJsonLd } from "@/lib/seo";

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
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug, pageSlug } = await params;
  const data = await loadPage(siteSlug, pageSlug);
  if (!data) return { title: "Страница", robots: { index: false } };
  const title = `${data.page.title} · ${data.site.name}`;
  const description =
    blocksToPlainText(parseBlocks(data.page.blocks)).slice(0, 155) || undefined;
  const url = pageUrl(data.site.slug, data.page.slug);
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: data.site.name,
      locale: "bg_BG",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

// Публична вътрешна страница на сайт, изграден в платформата.
export default async function SitePage({
  params,
}: {
  params: Promise<{ siteSlug: string; pageSlug: string }>;
}) {
  const { siteSlug, pageSlug } = await params;
  const data = await loadPage(siteSlug, pageSlug);
  if (!data) notFound();
  const jsonLd = siteJsonLd({
    siteName: data.site.name,
    siteSlug: data.site.slug,
    pageTitle: data.page.title,
    pageSlug: data.page.slug,
  });
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlockView blocks={parseBlocks(data.page.blocks)} />
    </div>
  );
}
