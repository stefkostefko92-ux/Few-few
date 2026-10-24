import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";
import { PageHero, EmptyState, FilterChips, SectionHeader } from "@/components/ui";
import { ChevronDown } from "@/components/icons";
import { SearchBar } from "@/components/SearchBar";
import { buildMetadata, webPageLd, itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { getGuideIndex, getSnippets, type GuideIndex } from "@/lib/howto-index";
import {
  categoryPath,
  categorySlug,
  guidesLabel,
  hasTag,
  pageCount,
  pageSlice,
  parsePageParam,
  sectionCategories,
  topByViews,
} from "@/lib/howto";
import { GuideCard, GuideList } from "./_components/GuideList";
import { Pagination } from "./_components/Pagination";

export const dynamic = "force-dynamic";

const TITLE = "Как да… — практични стъпки за е-услуги и документи";
const DESCRIPTION =
  "Лесни обяснения стъпка по стъпка, подредени по теми: как да ползвате електронни услуги, да извадите документи и да свършите ежедневни задачи онлайн в Бобов дол.";
const KEYWORDS = [
  "Как да",
  "е-услуги стъпка по стъпка",
  "ръководства за възрастни",
  "документи онлайн",
  "смартфон за начинаещи",
  "Бобов дол",
  "Carbon Stealth",
];
const POPULAR = 6;

type SP = Promise<{
  kat?: string | string[];
  tag?: string | string[];
  page?: string | string[];
}>;

const TagParam = z.string().trim().min(1).max(60);

function readTag(raw: string | string[] | undefined): string | null {
  const r = TagParam.safeParse(raw);
  return r.success ? r.data : null;
}

function tagPath(tag: string, page = 1): string {
  const q = `tag=${encodeURIComponent(tag)}`;
  return page > 1 ? `/kak-da?${q}&page=${page}` : `/kak-da?${q}`;
}

// Стар/кратък адрес ?kat=<име или slug> → постоянно към страницата на темата.
function redirectCategory(index: GuideIndex, raw: string | string[] | undefined) {
  if (typeof raw !== "string" || !raw.trim()) return;
  const c = index.categoryBySlug.get(categorySlug(raw));
  if (c) permanentRedirect(categoryPath(c.slug));
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  if (sp.kat !== undefined) redirectCategory(await getGuideIndex(), sp.kat);
  if (sp.tag !== undefined) {
    // Филтърът по етикет е удобство за хората, не отделна страница за търсачките.
    const tag = readTag(sp.tag);
    return buildMetadata({
      title: tag ? `Етикет „${tag}“ — Как да…` : "Как да…",
      description: DESCRIPTION,
      path: tag ? tagPath(tag) : "/kak-da",
      noindex: true,
      follow: true,
      keywords: KEYWORDS,
    });
  }
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: "/kak-da", keywords: KEYWORDS });
}

export default async function KakDaPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const index = await getGuideIndex();
  if (sp.kat !== undefined) redirectCategory(index, sp.kat);
  if (sp.tag !== undefined) return <TagView index={index} rawTag={sp.tag} rawPage={sp.page} />;

  const { categories, guides } = index;
  const popular = topByViews(guides, POPULAR).filter((g) => g.views > 0);

  const sections = sectionCategories(categories);

  return (
    <>
      <JsonLd
        data={[
          webPageLd({
            name: TITLE,
            description:
              "Обяснения стъпка по стъпка за е-услуги, документи и ежедневни задачи онлайн в Бобов дол, подредени по теми.",
            path: "/kak-da",
            type: "CollectionPage",
          }),
          ...(categories.length > 0
            ? [
                itemListLd(
                  categories.map((c) => ({ name: c.name, path: categoryPath(c.slug) })),
                  "Теми в „Как да…“",
                ),
              ]
            : []),
        ]}
      />
      <PageHero
        eyebrow="Ръководства"
        title="Как да…"
        intro="Кратки и разбираеми обяснения как да свършите ежедневни неща онлайн — без сложни думи. Изберете тема или потърсете с дума."
        crumbs={[{ name: "Как да…", path: "/kak-da" }]}
      />
      <div className="container-content space-y-12 py-10">
        <section aria-labelledby="tarsi" className="max-w-2xl">
          <h2 id="tarsi" className="section-title">
            Търсите нещо конкретно?
          </h2>
          <p className="mt-4 text-base text-slate-600">
            Напишете дума — например „пенсия“, „Viber“ или „лична карта“.
          </p>
          <div className="mt-3">
            <SearchBar />
          </div>
        </section>

        {guides.length === 0 ? (
          <EmptyState title="Скоро тук ще добавим полезни въпроси и отговори." />
        ) : (
          <>
            {popular.length > 0 && (
              <section aria-labelledby="nai-cheteni">
                <SectionHeader id="nai-cheteni" title="Най-четени" />
                <ul role="list" className="grid gap-4 md:grid-cols-2">
                  {popular.map((g) => (
                    <li key={g.id}>
                      <GuideCard guide={g} as="h3" />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="temi">
              <h2 id="temi" className="section-title">
                Всички теми
              </h2>
              <p className="mt-4 text-base text-slate-600">
                {guidesLabel(guides.length)} в {categories.length}{" "}
                {categories.length === 1 ? "тема" : "теми"}, подредени в {sections.length}{" "}
                {sections.length === 1 ? "раздел" : "раздела"}.
              </p>
              {sections.length > 1 && (
                <FilterChips
                  className="no-print mt-4"
                  label="Раздели на ръководствата"
                  items={sections.map((s) => ({ href: `#${s.id}`, label: s.title }))}
                />
              )}
            </section>

            {sections.map((s) => (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-zaglavie`}>
                <h2 id={`${s.id}-zaglavie`} className="section-title">
                  {s.title}
                </h2>
                {/* На телефон — компактен списък („Тема · 8 ръководства ›“) в една
                    карта; от sm — карти с трите най-четени и „Всички N“. */}
                <ul
                  role="list"
                  className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200/80 shadow-sm sm:grid sm:grid-cols-2 sm:gap-4 sm:divide-y-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:shadow-none lg:grid-cols-3"
                >
                  {s.categories.map((c) => (
                    <li
                      key={c.slug}
                      className="bg-white sm:flex sm:flex-col sm:rounded-2xl sm:border sm:border-slate-200/80 sm:p-5 sm:shadow-sm"
                    >
                      <h3 className="h-card">
                        <Link
                          href={categoryPath(c.slug)}
                          className="group flex min-h-[3.5rem] items-center gap-3 px-4 py-2 hover:text-brand-700 sm:min-h-tap sm:p-0 sm:underline-offset-4 sm:hover:underline"
                        >
                          <span className="min-w-0 flex-1">
                            {c.name}
                            <span className="block text-base font-normal text-slate-600 sm:hidden">
                              {guidesLabel(c.count)}
                            </span>
                          </span>
                          <ChevronDown
                            className="h-6 w-6 shrink-0 -rotate-90 text-brand-600 sm:hidden"
                            aria-hidden
                          />
                        </Link>
                      </h3>
                      <p className="text-meta hidden sm:block">{guidesLabel(c.count)}</p>
                      <ul role="list" className="mt-2 hidden sm:block">
                        {c.top.map((g) => (
                          <li key={g.id}>
                            <Link
                              href={`/kak-da/${g.slug}`}
                              className="link-quiet flex min-h-tap items-center py-1 text-base text-brand-700"
                            >
                              {g.question}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {c.count > c.top.length && (
                        <Link
                          href={categoryPath(c.slug)}
                          className="btn-secondary mt-auto hidden w-full sm:inline-flex"
                          aria-label={`Всички ${guidesLabel(c.count)} в темата „${c.name}“`}
                        >
                          Всички {c.count}
                          <span aria-hidden="true">→</span>
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </>
  );
}

async function TagView({
  index,
  rawTag,
  rawPage,
}: {
  index: GuideIndex;
  rawTag: string | string[] | undefined;
  rawPage: string | string[] | undefined;
}) {
  const tag = readTag(rawTag);
  const page = parsePageParam(rawPage);
  if (!tag || page === null) notFound();

  const matches = index.guides.filter((g) => hasTag(g, tag));
  const total = pageCount(matches.length);
  if (page > total) notFound();
  const items = pageSlice(matches, page);
  const snippets = await getSnippets(items.map((g) => g.id));

  return (
    <>
      <PageHero
        eyebrow="Ръководства"
        title={`Етикет „${tag}“`}
        intro={
          matches.length > 0
            ? `${guidesLabel(matches.length)} с този етикет.`
            : "Няма ръководства с този етикет."
        }
        crumbs={[
          { name: "Как да…", path: "/kak-da" },
          { name: `Етикет „${tag}“`, path: tagPath(tag) },
        ]}
      />
      <div className="container-content py-10">
        {matches.length === 0 ? (
          <EmptyState
            title="Няма ръководства с този етикет."
            hint="Разгледайте темите или потърсете с друга дума."
          />
        ) : (
          <>
            <GuideList
              items={items.map((g) => ({ ...g, snippet: snippets.get(g.id) }))}
            />
            <Pagination page={page} total={total} href={(n) => tagPath(tag, n)} />
          </>
        )}
        <p className="no-print mt-10">
          <Link href="/kak-da" className="btn-secondary">
            <span aria-hidden>←</span> Всички теми
          </Link>
        </p>
      </div>
    </>
  );
}
