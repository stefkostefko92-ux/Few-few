import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout, ResourceCard, Sources } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "Опознай Дупница",
  description:
    "Кратко представяне на Дупница: къде се намира, природата наоколо (Рила) и забележителности. Общ преглед с източници.",
  path: "/grada",
});

export default function GradaPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Опознай Дупница", path: "/grada" })} />
      <PageHero
        eyebrow="За града"
        title="Опознай Дупница"
        intro="Къде се намира градът, какво има наоколо и какво си заслужава да се види."
        crumbs={[{ name: "Опознай Дупница", path: "/grada" }]}
      />
      <div className="container-content py-10">
        <div className="prose-content max-w-3xl text-slate-700">
          <h2>Къде е Дупница</h2>
          <p>
            Дупница е град в Югозападна България, в Кюстендилска област, в
            подножието на планината Рила, в Дупнишката котловина край река Джерман.
            Градът е важен пътен възел на основното направление София–Кулата.
          </p>

          <h2>Природата наоколо</h2>
          <p>
            Близостта до Рила прави Дупница удобна изходна точка към планината —
            към курортни и туристически местности и към природни забележителности
            в района. Наблизо е и Рилският манастир — обект на световното културно
            наследство на ЮНЕСКО.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <ResourceCard
            title="Дупница на картата"
            text="Вижте местоположението и се ориентирайте."
            href="https://www.openstreetmap.org/search?query=Дупница"
            hrefLabel="Отвори картата (OpenStreetMap)"
          />
          <ResourceCard
            title="Рилски манастир"
            text="Световно наследство на ЮНЕСКО, недалеч от Дупница."
            href="https://www.rilskimanastir.org/"
            hrefLabel="Повече за манастира"
          />
        </div>

        <Callout tone="info">
          Това е кратък общ преглед. За подробности и проверка вижте свободната
          енциклопедия и официалните туристически източници.
        </Callout>

        <Sources
          items={[
            { label: "Дупница — Уикипедия", url: "https://bg.wikipedia.org/wiki/Дупница" },
            { label: "Рилски манастир", url: "https://www.rilskimanastir.org/" },
          ]}
        />
      </div>
    </>
  );
}
