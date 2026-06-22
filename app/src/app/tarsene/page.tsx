import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { SearchClient, type SearchItem } from "./SearchClient";
import { PRIMARY_NAV } from "@/lib/site";
import { SERVICES, CATEGORY_LABELS } from "@/data/services";
import { HOWTOS } from "@/data/howto";

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
  for (const h of HOWTOS) {
    items.push({
      title: h.title,
      href: `/kak-da/${h.slug}`,
      section: `Как да · ${h.category}`,
      keywords: h.intro,
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
