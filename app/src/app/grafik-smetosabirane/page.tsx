import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { Callout, ResourceCard } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "График за сметосъбиране",
  description:
    "Кога се извозва битовият отпадък в Дупница и откъде да научите графика за вашия квартал.",
  path: "/grafik-smetosabirane",
});

export default function GrafikPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "График за сметосъбиране", path: "/grafik-smetosabirane" })} />
      <PageHero
        eyebrow="Чистота"
        title="График за сметосъбиране"
        intro="Кога да изнесете отпадъка и откъде да проверите графика за вашия квартал."
        crumbs={[{ name: "График за смет", path: "/grafik-smetosabirane" }]}
      />
      <div className="container-content py-10">
        <Callout tone="info">
          Към момента не открихме единен публичен онлайн график за извозване на
          отпадъка по квартали в Дупница. Най-точна информация дава Община Дупница.
          Щом съберем потвърден график, ще го публикуваме тук.
        </Callout>

        <div className="grid gap-5 sm:grid-cols-2">
          <ResourceCard
            title="Община Дупница"
            text="Официална информация за чистотата и таксата битови отпадъци."
            href="https://www.dupnitsa.bg/"
            hrefLabel="Сайт на общината"
          />
          <ResourceCard
            title="Подайте сигнал за нередност"
            text="Препълнен контейнер или нерегламентирано сметище? Подайте сигнал."
            href="/smetishta"
            hrefLabel="Към сигналите за сметища"
          />
        </div>
      </div>
    </>
  );
}
