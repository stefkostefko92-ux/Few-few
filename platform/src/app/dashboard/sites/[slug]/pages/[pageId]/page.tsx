import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getSiteForUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { parseBlocks } from "@/lib/blocks";
import { PageBuilder } from "@/components/blocks/PageBuilder";
import { saveDraftAction, publishPageAction, assistTextAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditPage({
  params,
}: {
  params: Promise<{ slug: string; pageId: string }>;
}) {
  const { slug, pageId } = await params;
  const user = await requireUser();
  const found = await getSiteForUser(user, slug, "manage");
  if (!found) notFound();
  const page = await prisma.page.findFirst({
    where: { id: pageId, siteId: found.site.id },
  });
  if (!page) notFound();

  // В редактора показваме черновата (ако е празна — публикуваната версия).
  const draft = parseBlocks(page.draftBlocks);
  const initial = draft.length > 0 ? draft : parseBlocks(page.blocks);
  const publicPath = page.isHome
    ? `/site/${found.site.slug}`
    : `/site/${found.site.slug}/${page.slug}`;

  return (
    <div className="-mt-2">
      <div className="mb-2 flex items-baseline gap-2">
        <h1 className="text-lg font-semibold text-white">{page.title}</h1>
        <span className="text-xs text-ink-500">/{page.slug || "(начална)"}</span>
      </div>
      <PageBuilder
        slug={slug}
        previewHref={`/dashboard/sites/${slug}/pages/${page.id}/preview`}
        publicHref={publicPath}
        initialBlocks={initial}
        saveDraft={saveDraftAction.bind(null, slug, page.id)}
        publish={publishPageAction.bind(null, slug, page.id)}
        assist={assistTextAction.bind(null, slug)}
      />
    </div>
  );
}
