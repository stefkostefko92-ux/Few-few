import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { getHonours } from "@/lib/data";
import { SITE } from "@/lib/site";
import { markdownToHtml } from "@/lib/markdown";
import { PageHero, Prose, EmptyState } from "@/components/ui";
import { JsonLd } from "@/components/JsonLd";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "История и постижения",
  description:
    "Историята на ФК „Миньор“ Бобов дол — от миньорските корени до днес, с ключови постижения.",
  path: "/istoriya",
});

export default async function HistoryPage() {
  const honours = await getHonours();

  return (
    <>
      <PageHero
        eyebrow="Корени и традиция"
        title="История и постижения"
        intro="Футболът в Бобов дол е неразривно свързан с миньорския труд и дух."
        crumbs={[{ name: "История", path: "/istoriya" }]}
      />
      <JsonLd
        data={webPageLd({
          name: "История и постижения",
          description: SITE.description,
          path: "/istoriya",
          type: "AboutPage",
        })}
      />
      <div className="container-content max-w-3xl py-10">
        <Prose
          html={markdownToHtml(
            "Организираният футбол в Бобов дол води началото си от **30-те години на XX век**. " +
              "През **1946 г.** дружеството приема името **„Миньор“** и преминава на издръжка към мина „Бобов дол“ — символ на връзката между отбора и миньорския труд. " +
              "През **1957 г.** е учредено Доброволното физкултурно дружество „Миньор“, а през **1985 г.** на негова основа е образуван футболният клуб.\n\n" +
              "Най-силните си години отборът преживява в средата на **2000-те**, когато се състезава в професионалния футбол. " +
              "През **2019 г.** клубът е възстановен под името **„Миньор 2019“** и продължава да носи жълто-черните цветове с гордост.",
          )}
        />

        <h2 className="section-title mb-6 mt-12">Ключови моменти</h2>
        {honours.length === 0 ? (
          <EmptyState title="Постиженията още не са въведени" />
        ) : (
          <ol className="relative space-y-6 border-l-2 border-gold-300 pl-6">
            {honours.map((h) => (
              <li key={h.id} className="relative">
                <span
                  className="absolute -left-[1.95rem] top-1 grid h-6 w-6 place-items-center rounded-full bg-gold-400 text-xs font-bold text-brand-900"
                  aria-hidden
                >
                  ●
                </span>
                <p className="text-sm font-bold uppercase tracking-wide text-gold-600">
                  {h.year}
                </p>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  {h.title}
                </h3>
                {h.description && (
                  <p className="mt-1 text-slate-600">{h.description}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
