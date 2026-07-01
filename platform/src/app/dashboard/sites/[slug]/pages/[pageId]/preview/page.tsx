import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { BlockView } from "@/components/blocks/BlockView";

export const dynamic = "force-dynamic";

// Преглед на черновата (само за хора с достъп до сайта).
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ slug: string; pageId: string }>;
}) {
  const { slug, pageId } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "read");
  if (!found) notFound();
  const page = await prisma.page.findFirst({
    where: { id: pageId, siteId: found.site.id },
  });
  if (!page) notFound();

  const draft = parseBlocks(page.draftBlocks);
  const blocks = draft.length > 0 ? draft : parseBlocks(page.blocks);

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-xs text-amber-800">
        Преглед на чернова — не е публично видимо
      </div>
      <BlockView blocks={blocks} />
    </div>
  );
}
