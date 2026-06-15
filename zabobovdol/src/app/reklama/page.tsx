import type { Metadata } from "next";
import { PageHero } from "@/components/ui";
import { buildMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";
import { AdRequestForm } from "@/components/AdRequestForm";

export const metadata: Metadata = buildMetadata({
  title: "Рекламирайте в За Бобов дол — банер на началната страница за 20€/месец",
  description:
    "Достигнете до жителите на Бобов дол с банер на началната страница. Символична цена от 20€ на месец. Подкрепете местния проект и Вашия бизнес.",
  path: "/reklama",
});

const BENEFITS = [
  {
    t: "Местна аудитория",
    d: "Виждат Ви точно хората от Бобов дол и района — Вашите реални клиенти.",
  },
  {
    t: "Видно място",
    d: "Банерът е на началната страница, която отварят всички посетители.",
  },
  {
    t: "Символична цена",
    d: "Само 20€ на месец — достъпно за всеки местен бизнес и занаятчия.",
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

export default function ReklamaPage() {
  return (
    <>
      <PageHero
        title="Рекламирайте в „За Бобов дол“"
        intro="Достигнете до жителите на града с банер на началната страница — на символична цена."
        crumbs={[{ name: "Реклама", path: "/reklama" }]}
      />

      <div className="container-content py-10">
        {/* Оферта */}
        <div className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
          <div className="prose-content max-w-none text-slate-700">
            <h2>Банер на началната страница</h2>
            <p>
              На началната страница на сайта има <strong>4 рекламни слота</strong>.
              Вашият банер се показва на видно място пред всички, които посещават{" "}
              {SITE.domain} — местни жители, които търсят услуги, телефони и
              информация за града.
            </p>
            <p>
              Банерът може да е с Ваша снимка/лого или текстов, и води към Ваш
              сайт, Facebook страница или телефон. Сменяме съдържанието при нужда.
            </p>

            <h2>Какво получавате</h2>
            <ul>
              {BENEFITS.map((b) => (
                <li key={b.t}>
                  <strong>{b.t}.</strong> {b.d}
                </li>
              ))}
            </ul>

            <h2>Как да заявите реклама</h2>
            <p>
              Попълнете кратката форма по-долу (трите си имена и имейл или
              телефон). Ще се свържем с Вас, ще подготвим банера и ще го пуснем
              бързо. Таксата от {SITE.payment.monthlyPriceEur}€ на месец се плаща
              лесно през Revolut. Подходящ размер на изображението е около
              600×320 пиксела.
            </p>
          </div>

          {/* Ценова карта */}
          <aside>
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
              <div className="text-sm font-medium uppercase tracking-wide text-brand-700">
                Рекламен банер
              </div>
              <div className="mt-2 text-4xl font-extrabold text-slate-900">
                20€{" "}
                <span className="text-base font-medium text-slate-500">/ месец</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Един слот на началната страница. Без скрити такси.
              </p>
              <ul className="mt-4 space-y-2 text-left text-sm text-slate-700">
                <li>✔ Снимка/лого или текстов банер</li>
                <li>✔ Връзка към сайт, Facebook или телефон</li>
                <li>✔ Промяна на съдържанието при нужда</li>
                <li>✔ Ясно обозначаване „Реклама“</li>
              </ul>
              <a href="#zayavka" className="btn-primary mt-6 w-full">
                Заявете реклама
              </a>
              <a
                href={SITE.payment.revolut}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary mt-2 w-full"
              >
                Платете {SITE.payment.monthlyPriceEur}€ с Revolut
              </a>
            </div>
          </aside>
        </div>

        {/* Форма-образец за заявка */}
        <section id="zayavka" className="mt-12 scroll-mt-24">
          <h2 className="text-2xl font-bold text-slate-900">Заявка за реклама</h2>
          <p className="mt-1 text-slate-600">
            Оставете трите си имена и данни за връзка. Ще се свържем с Вас и ще
            подготвим банера.
          </p>
          <div className="mt-5 max-w-2xl rounded-xl border border-slate-200 bg-white p-6">
            <AdRequestForm
              paymentUrl={SITE.payment.revolut}
              price={SITE.payment.monthlyPriceEur}
            />
          </div>
        </section>

        <p className="mt-8 max-w-3xl text-sm text-slate-500">
          Запазваме си правото да не публикуваме реклами с невярно, обидно или
          незаконно съдържание. Рекламите не са препоръка от страна на проекта.
        </p>
      </div>
    </>
  );
}
