import type { Metadata } from "next";
import { CheckCircle2 } from "@/components/icons";
import { PageHero, SectionHeader } from "@/components/ui";
import { FormLayout, NextSteps } from "@/components/FormLayout";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { eurText } from "@/lib/eur-text";
import { SECTION } from "@/lib/section-names";
import { AdRequestForm } from "@/components/AdRequestForm";
import { getAdSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const price = eurText((await getAdSettings()).priceEur);
  return buildMetadata({
    title: `Рекламирайте в „За Бобов дол“ — банер на началната страница за ${price} на месец`,
    description: `Достигнете до жителите на Бобов дол с банер на началната страница. Символична цена от ${price} на месец. Подкрепете местния проект и вашия бизнес.`,
    path: "/reklama",
    keywords: [
      "реклама Бобов дол",
      "рекламен банер Бобов дол",
      "реклама за местен бизнес",
      "евтина онлайн реклама Кюстендилска област",
      "банер на началната страница",
      "Carbon Stealth",
    ],
  });
}

const benefits = (price: string) => [
  {
    t: "Местна аудитория",
    d: "Виждат ви точно хората от Бобов дол и района — вашите реални клиенти.",
  },
  {
    t: "Видно място",
    d: "Банерът е на началната страница, която отварят всички посетители.",
  },
  {
    t: "Символична цена",
    d: `Само ${price} на месец — достъпно за всеки местен бизнес и занаятчия.`,
  },
  {
    t: "Лесна промяна",
    d: "Текстът, снимката и връзката на банера се обновяват бързо при поискване.",
  },
  {
    t: "Подкрепа за общността",
    d: "Приходите помагат сайтът да остане безплатен и полезен за всички.",
  },
  {
    t: "Прозрачност",
    d: "Всеки банер е ясно обозначен като „Реклама“ — честно към посетителите.",
  },
];

const INCLUDED = [
  "Снимка/лого или текстов банер",
  "Връзка към сайт, Facebook или телефон",
  "Промяна на съдържанието при нужда",
  "Ясно обозначаване „Реклама“",
];

// Домейнът се пренася само след „zabobovdol.“ (никога насред думата).
function DomainText() {
  const dot = SITE.domain.indexOf(".");
  if (dot < 0) return <>{SITE.domain}</>;
  return (
    <>
      {SITE.domain.slice(0, dot + 1)}
      <wbr />
      {SITE.domain.slice(dot + 1)}
    </>
  );
}

export default async function ReklamaPage() {
  const ad = await getAdSettings();
  const price = eurText(ad.priceEur);
  return (
    <>
      <PageHero
        eyebrow={SECTION.site}
        title="Рекламирайте в „За Бобов дол“"
        intro="Достигнете до жителите на града с банер на началната страница — на символична цена."
        crumbs={[{ name: "Реклама", path: "/reklama" }]}
      />

      <div className="container-content py-10">
        {/* Оферта */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="prose-content min-w-0 text-slate-700">
            <h2>Банер на началната страница</h2>
            <p>
              На началната страница на сайта има <strong>4 рекламни слота</strong>. Вашият банер
              се показва на видно място пред всички, които посещават <DomainText /> — местни
              жители, които търсят услуги, телефони и информация за града.
            </p>
            <p>
              Банерът може да е с ваша снимка/лого или текстов и води към ваш сайт, Facebook
              страница или телефон. Сменяме съдържанието при нужда.
            </p>

            <h2>Какво получавате</h2>
            <ul>
              {benefits(price).map((b) => (
                <li key={b.t}>
                  <strong>{b.t}.</strong> {b.d}
                </li>
              ))}
            </ul>

            <h2>Как да заявите реклама</h2>
            <p>
              Попълнете кратката форма по-долу (трите си имена и имейл или телефон).{" "}
              <strong>Първо ще се свържем с вас</strong>, за да уточним текста, изображението и
              връзката на рекламата. Таксата от {price} на месец се плаща през Revolut{" "}
              <strong>едва след като се уговорим</strong>. Подходящ размер на изображението е около
              600×320 пиксела.
            </p>
          </div>

          {/* Ценова карта — само „Заявете“. Връзката за плащане е в
              потвърждението на заявката (първо уговорка, после плащане). */}
          <aside aria-labelledby="cena-zaglavie" className="panel text-center">
            <h2 id="cena-zaglavie" className="label-caps">
              Рекламен банер
            </h2>
            <p className="mt-2 font-display text-4xl font-bold text-slate-900 tabular-nums">
              {price}
              <span className="font-sans text-base font-medium text-slate-600"> на месец</span>
            </p>
            <p className="mt-2 text-base text-slate-600">
              Един слот на началната страница. Без скрити такси.
            </p>
            <ul role="list" className="mt-4 space-y-2 text-left text-base text-slate-700">
              {INCLUDED.map((x) => (
                <li key={x} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-700" aria-hidden />
                  <span>{x}</span>
                </li>
              ))}
            </ul>
            <a href="#zayavka" className="btn-primary mt-6 w-full">
              Заявете реклама
            </a>
            <p className="callout-note mt-4 rounded-xl text-left text-base">
              <strong>Важно:</strong> не плащайте предварително. Първо ще се свържем с вас и ще се
              уговорим.
            </p>
          </aside>
        </div>

        {/* Заявка */}
        <section id="zayavka" aria-labelledby="zayavka-zaglavie" className="mt-12">
          <SectionHeader id="zayavka-zaglavie" title="Заявка за реклама" className="mb-3" />
          <p className="mb-6 max-w-3xl text-base text-slate-600">
            Оставете трите си имена и данни за връзка. Ще се свържем с вас и ще подготвим банера.
          </p>
          <FormLayout
            aside={
              <NextSteps
                steps={[
                  "Получаваме заявката.",
                  "Свързваме се с вас, за да уточним текста, изображението и връзката.",
                  <>Едва след уговорката плащате {price} на месец през Revolut.</>,
                ]}
              />
            }
          >
            <AdRequestForm paymentUrl={ad.revolutUrl} priceText={price} />
          </FormLayout>
        </section>

        <p className="mt-8 max-w-3xl text-base text-slate-600">
          Запазваме си правото да не публикуваме реклами с невярно, обидно или незаконно
          съдържание. Рекламите не са препоръка от страна на проекта.
        </p>
      </div>
    </>
  );
}
