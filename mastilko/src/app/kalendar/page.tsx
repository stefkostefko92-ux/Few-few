import type { Metadata } from "next";
import Image from "next/image";
import CalendarStudio from "@/components/studios/CalendarStudio";
import ToolFaq, { type Faq } from "@/components/ToolFaq";
import { pageMeta, toolJsonLd } from "@/lib/seo";

const TITLE = "Безплатен календар за печат с българските празници";
const DESC =
  "Направи месечен календар за печат на български — с официалните празници (вкл. Великден). За стена или бюро, всеки месец на лист А4. Безплатно, без регистрация.";

const HOWTO = {
  name: "Как да направиш календар за печат",
  steps: [
    "Избери месеца и годината.",
    "Остави отбелязването на официалните празници включено (или го изключи).",
    "Избери тема и принтирай листа А4 — за стена или бюро.",
  ],
};

const FAQ: Faq[] = [
  {
    q: "Показва ли българските празници?",
    a: "Да. Календарът отбелязва официалните празници в България, включително подвижните около Великден (изчислени по православната пасхалия).",
  },
  {
    q: "Може ли за цялата година?",
    a: "Правиш по един лист на месец — избираш месеца и принтираш. Така подреждаш пълен стенен календар от 12 листа.",
  },
  {
    q: "Данните ми къде отиват?",
    a: "Никъде. Календарът се създава изцяло в браузъра ти — нямаме база данни и нищо не се качва на сървър.",
  },
];

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  keywords: [
    "календар за печат",
    "календар 2026 българия",
    "календар с празници",
    "месечен календар",
    "стенен календар",
    "календар pdf",
  ],
  alternates: { canonical: "/kalendar" },
  ...pageMeta(TITLE, DESC, "/kalendar"),
};

export default function KalendarPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="no-print mb-8">
        <h1 className="font-display flex items-center gap-3 text-3xl font-bold sm:text-4xl">
          <Image src="/icons/gramoti.webp" alt="" width={56} height={56} unoptimized className="h-12 w-12 object-contain sm:h-14 sm:w-14" aria-hidden />
          Календар за печат
        </h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          <strong className="text-ink">Мастилко „Календар“ е безплатен инструмент за месечен календар за печат на български</strong>{" "}
          — с официалните празници, включително Великден. За стена или бюро.
          Всичко се създава в браузъра ти.
        </p>
      </header>
      <CalendarStudio />
      <ToolFaq items={FAQ} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            toolJsonLd({ name: "Календар за печат", path: "/kalendar", description: DESC, howTo: HOWTO, faq: FAQ }),
          ),
        }}
      />
    </div>
  );
}
