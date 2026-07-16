import type { Metadata } from "next";
import { ENTERPRISES } from "@/data/enterprises";
import { SECTORS } from "@/data/sectors";
import { PageHero, Section } from "@/components/ui";
import { SravnenieClient } from "@/components/SravnenieClient";
import { JsonLd } from "@/components/JsonLd";
import { buildMetadata, breadcrumbLd } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Сравнение на предприятия",
  description:
    "Сравнете две държавни предприятия едно до друго: сектор, принципал, парични потоци, индекс на прозрачност и известни случаи.",
  path: "/sravnenie",
});

const ORDER = SECTORS.map((s) => s.key);
const sorted = [...ENTERPRISES].sort((a, b) => {
  const s = ORDER.indexOf(a.sector) - ORDER.indexOf(b.sector);
  return s !== 0 ? s : a.name.localeCompare(b.name, "bg");
});

export default function ComparePage() {
  return (
    <>
      <JsonLd data={breadcrumbLd([{ name: "Начало", path: "/" }, { name: "Сравнение", path: "/sravnenie" }])} />
      <PageHero
        eyebrow="Инструмент"
        title="Сравнение на предприятия"
        intro="Изберете две държавни предприятия и ги вижте едно до друго."
        crumbs={[{ name: "Сравнение", path: "/sravnenie" }]}
      />
      <div className="container-content py-10">
        <Section>
          <SravnenieClient enterprises={sorted} />
        </Section>
      </div>
    </>
  );
}
