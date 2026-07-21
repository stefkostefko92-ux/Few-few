import type { Metadata } from "next";
import Image from "next/image";
import ObyavaStudio from "@/components/studios/ObyavaStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатна обява с откъсващи се телефончета";
const DESC =
  "Направи класическа обява с ресни за откъсване (телефонни номера) — за уроци, квартира, услуги, продажба. Печаташ на А4, залепваш, хората късат телефона. Безплатно, на български.";

const HOWTO = {
  name: "Как да направиш обява с откъсващи се телефони",
  steps: [
    "Напиши заглавието и текста на обявата (какво предлагаш).",
    "Въведи телефона — той се появява на всяка ресна за откъсване.",
    "Избери броя ресни и принтирай на А4; срежи по пунктира и залепи обявата.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Какво е обява с ресни?",
    a: "Класическа обява, при която долу има вертикални ленти (ресни) с телефонния номер. Всеки минувач откъсва една лента, за да запази номера ти.",
  },
  {
    q: "Колко телефончета има на лист?",
    a: "Избираш между 6 и 14 ресни на един лист А4. Всяка носи един и същ телефон/контакт.",
  },
  {
    q: "Данните ми отиват ли някъде?",
    a: "Не. Цялата обява се създава в браузъра ти — нямаме база данни и нищо не се качва на сървър.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "обява с ресни",
    "обява с откъсващи се телефони",
    "обява за печат",
    "обява за уроци",
    "обява за квартира",
    "обява шаблон",
  ],
  alternates: { canonical: "/obyava" },
  ...pageMeta(TITLE, DESC, "/obyava"),
};

export default function ObyavaPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/tabelki.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Обява с откъсващи се телефончета
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Обява“ е безплатен инструмент за класическа обява с ресни на български</strong>{" "}
          — долу има ленти с телефона ти, които минувачите откъсват. За уроци,
          квартира, услуги или продажба. Всичко се създава в браузъра ти.
        </p>
      </header>
      <ObyavaStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Обява с откъсващи се телефончета", path: "/obyava", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
