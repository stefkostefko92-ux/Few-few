import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { plainText } from "@/lib/markdown";
import {
  duplicateRedirects,
  groupCategories,
  splitLead,
  type CategoryGroup,
  type GuideIndexItem,
} from "@/lib/howto";

export type GuideIndex = {
  /** Публикуваните ръководства без дублите — това се показва и влиза в sitemap. */
  guides: GuideIndexItem[];
  /** slug на дубъл → slug, който остава (за постоянно пренасочване). */
  redirects: Map<string, string>;
  categories: CategoryGroup[];
  bySlug: Map<string, GuideIndexItem>;
  categoryBySlug: Map<string, CategoryGroup>;
};

// Лек списък на всички публикувани ръководства — БЕЗ текста на отговора
// (по-рано /kak-da теглеше всичко и рендираше ~660 KB). `cache` събира
// повикванията от generateMetadata и страницата в една заявка на посещение.
export const getGuideIndex = cache(async (): Promise<GuideIndex> => {
  const rows = await prisma.faq.findMany({
    where: { published: true },
    select: {
      id: true,
      slug: true,
      question: true,
      category: true,
      tags: true,
      order: true,
      views: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ order: "asc" }, { slug: "asc" }],
  });
  const redirects = duplicateRedirects(rows);
  const guides = rows.filter((r) => !redirects.has(r.slug));
  const categories = groupCategories(guides);
  return {
    guides,
    redirects,
    categories,
    bySlug: new Map(guides.map((g) => [g.slug, g])),
    categoryBySlug: new Map(categories.map((c) => [c.slug, c])),
  };
});

/** Кратък откъс („отговорът отпред“) само за ръководствата на текущата страница. */
export async function getSnippets(ids: string[], max = 140): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.faq.findMany({
    where: { id: { in: ids } },
    select: { id: true, answer: true, seoDescription: true },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      plainText(r.seoDescription?.trim() || (splitLead(r.answer)?.lead ?? r.answer), max),
    ]),
  );
}
