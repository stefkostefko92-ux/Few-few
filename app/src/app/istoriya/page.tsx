import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout, Sources } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "История на Дупница",
  description:
    "Кратък преглед на историята на Дупница, включително смяната на името на града през XX век. Общ преглед с източник.",
  path: "/istoriya",
});

export default function IstoriyaPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "История на Дупница", path: "/istoriya" })} />
      <PageHero
        eyebrow="История"
        title="История на Дупница"
        intro="Накратко за миналото на града и как се е променяло името му."
        crumbs={[{ name: "История", path: "/istoriya" }]}
      />
      <div className="container-content py-10">
        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Накратко</h2>
          <p>
            Дупница е селище с дълга история в подножието на Рила. През вековете е
            било търговски и занаятчийски център в района, а по-късно се развива и
            като център на тютюневата промишленост.
          </p>

          <h2>Името на града</h2>
          <p>
            През XX век градът сменя името си: за периоди носи имената „Марек“ и
            „Станке Димитров“ (по време на социалистическия период). През 1990 г.
            е възстановено историческото име <strong>Дупница</strong>.
          </p>
        </div>

        <Callout tone="info">
          Това е съвсем кратък преглед. За подробна и проверена история разгледайте
          посочения източник и местните музейни сбирки.
        </Callout>

        <Sources
          items={[
            { label: "Дупница — Уикипедия", url: "https://bg.wikipedia.org/wiki/Дупница" },
          ]}
        />
      </div>
    </>
  );
}
