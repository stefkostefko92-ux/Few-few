import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ResourceCard, Callout, Sources } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "Прозрачност — къде отиват парите",
  description:
    "Как да проследите обществените поръчки и бюджета на Община Дупница: ЦАИС ЕОП, платформата СИГМА, профил на купувача и финансови данни.",
  path: "/prozrachnost",
});

export default function ProzrachnostPage() {
  return (
    <>
      <JsonLd data={webPageLd({ name: "Прозрачност", path: "/prozrachnost" })} />
      <PageHero
        eyebrow="Обществен контрол"
        title="Прозрачност"
        intro="Публичните пари са на всички ни. Ето откъде сами да проверите обществените поръчки и бюджета на общината."
        crumbs={[{ name: "Прозрачност", path: "/prozrachnost" }]}
      />

      <div className="container-content py-10">
        <section>
          <h2 className="section-title mb-4">Обществени поръчки</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Платформа СИГМА"
              text="Държавна платформа за прозрачност, която проследява обществените поръчки по възложител и фирма."
              href="https://sigma.midt.bg/"
              hrefLabel="sigma.midt.bg"
            />
            <ResourceCard
              title="ЦАИС ЕОП — регистър на поръчките"
              text="Национална система за електронни обществени поръчки; търсене по възложител."
              href="https://app.eop.bg/today"
              hrefLabel="app.eop.bg"
            />
            <ResourceCard
              title="Профил на купувача — Дупница"
              text="Профилът на Община Дупница за обществени поръчки."
              href="https://e-obp.eu/bp/dupnitsa"
              hrefLabel="e-obp.eu/bp/dupnitsa"
            />
            <ResourceCard
              title="Агенция по обществени поръчки"
              text="Национален регистър и нормативна уредба."
              href="https://www2.aop.bg/"
              hrefLabel="aop.bg"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Бюджет и финанси</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Бюджет на Община Дупница"
              text="Публикувани бюджети и отчети на сайта на общината."
              href="https://www.dupnitsa.bg/"
              hrefLabel="Сайт на общината"
            />
            <ResourceCard
              title="Финансови показатели на общините"
              text="Министерство на финансите — данни по общини."
              href="https://www.minfin.bg/bg/810"
              hrefLabel="minfin.bg"
            />
          </div>
        </section>

        <Callout tone="info">
          Някои от тези портали зареждат данните динамично и понякога ограничават
          автоматичен достъп. Ако линк не се отвори веднага, опитайте директно в
          браузър или по-късно.
        </Callout>

        <Sources
          items={[
            { label: "СИГМА (МИДТ)", url: "https://sigma.midt.bg/" },
            { label: "ЦАИС ЕОП", url: "https://app.eop.bg/today" },
            { label: "Профил на купувача — Дупница", url: "https://e-obp.eu/bp/dupnitsa" },
            { label: "Министерство на финансите — общини", url: "https://www.minfin.bg/bg/810" },
          ]}
        />
      </div>
    </>
  );
}
