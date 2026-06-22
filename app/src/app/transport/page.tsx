import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ResourceCard, Sources, Callout } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "Транспорт от и до Дупница",
  description:
    "Автобуси, влак, такси и споделено пътуване от и до Дупница: разписания, онлайн билети и телефони. Проверена информация с източници.",
  path: "/transport",
});

export default function TransportPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Транспорт от и до Дупница", path: "/transport" })} />
      <PageHero
        eyebrow="Придвижване"
        title="Транспорт"
        intro="Как да стигнете до и от Дупница — автобуси, влак, такси и споделено пътуване."
        crumbs={[{ name: "Транспорт", path: "/transport" }]}
      />

      <div className="container-content py-10">
        <Callout tone="info">
          Официалното разписание на градския транспорт на сайта на общината е
          остаряло. За най-сигурна и актуална информация се обадете на автогара
          Дупница: <a className="font-semibold underline" href="tel:070140854">0701 40854</a>.
        </Callout>

        <section className="mt-2">
          <h2 className="section-title mb-4">Автобуси</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Автогара Дупница"
              text="Информация за градски и междуградски линии и разписания."
              phone="0701 40854"
            />
            <ResourceCard
              title="Разписание (справочник)"
              text="Списък с направления и часове от автогара Дупница."
              href="https://bgrazpisanie.com/en/bus_station/dupnitsa"
              hrefLabel="Виж разписанието"
            />
            <ResourceCard
              title="Билети онлайн — Дупница ↔ София"
              text="Разписания и онлайн билети при частни превозвачи."
              href="https://www.busexpress.bg/en/destination/sofia/dupnitsa"
              hrefLabel="busexpress.bg"
            />
            <ResourceCard
              title="Сравни цени и часове"
              text="Агрегатор на автобусни линии и билети."
              href="https://www.obilet.com/en/bus-ticket/sofia-dupnitsa"
              hrefLabel="obilet.com"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Влак (БДЖ)</h2>
          <p className="max-w-3xl text-base text-slate-700">
            Дупница е на главната линия София–Кулата. Разписания и билети се
            проверяват в сайтовете на БДЖ.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Разписание на влаковете"
              text="Официално разписание за гара Дупница."
              href="https://razpisanie.bdz.bg/en/dupnica/sofia"
              hrefLabel="razpisanie.bdz.bg"
            />
            <ResourceCard
              title="Билети онлайн"
              text="Купуване на влакови билети онлайн."
              href="https://bileti.bdz.bg/"
              hrefLabel="bileti.bdz.bg"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Такси и споделено пътуване</h2>
          <Callout tone="warning">
            Конкретни таксиметрови телефони все още не са потвърдени от нас — вижте
            ги в раздел „Услуги и телефони“ с ясно обозначение и проверете, преди да
            разчитате на тях.
          </Callout>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Споделено пътуване"
              text="Платформи за споделяне на пътувания, които поддържат Дупница."
              href="https://www.sednakola.com/"
              hrefLabel="sednakola.com"
            />
            <ResourceCard
              title="BlaBlaCar"
              text="Споделени пътувания в България."
              href="https://www.blablacar.bg/"
              hrefLabel="blablacar.bg"
            />
          </div>
        </section>

        <Sources
          items={[
            { label: "Автогара Дупница (bgrazpisanie.com)", url: "https://bgrazpisanie.com/en/bus_station/dupnitsa" },
            { label: "busexpress.bg — София/Дупница", url: "https://www.busexpress.bg/en/destination/sofia/dupnitsa" },
            { label: "БДЖ разписание — Дупница", url: "https://razpisanie.bdz.bg/en/dupnica/sofia" },
            { label: "sednakola.com", url: "https://www.sednakola.com/" },
          ]}
        />
      </div>
    </>
  );
}
