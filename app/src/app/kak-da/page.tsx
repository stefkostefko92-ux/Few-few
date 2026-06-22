import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata, webPageLd, itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { HOWTOS, HOWTO_CATEGORIES } from "@/data/howto";

export const metadata: Metadata = buildMetadata({
  title: "Как да… — ръководства за е-услуги",
  description:
    "Стъпка по стъпка ръководства за често нужни електронни услуги и документи: местни данъци, личен лекар, записване на час, egov.bg и още.",
  path: "/kak-da",
});

export default function KakDaPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageLd({ name: "Как да…", path: "/kak-da", type: "CollectionPage" }),
          itemListLd(
            HOWTOS.map((h) => ({ name: h.title, path: `/kak-da/${h.slug}` })),
            "Ръководства „Как да…“",
          ),
        ]}
      />
      <PageHero
        eyebrow="Помощ"
        title="Как да…"
        intro="Кратки ръководства стъпка по стъпка за нещата, които често затрудняват — обяснени на прост език."
        crumbs={[{ name: "Как да…", path: "/kak-da" }]}
      />

      <div className="container-content py-10">
        {HOWTO_CATEGORIES.map((cat) => (
          <section key={cat} className="mb-10">
            <h2 className="section-title mb-5">{cat}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {HOWTOS.filter((h) => h.category === cat).map((h) => (
                <Link key={h.slug} href={`/kak-da/${h.slug}`} className="card group block">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {h.title}
                  </h3>
                  <p className="mt-2 text-base text-slate-600">{h.intro}</p>
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
