import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { SearchClient, type SearchItem } from "./SearchClient";
import { PRIMARY_NAV } from "@/lib/site";
import { SERVICES, CATEGORY_LABELS } from "@/data/services";
import { GUIDES, guideSummary } from "@/data/guides";

export const metadata: Metadata = buildMetadata({
  title: "Търсене",
  description: "Намерете бързо услуга, телефон или ръководство из целия портал.",
  path: "/tarsene",
});

function buildIndex(): SearchItem[] {
  const items: SearchItem[] = [];

  for (const n of PRIMARY_NAV) {
    items.push({
      title: n.label,
      href: n.href,
      section: "Раздел",
      keywords: n.description ?? "",
    });
  }
  for (const s of SERVICES) {
    items.push({
      title: s.name,
      href: `/uslugi#${s.slug}`,
      section: `Услуги · ${CATEGORY_LABELS[s.category]}`,
      keywords: `${s.description ?? ""} ${s.phones.map((p) => p.number).join(" ")} ${s.address ?? ""}`,
    });
  }
  for (const g of GUIDES) {
    items.push({
      title: g.question,
      href: `/kak-da/${g.slug}`,
      section: `Как да · ${g.category}`,
      keywords: `${g.tags} ${guideSummary(g, 120)}`,
    });
  }
  return items;
}

export default async function TarsenePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const items = buildIndex();

  return (
    <>
      <JsonLd data={webPageLd({ name: "Търсене", path: "/tarsene" })} />
      <PageHero
        eyebrow="Намери бързо"
        title="Търсене"
        intro="Напишете дума и стигнете направо до услугата, телефона или ръководството."
        crumbs={[{ name: "Търсене", path: "/tarsene" }]}
      />
      <div className="container-content py-10">
        <SearchClient items={items} initialQuery={q ?? ""} />
      </div>
    </>
  );
}
