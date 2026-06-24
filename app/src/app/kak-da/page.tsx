import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata, webPageLd, itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { GUIDES, guidesByCategory, guideSummary } from "@/data/guides";

export const metadata: Metadata = buildMetadata({
  title: "Как да… — ръководства стъпка по стъпка",
  description:
    "Над 500 кратки ръководства на прост език: телефон и интернет, е-услуги и документи, здраве, пари и банкиране, безопасност и измами, еврото и още — за жителите на Дупница.",
  path: "/kak-da",
});

export default function KakDaPage() {
  const groups = guidesByCategory();

  return (
    <>
      <JsonLd
        data={[
          webPageLd({ name: "Как да…", path: "/kak-da", type: "CollectionPage" }),
          itemListLd(
            GUIDES.slice(0, 100).map((g) => ({
              name: g.question,
              path: `/kak-da/${g.slug}`,
            })),
            "Ръководства „Как да…“",
          ),
        ]}
      />
      <PageHero
        eyebrow="Помощ"
        title="Как да…"
        intro={`${GUIDES.length} кратки ръководства стъпка по стъпка за нещата, които често затрудняват — обяснени на прост и спокоен език.`}
        crumbs={[{ name: "Как да…", path: "/kak-da" }]}
      />

      <div className="container-content py-10">
        {/* Бърза навигация по теми */}
        <nav aria-label="Теми" className="mb-10 rounded-2xl bg-slate-50 p-5">
          <h2 className="mb-3 font-display text-lg font-bold text-slate-900">
            Теми
          </h2>
          <ul className="flex flex-wrap gap-2">
            {groups.map((grp) => (
              <li key={grp.category}>
                <a
                  href={`#${slugId(grp.category)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700"
                >
                  {grp.category}
                  <span className="text-slate-600">({grp.guides.length})</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {groups.map((grp) => (
          <section key={grp.category} id={slugId(grp.category)} className="mb-12 scroll-mt-24">
            <h2 className="section-title mb-5">{grp.category}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {grp.guides.map((g) => (
                <Link
                  key={g.slug}
                  href={`/kak-da/${g.slug}`}
                  className="card group block"
                >
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {g.question}
                  </h3>
                  <p className="mt-2 text-base text-slate-600">
                    {guideSummary(g, 120)}
                  </p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                    Виж стъпките
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

// Безопасен HTML id от името на категория (за #anchor навигацията).
function slugId(name: string): string {
  return (
    "t-" +
    name
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
  );
}
