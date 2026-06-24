import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ResourceCard, Callout, Sources } from "@/components/content";
import { TaxInstallments } from "@/components/TaxInstallments";

export const metadata: Metadata = buildMetadata({
  title: "Местни данъци и срокове",
  description:
    "Как и къде да платите местните данъци и такси в Дупница — онлайн, в брой или по банков път — и какви са обичайните срокове.",
  path: "/danaci-srokove",
});

export default function DanaciPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Местни данъци и срокове", path: "/danaci-srokove" })} />
      <PageHero
        eyebrow="Пари"
        title="Данъци и срокове"
        intro="Данък върху имота, данък върху превозните средства и такса смет — къде и как да ги платите."
        crumbs={[{ name: "Данъци и срокове", path: "/danaci-srokove" }]}
      />

      <div className="container-content py-10">
        <section>
          <h2 className="section-title mb-4">Как да платите</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Проверка на задължения — Община Дупница"
              text="Онлайн справка за дължими местни данъци и такси."
              href="https://www.dupnitsa.bg/section-328-content.html"
              hrefLabel="Начини на плащане (общината)"
            />
            <ResourceCard
              title="Онлайн плащане през eGov"
              text="Плащане с банкова карта през националния портал."
              href="https://pay.egov.bg/"
              hrefLabel="pay.egov.bg"
            />
            <ResourceCard
              title="EasyPay / каси"
              text="Плащане в брой на каса на EasyPay и в Български пощи."
              href="https://www.easypay.bg/"
              hrefLabel="easypay.bg"
            />
            <ResourceCard
              title="На гише в общината"
              text="Плащане в брой или с карта на място в Дупница."
              href="https://www.dupnitsa.bg/"
              hrefLabel="Сайт на общината"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Обичайни срокове</h2>
          <div className="prose-content max-w-3xl text-slate-700">
            <ul>
              <li>
                Данък върху недвижимите имоти и такса битови отпадъци, както и
                данък върху превозните средства, обикновено се плащат на{" "}
                <strong>две вноски</strong> — често с краен срок около{" "}
                <strong>30 юни</strong> и <strong>31 октомври</strong>.
              </li>
              <li>
                Обикновено има <strong>отстъпка</strong>, ако платите целия данък
                наведнъж до пролетния срок (около края на април).
              </li>
            </ul>
          </div>
          <Callout tone="info">
            Точните срокове и размери за съответната година се определят от закона и
            от общината — проверявайте ги на сайта на Община Дупница, преди да
            платите.
          </Callout>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Калкулатор на вноските</h2>
          <TaxInstallments />
        </section>

        <Sources
          items={[
            { label: "Община Дупница — начини на плащане", url: "https://www.dupnitsa.bg/section-328-content.html" },
            { label: "Национален портал за плащане pay.egov.bg", url: "https://pay.egov.bg/" },
          ]}
        />
      </div>
    </>
  );
}
