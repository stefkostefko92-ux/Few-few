import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";

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
  return { title: data ? `${data.page.title} · ${data.site.name}` : "Страница" };
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
  return (
    <div className="min-h-screen bg-white">
      <BlockView blocks={parseBlocks(data.page.blocks)} />
    </div>
  );
}
