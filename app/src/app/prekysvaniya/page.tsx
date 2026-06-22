import type { Metadata } from "next";
import { buildMetadata, webPageLd } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { PageHero } from "@/components/ui";
import { ResourceCard, Sources, Callout } from "@/components/content";

export const metadata: Metadata = buildMetadata({
  title: "Прекъсвания на ток и вода",
  description:
    "Как да проверите планови и аварийни прекъсвания на ток и вода в Дупница: онлайн справки и денонощни телефони на Електрохолд (ЕРМ Запад) и ВиК Дупница.",
  path: "/prekysvaniya",
});

export default function PrekysvaniyaPage() {
  return (
    <>
      <JsonLd
        data={webPageLd({ name: "Прекъсвания на ток и вода", path: "/prekysvaniya" })}
      />
      <PageHero
        eyebrow="Комунални услуги"
        title="Прекъсвания на ток и вода"
        intro="Откъде да проверите дали има спиране на тока или водата във вашия район и на кого да се обадите."
        crumbs={[{ name: "Ток и вода", path: "/prekysvaniya" }]}
      />

      <div className="container-content py-10">
        <section>
          <h2 className="section-title mb-4">Ток — Електрохолд (ЕРМ Запад)</h2>
          <p className="max-w-3xl text-base text-slate-700">
            Дупница (област Кюстендил) се обслужва от Електроразпределителни мрежи
            Запад. Можете да проверите онлайн дали има планов ремонт или авария по
            вашия адрес, а при проблем да се обадите на денонощния телефон.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="Онлайн справка за прекъсвания"
              text="Проверка по адрес или клиентски номер — планови ремонти (зелено) и аварии (червено)."
              href="https://info.ermzapad.bg/webint/vok/avplan.php"
              hrefLabel="Отвори онлайн справката"
            />
            <ResourceCard
              title="Обслужване на клиенти"
              text="Денонощен телефон за сигнали и информация."
              phone="0700 10 010"
              href="https://ermzapad.bg/bg/za-klienta/prekusvania/"
              hrefLabel="Повече на сайта на ЕРМ Запад"
            />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="section-title mb-4">Вода — ВиК Дупница</h2>
          <p className="max-w-3xl text-base text-slate-700">
            Водоснабдяването в Дупница се поддържа от ВиК Дупница. Дружеството
            публикува съобщения за аварии на сайта си и има денонощен телефон.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <ResourceCard
              title="ВиК Дупница — аварии"
              text="Денонощен телефон при липса на вода или авария."
              phone="0701 594 20"
              href="https://vik-dupnitsa.bg/"
              hrefLabel="Сайт на ВиК Дупница"
            />
          </div>
          <Callout tone="warning">
            ВиК Кюстендил („Кюстендилска вода“) е <strong>друг</strong> оператор и
            не обслужва Дупница — за Дупница ползвайте контактите по-горе.
          </Callout>
        </section>

        <Sources
          items={[
            { label: "Електрохолд / ЕРМ Запад — прекъсвания", url: "https://ermzapad.bg/bg/za-klienta/prekusvania/" },
            { label: "ЕРМ Запад — онлайн справка аварии и ремонти", url: "https://info.ermzapad.bg/webint/vok/avplan.php" },
            { label: "ВиК Дупница", url: "https://vik-dupnitsa.bg/" },
          ]}
        />
      </div>
    </>
  );
}
