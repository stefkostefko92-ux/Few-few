import type { Metadata } from "next";
import { ENTERPRISES } from "@/data/enterprises";
import { SECTORS } from "@/data/sectors";
import { PRINCIPALS } from "@/data/principals";
import { PageHero } from "@/components/ui";
import { EnterpriseExplorer } from "@/components/EnterpriseExplorer";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd, canonical } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Държавните предприятия",
  description:
    "Списък на държавните предприятия в България с филтри по сектор и министерство-принципал. За всяко — как влизат и излизат парите му.",
  path: "/predpriyatiya",
});

// Сортираме по сектор, после по име за предвидим ред.
const SECTOR_ORDER = SECTORS.map((s) => s.key);
const sorted = [...ENTERPRISES].sort((a, b) => {
  const s = SECTOR_ORDER.indexOf(a.sector) - SECTOR_ORDER.indexOf(b.sector);
  return s !== 0 ? s : a.name.localeCompare(b.name, "bg");
});

export default async function EnterprisesPage({
  searchParams,
}: {
  searchParams: Promise<{ sector?: string; principal?: string }>;
}) {
  const sp = await searchParams;
  const initialSector = SECTORS.some((s) => s.key === sp.sector)
    ? (sp.sector as string)
    : "";
  const initialPrincipal = PRINCIPALS.some((p) => p.key === sp.principal)
    ? (sp.principal as string)
    : "";

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Държавни предприятия в България",
    numberOfItems: ENTERPRISES.length,
    itemListElement: sorted.map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.name,
      url: canonical(`/predpriyatiya/${e.slug}`),
    })),
  };

  return (
    <>
      <JsonLd
        data={[
          breadcrumbLd([
            { name: "Начало", path: "/" },
            { name: "Предприятия", path: "/predpriyatiya" },
          ]),
          itemListLd,
        ]}
      />
      <PageHero
        eyebrow="Каталог"
        title="Държавните предприятия"
        intro="Търсете и филтрирайте по сектор и министерство-принципал. Отворете предприятие, за да видите точно откъде влизат и къде излизат парите му."
        crumbs={[{ name: "Предприятия", path: "/predpriyatiya" }]}
      />
      <div className="container-content py-10">
        <EnterpriseExplorer
          enterprises={sorted}
          initialSector={initialSector}
          initialPrincipal={initialPrincipal}
        />
      </div>
    </>
  );
}
