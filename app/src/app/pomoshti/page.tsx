import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ResourceCard, Callout, Sources } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "Пенсии и помощи",
  description:
    "Накъде да се обърнете за пенсия, помощ за отопление, ТЕЛК и социални помощи — институции, онлайн услуги и телефони, обяснени просто.",
  path: "/pomoshti",
});

export default function PomoshtiPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Пенсии и помощи", path: "/pomoshti" })} />
      <PageHero
        eyebrow="Социални"
        title="Пенсии и помощи"
        intro="Кой за какво отговаря и откъде да започнете — за пенсия, помощ за отопление, ТЕЛК и социална подкрепа."
        crumbs={[{ name: "Пенсии и помощи", path: "/pomoshti" }]}
      />

      <div className="container-content py-10">
        <Callout tone="info">
          Повечето заявления могат да се подадат на гише или онлайн. Ако ви е трудно
          онлайн, помолете близък или служител да ви помогне — имате право на помощ
          при попълването.
        </Callout>

        <section>
          <h2 className="section-title mb-4">Пенсии — НОИ</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Национален осигурителен институт (НОИ)"
              text="Отпускане и преизчисляване на пенсии, удостоверения и справки за осигурителен стаж."
              href="https://www.nssi.bg/"
              hrefLabel="nssi.bg"
            />
            <ResourceCard
              title="Електронни услуги на НОИ"
              text="Онлайн справки и заявления (някои изискват ПИК или електронен подпис)."
              href="https://www.nssi.bg/eservicebg/"
              hrefLabel="Е-услуги на НОИ"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Социални помощи и отопление</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Агенция за социално подпомагане"
              text="Целева помощ за отопление, месечни и еднократни социални помощи."
              href="https://asp.government.bg/"
              hrefLabel="asp.government.bg"
            />
            <ResourceCard
              title="Дирекция „Социално подпомагане“ — Дупница"
              text="Местната дирекция приема заявления и консултира. Адрес и телефон проверявайте на сайта на агенцията."
              href="https://asp.government.bg/bg/deynosti/sotsialno-podpomagane"
              hrefLabel="Как се кандидатства"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">ТЕЛК и здравни права</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Експертиза на работоспособността (ТЕЛК)"
              text="Информация за освидетелстване и преосвидетелстване чрез НЕЛК."
              href="https://nelk.bg/"
              hrefLabel="nelk.bg"
            />
            <ResourceCard
              title="Личен лекар и здравни услуги"
              text="Избор и смяна на личен лекар онлайн през НЗОК."
              href="https://pis.nhif.bg/main/"
              hrefLabel="Е-услуги на НЗОК"
            />
          </div>
        </section>

        <Sources
          items={[
            { label: "НОИ", url: "https://www.nssi.bg/" },
            { label: "Агенция за социално подпомагане", url: "https://asp.government.bg/" },
            { label: "НЗОК — персонализирана система", url: "https://pis.nhif.bg/main/" },
          ]}
        />
      </div>
    </>
  );
}
