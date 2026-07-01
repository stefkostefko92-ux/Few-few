import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";

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
  return { title: data ? `${data.page.title} · ${data.site.name}` : "Страница" };
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
  return (
    <div className="min-h-screen bg-white">
      <BlockView blocks={parseBlocks(data.page.blocks)} />
    </div>
  );
}
