import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PageHero } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, canonical, itemListLd, webPageLd } from "@/lib/seo";
import { getGuideIndex, getSnippets } from "@/lib/howto-index";
import {
  categoryPath,
  categorySlug,
  guidesLabel,
  pageCount,
  pageSlice,
  parsePageParam,
  topicPageFor,
  topicSectionOf,
} from "@/lib/howto";
import { GuideList } from "../../_components/GuideList";
import { Pagination } from "../../_components/Pagination";

export const dynamic = "force-dynamic";

type Params = Promise<{ cat: string }>;
type SP = Promise<{ page?: string | string[] }>;

// Темата и страницата от адреса. Непозната тема или страница извън обхвата → 404;
// изрично ?page=1 → постоянно към адреса без параметър (без дубликати).
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function resolve(params: Params, searchParams: SP) {
  const [{ cat }, sp] = await Promise.all([params, searchParams]);
  const index = await getGuideIndex();
  const page = parsePageParam(sp.page);
  const category = index.categoryBySlug.get(cat);
  if (!category) {
    // Име на кирилица в адреса („/kak-da/kategoriya/Еврото“) или стар адрес на
    // тема, слята с друга (CATEGORY_SYNONYMS) → постоянно (308) към каноничния.
    const alias = index.categoryBySlug.get(categorySlug(safeDecode(cat)));
    if (alias && page !== null) permanentRedirect(categoryPath(alias.slug, page));
    return null;
  }
  if (page === null) return null;
  if (sp.page !== undefined && page === 1) permanentRedirect(categoryPath(category.slug));
  const total = pageCount(category.count);
  if (page > total) return null;
  return { category, page, total };
}

function titleFor(name: string, page: number): string {
  return page > 1 ? `${name} — „Как да…“ (страница ${page})` : `${name} — ръководства „Как да…“`;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}): Promise<Metadata> {
  const r = await resolve(params, searchParams);
  if (!r) return buildMetadata({ title: "Не е намерено", noindex: true });
  const { category, page } = r;
  return buildMetadata({
    title: titleFor(category.name, page),
    description: `${guidesLabel(category.count)} на тема „${category.name}“ — обяснени стъпка по стъпка, на прост език, за жителите на Бобов дол.`,
    path: categoryPath(category.slug, page),
    keywords: [
      category.name,
      `${category.name} стъпка по стъпка`,
      "Как да",
      "ръководства за възрастни",
      "е-услуги",
      "Бобов дол",
      "Carbon Stealth",
    ],
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const r = await resolve(params, searchParams);
  if (!r) notFound();
  const { category, page, total } = r;

  const items = pageSlice(category.items, page);
  const snippets = await getSnippets(items.map((g) => g.id));
  const path = categoryPath(category.slug, page);
  const topic = topicPageFor(category.slug);
  const section = topicSectionOf(category.slug);

  return (
    <>
      {/* React 19 изнася <link> в <head>: последователност на страниците. */}
      {page > 1 && <link rel="prev" href={canonical(categoryPath(category.slug, page - 1))} />}
      {page < total && <link rel="next" href={canonical(categoryPath(category.slug, page + 1))} />}
      <JsonLd
        data={[
          webPageLd({
            name: titleFor(category.name, page),
            description: `Ръководства „Как да…“ на тема „${category.name}“.`,
            path,
            type: "CollectionPage",
          }),
          // Само ръководствата на ТАЗИ страница — списъкът отразява съдържанието ѝ.
          itemListLd(
            items.map((g) => ({ name: g.question, path: `/kak-da/${g.slug}` })),
            `„${category.name}“ — страница ${page} от ${total}`,
          ),
        ]}
      />
      <PageHero
        eyebrow={section?.title ?? "Ръководства"}
        title={category.name}
        intro={`${guidesLabel(category.count)} стъпка по стъпка.${
          total > 1 ? ` Страница ${page} от ${total}.` : ""
        }`}
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          { name: category.name, path: categoryPath(category.slug) },
        ]}
      />
      <div className="container-content py-10">
        {topic && (
          <p className="mb-6 text-base text-slate-700">
            Вижте и страницата{" "}
            <Link href={topic.href} className="link">
              „{topic.label}“
            </Link>
            .
          </p>
        )}
        <GuideList items={items.map((g) => ({ ...g, snippet: snippets.get(g.id) }))} />
        <Pagination page={page} total={total} href={(n) => categoryPath(category.slug, n)} />
        <p className="no-print mt-10">
          <Link href="/kak-da" className="btn-secondary">
            <span aria-hidden>←</span> Всички теми
          </Link>
        </p>
      </div>
    </>
  );
}
