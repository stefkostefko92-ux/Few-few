import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";
import { blocksToPlainText, pageUrl, siteJsonLd } from "@/lib/seo";

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
}: {
  params: Promise<{ siteSlug: string }>;
}): Promise<Metadata> {
  const { siteSlug } = await params;
  const data = await loadHome(siteSlug);
  if (!data) return { title: "Страница", robots: { index: false } };
  const title = `${data.page.title} · ${data.site.name}`;
  const description =
    blocksToPlainText(parseBlocks(data.page.blocks)).slice(0, 155) || undefined;
  const url = pageUrl(data.site.slug, "");
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true }, // публична страница — индексируема
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

// Публична начална страница на сайт, изграден в платформата.
export default async function SiteHome({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  const data = await loadHome(siteSlug);
  if (!data) notFound();
  const jsonLd = siteJsonLd({
    siteName: data.site.name,
    siteSlug: data.site.slug,
    pageTitle: data.page.title,
    pageSlug: "",
  });
  return (
    <div className="min-h-screen bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <BlockView blocks={parseBlocks(data.page.blocks)} siteSlug={data.site.slug} />
    </div>
  );
}
