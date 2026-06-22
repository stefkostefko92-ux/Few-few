import Link from "next/link";
import type { Metadata } from "next";
import { buildMetadata, webPageLd, itemListLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { PRIMARY_NAV } from "@/lib/site";
import { ArrowRight } from "@/components/icons";

export const metadata: Metadata = buildMetadata({
  title: "Всички раздели",
  description: "Преглед на всички раздели на портала „За Дупница“.",
  path: "/razdeli",
});

export default function RazdeliPage() {
  return (
    <>
      <JsonLd
        data={[
          webPageLd({ name: "Всички раздели", path: "/razdeli", type: "CollectionPage" }),
          itemListLd(
            PRIMARY_NAV.map((n) => ({ name: n.label, path: n.href })),
            "Раздели на портала",
          ),
        ]}
      />
      <PageHero
        eyebrow="Навигация"
        title="Всички раздели"
        intro="Всичко, което порталът предлага, на едно място."
        crumbs={[{ name: "Всички раздели", path: "/razdeli" }]}
      />
      <div className="container-content py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRIMARY_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="card group block">
              <h2 className="font-display text-lg font-bold text-slate-900">
                {n.label}
              </h2>
              {n.description && (
                <p className="mt-2 text-base text-slate-600">{n.description}</p>
              )}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                Отвори
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
